import {
  createContext,
  MutableRefObject,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  InstancedMesh,
  Matrix4,
  NearestFilter,
  TextureLoader,
  Vector3,
  Vector3Tuple,
} from "three";
import { OrbitControls, Stats } from "@react-three/drei";
import { GUI } from "lil-gui";
import dirtTexture from "./assets/dirt.png";
import isEmpty from "lodash-es/isEmpty";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { useShallow } from "zustand/shallow";

// How to Choose the Right Terms for Your Use Case:
// If your context is physical (real-world measurements): Stick with length (X), width (Y), height (Z).
// If your context is computer graphics or game development: Use length (X), width (Z), height (Y).

const DEFAULT_CHUNK_COUNT = 1;
const DEFAULT_BLOCKS_PER_CHUNK_XZ = 16;
const DEFAULT_BLOCKS_PER_CHUNK_Y = 4;

enum BlockType {
  Air,
  Dirt,
}

interface Block {
  position: Vector3Tuple;
  type: BlockType;
  instanceId: number | null;
}

type BlocksXYZ = Block[][][];

type ChunksXY = BlocksXYZ[][];

interface AppState {
  world: {
    chunkGrid: ChunksXY;
    chunkCountX: number;
    chunkCountZ: number;
    blocksPerChunkX: number;
    blocksPerChunkZ: number;
    blocksPerChunkY: number;
    generate: (
      chunkCountX?: number,
      chunkCountZ?: number,
      blocksPerChunkX?: number,
      blocksPerChunkY?: number,
      blocksPerChunkZ?: number
    ) => void;
    threshold: number;
  };
}

const useAppStore = create<AppState>()(
  immer((set, get) => ({
    world: {
      chunkGrid: [] as ChunksXY,
      chunkCountX: DEFAULT_CHUNK_COUNT,
      chunkCountZ: DEFAULT_CHUNK_COUNT,
      blocksPerChunkX: DEFAULT_BLOCKS_PER_CHUNK_XZ,
      blocksPerChunkY: DEFAULT_BLOCKS_PER_CHUNK_Y,
      blocksPerChunkZ: DEFAULT_BLOCKS_PER_CHUNK_XZ,
      generate: (
        chunkCountX = DEFAULT_CHUNK_COUNT,
        chunkCountZ = DEFAULT_CHUNK_COUNT,
        blocksPerChunkX = DEFAULT_BLOCKS_PER_CHUNK_XZ,
        blocksPerChunkY = DEFAULT_BLOCKS_PER_CHUNK_Y,
        blocksPerChunkZ = DEFAULT_BLOCKS_PER_CHUNK_XZ
      ) => {
        set((state) => {
          state.world.chunkCountX = chunkCountX;
          state.world.chunkCountZ = chunkCountZ;
          state.world.blocksPerChunkX = blocksPerChunkX;
          state.world.blocksPerChunkY = blocksPerChunkY;
          state.world.blocksPerChunkZ = blocksPerChunkZ;

          state.world.chunkGrid = Array.from({ length: chunkCountX }).map(
            (_, chunkX) =>
              Array.from({ length: chunkCountZ }).map((_, chunkZ) =>
                Array.from({ length: blocksPerChunkX }).map((_, blockX) =>
                  Array.from({ length: blocksPerChunkY }).map((_, blockY) =>
                    Array.from({ length: blocksPerChunkZ }).map(
                      (_, blockZ) =>
                        ({
                          position: [
                            chunkX * blocksPerChunkX + blockX,
                            blockY,
                            chunkZ * blocksPerChunkZ + blockZ,
                          ],
                          type: Math.random() <= get().world.threshold ? 0 : 1,
                          instanceId: null,
                        } as Block)
                    )
                  )
                )
              )
          );
        });
      },
      threshold: 0.5,
    },
  }))
);

function Lights() {
  return (
    <>
      <directionalLight position={[1, 1, 1]} />
      <directionalLight position={[-1, 1, -0.5]} />
      <ambientLight intensity={0.1} />
    </>
  );
}

function Controls() {
  return <OrbitControls />;
}

function useGenerateWorld() {
  return useAppStore(useShallow((state) => state.world.generate));
}

function worldToBlockCoords(
  x: number,
  y: number,
  z: number,
  bX: number, // blocksPerChunkX
  bY: number, // blocksPerChunkY
  bZ: number // blocksPerChunkZ
) {
  const chunkX = Math.floor(x / bX);
  const chunkZ = Math.floor(z / bZ);
  const blockX = x % bX;
  const blockY = y % bY;
  const blockZ = z % bZ;

  return { chunkX, chunkZ, blockX, blockY, blockZ };
}

function getBlockRef(
  chunkGrid: ChunksXY,
  x: number,
  y: number,
  z: number,
  bX: number,
  bY: number,
  bZ: number
): Block | null {
  const { chunkX, chunkZ, blockX, blockY, blockZ } = worldToBlockCoords(
    x,
    y,
    z,
    bX,
    bY,
    bZ
  );
  return chunkGrid?.[chunkX]?.[chunkZ]?.[blockX]?.[blockY]?.[blockZ] ?? null;
}

function useBlocks() {
  const [chunkGrid, blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ] =
    useAppStore(
      useShallow(({ world }) => [
        world.chunkGrid,
        world.blocksPerChunkX,
        world.blocksPerChunkY,
        world.blocksPerChunkZ,
      ])
    );

  const blockList = useMemo(() => chunkGrid.flat(4), [chunkGrid]);
  const blockCount = useMemo(() => blockList.length, [blockList]);

  const getBlock = useCallback(
    (x: number, y: number, z: number) => {
      return getBlockRef(
        chunkGrid,
        x,
        y,
        z,
        blocksPerChunkX,
        blocksPerChunkY,
        blocksPerChunkZ
      );
    },
    [chunkGrid, blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ]
  );

  const setBlockType = useCallback(
    (x: number, y: number, z: number, type: BlockType) => {
      useAppStore.setState((state) => {
        const block = getBlockRef(
          state.world.chunkGrid,
          x,
          y,
          z,
          blocksPerChunkX,
          blocksPerChunkY,
          blocksPerChunkZ
        );
        if (block) {
          block.type = type;
        }
      });
    },
    [blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ]
  );

  const setBlockInstanceId = useCallback(
    (x: number, y: number, z: number, id: number) => {
      useAppStore.setState((state) => {
        const block = getBlockRef(
          state.world.chunkGrid,
          x,
          y,
          z,
          blocksPerChunkX,
          blocksPerChunkY,
          blocksPerChunkZ
        );
        if (block) {
          block.instanceId = id;
        }
      });
    },
    [blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ]
  );

  return {
    blockGrid: chunkGrid,
    blockList,
    blockCount,
    getBlock,
    setBlockType,
    setBlockInstanceId,
  };
}

function useWorldGui() {
  const guiRef = useDebugGuiRef();

  const [
    chunkCountX,
    chunkCountZ,
    blocksPerChunkX,
    blocksPerChunkZ,
    blocksPerChunkY,
    generateWorld,
    threshold,
  ] = useAppStore(
    useShallow(({ world }) => [
      world.chunkCountX,
      world.chunkCountZ,
      world.blocksPerChunkX,
      world.blocksPerChunkZ,
      world.blocksPerChunkY,
      world.generate,
      world.threshold,
    ])
  );

  useEffect(() => {
    // Take a snapshot of the current state to pass to lil-gui
    const chunkOptions = {
      chunkCountX,
      chunkCountZ,
      blocksPerChunkX,
      blocksPerChunkZ,
      blocksPerChunkY,
      threshold,
    };

    // Create the appropriate folder structure:
    const worldFolder = guiRef.current.addFolder("World");

    const chunkCountFolder = worldFolder.addFolder("Chunk count");
    const blockCountFolder = worldFolder.addFolder("Block count");
    const noiseFolder = worldFolder.addFolder("Noise");

    // Add controllers to alter chunks
    const chunkCountXController = chunkCountFolder
      .add(chunkOptions, "chunkCountX", 1, 8, 1)
      .name("X");
    const chunkCountZController = chunkCountFolder
      .add(chunkOptions, "chunkCountZ", 1, 8, 1)
      .name("Z");

    const blocksPerChunkXController = blockCountFolder
      .add(chunkOptions, "blocksPerChunkX", 1, 64, 1)
      .name("X");
    const blocksPerChunkYController = blockCountFolder
      .add(chunkOptions, "blocksPerChunkY", 1, 256, 1)
      .name("Y");
    const blocksPerChunkZController = blockCountFolder
      .add(chunkOptions, "blocksPerChunkZ", 1, 64, 1)
      .name("Z");

    noiseFolder
      .add(chunkOptions, "threshold", 0, 1)
      .name("Threshold")
      .onFinishChange(function (v: string) {
        useAppStore.setState((state) => {
          state.world.threshold = Number(v);
        });
      });

    // Add "Generate" button
    worldFolder
      .add(
        {
          action: () => {
            // Only update the store when the user clicks the "Generate" button
            generateWorld(
              chunkCountXController.getValue(),
              chunkCountZController.getValue(),
              blocksPerChunkXController.getValue(),
              blocksPerChunkYController.getValue(),
              blocksPerChunkZController.getValue()
            );
          },
        },
        "action"
      )
      .name("Generate");

    return () => {
      worldFolder.destroy();
    };
  }, [
    chunkCountX,
    chunkCountZ,
    blocksPerChunkX,
    blocksPerChunkZ,
    blocksPerChunkY,
    generateWorld,
    threshold,
    guiRef,
  ]);
}

function useFilteredTexture(input: string) {
  const texture = useLoader(TextureLoader, input);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

function World() {
  useWorldGui();

  const generateWorld = useGenerateWorld();
  const { blockList } = useBlocks();
  const solidBlockList = useMemo(
    () => blockList.filter((block) => block.type !== BlockType.Air),
    [blockList]
  );

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  useEffect(() => {
    generateWorld();
  }, [generateWorld]);

  useEffect(() => {
    const matrix = new Matrix4();

    // Set positions
    solidBlockList.forEach((block, index) => {
      const position = new Vector3(...block.position).addScalar(0.5).toArray();
      matrix.setPosition(...position);
      instancedMeshRef.current.setMatrixAt(index, matrix);
    });
    // Update the instance
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [solidBlockList]);

  // Set up the texture
  const texture = useFilteredTexture(dirtTexture);

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, solidBlockList.length]}
      >
        <boxGeometry />
        <meshStandardMaterial color="white" map={texture} flatShading />
      </instancedMesh>
    </group>
  );
}

const DebugGuiRefContext = createContext<MutableRefObject<GUI>>(null!);

function DebugGuiRefProvider({ children }: { children?: ReactNode }) {
  const gui = useRef<GUI>(null!);

  useEffect(() => {
    gui.current = new GUI();
    return () => {
      gui.current.destroy();
    };
  }, []);

  return (
    <DebugGuiRefContext.Provider value={gui}>
      {children}
    </DebugGuiRefContext.Provider>
  );
}

function useDebugGuiRef() {
  const context = useContext(DebugGuiRefContext);
  if (!context || isEmpty(context)) {
    throw new Error(
      "'useDebugGuiRef' can only be used in a child of 'DebugGuiRefProvider'."
    );
  }

  return context;
}

function Game() {
  return (
    <Canvas camera={{ position: [-16, 16, -16] }}>
      <Stats />
      <Lights />
      <Controls />
      <World />
    </Canvas>
  );
}

function App() {
  return (
    <DebugGuiRefProvider>
      <Game />
    </DebugGuiRefProvider>
  );
}

export default App;
