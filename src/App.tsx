import {
  createContext,
  MutableRefObject,
  ReactNode,
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
import { SimplexNoise } from "three/examples/jsm/Addons.js";
import { seededRandom } from "three/src/math/MathUtils.js";

// How to Choose the Right Terms for Your Use Case:
// If your context is physical (real-world measurements): Stick with length (X), width (Y), height (Z).
// If your context is computer graphics or game development: Use length (X), width (Z), height (Y).

// TODO dependency hier op verwijderen
const DEFAULT_CHUNK_COUNT = 4;
const DEFAULT_BLOCKS_PER_CHUNK_XZ = 16;
const DEFAULT_BLOCKS_PER_CHUNK_Y = 16;

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

type BlockGrid = BlocksXYZ[][];

interface AppState {
  world: {
    grid: BlockGrid;

    params: {
      size: {
        chunkCountX: number;
        chunkCountZ: number;
        blocksPerChunkX: number;
        blocksPerChunkZ: number;
        blocksPerChunkY: number;
      };
      terrain: {
        scale: number;
        magnitude: number;
        offset: number;
        seed: number;
      };
    };

    getBlock: (
      x: number,
      y: number,
      z: number,
      grid?: BlockGrid
    ) => Block | null;
    setBlockType: (
      x: number,
      y: number,
      z: number,
      type: BlockType,
      grid?: BlockGrid
    ) => void;

    initializeGrid: (
      chunkCountX?: number,
      chunkCountZ?: number,
      blocksPerChunkX?: number,
      blocksPerChunkY?: number,
      blocksPerChunkZ?: number
    ) => void;

    generateTerrain: () => void;
  };
}

const useAppStore = create<AppState>()(
  immer((set, get) => ({
    world: {
      grid: [] as BlockGrid,

      params: {
        size: {
          chunkCountX: DEFAULT_CHUNK_COUNT,
          chunkCountZ: DEFAULT_CHUNK_COUNT,
          blocksPerChunkX: DEFAULT_BLOCKS_PER_CHUNK_XZ,
          blocksPerChunkY: DEFAULT_BLOCKS_PER_CHUNK_Y,
          blocksPerChunkZ: DEFAULT_BLOCKS_PER_CHUNK_XZ,
        },
        terrain: {
          scale: 70,
          magnitude: 0.5,
          offset: 0.2,
          seed: 0,
        },
      },

      getBlock: (
        x: number,
        y: number,
        z: number,
        grid?: BlockGrid
      ): Block | null => {
        const {
          world,
          world: {
            params: {
              size: { blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ },
            },
          },
        } = get();
        const { chunkX, chunkZ, blockX, blockY, blockZ } = worldToBlockCoords(
          x,
          y,
          z,
          blocksPerChunkX,
          blocksPerChunkY,
          blocksPerChunkZ
        );
        const block = (grid ?? world.grid)?.[chunkX]?.[chunkZ]?.[blockX]?.[
          blockY
        ]?.[blockZ];

        return block ?? null;
      },

      setBlockType: (
        x: number,
        y: number,
        z: number,
        type: BlockType,
        grid?: BlockGrid
      ) => {
        const { getBlock } = get().world;
        set((state) => {
          const block = getBlock(x, y, z, grid ?? state.world.grid);
          if (block) {
            block.type = type;
          }
        });
      },

      generateTerrain: () => {
        const { seed } = get().world.params.terrain;
        // Wrapper object with a random() method
        const rngWrapper = {
          random: () => seededRandom(seed),
        };

        const simplex = new SimplexNoise(rngWrapper);

        const {
          world: {
            setBlockType,
            params: {
              terrain: { scale, magnitude, offset },
              size: {
                chunkCountX,
                chunkCountZ,
                blocksPerChunkX,
                blocksPerChunkY,
                blocksPerChunkZ,
              },
            },
          },
        } = get();

        const blockCountX = chunkCountX * blocksPerChunkX;
        const blockCountZ = chunkCountZ * blocksPerChunkZ;

        Array.from({ length: blockCountX }).map((_, x) =>
          Array.from({ length: blockCountZ }).map((_, z) => {
            const value = simplex.noise(x / scale, z / scale);

            const scaledNoise = offset + magnitude * value;

            const height = Math.floor(blocksPerChunkY * scaledNoise);
            const clampedHeight = Math.max(
              0,
              Math.min(height, blocksPerChunkY - 1)
            );

            Array.from({ length: blocksPerChunkY }).map((_, y) => {
              // set block type
              setBlockType(
                x,
                y,
                z,
                y <= clampedHeight ? BlockType.Dirt : BlockType.Air
              );
            });
          })
        );
      },

      initializeGrid: (
        chunkCountX = DEFAULT_CHUNK_COUNT,
        chunkCountZ = DEFAULT_CHUNK_COUNT,
        blocksPerChunkX = DEFAULT_BLOCKS_PER_CHUNK_XZ,
        blocksPerChunkY = DEFAULT_BLOCKS_PER_CHUNK_Y,
        blocksPerChunkZ = DEFAULT_BLOCKS_PER_CHUNK_XZ
      ) => {
        set((state) => {
          state.world.params.size.chunkCountX = chunkCountX;
          state.world.params.size.chunkCountZ = chunkCountZ;
          state.world.params.size.blocksPerChunkX = blocksPerChunkX;
          state.world.params.size.blocksPerChunkY = blocksPerChunkY;
          state.world.params.size.blocksPerChunkZ = blocksPerChunkZ;

          state.world.grid = Array.from({ length: chunkCountX }).map(
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
                          type: BlockType.Air,
                          instanceId: null,
                        } as Block)
                    )
                  )
                )
              )
          );
        });
      },
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
  const {
    chunkCountX,
    chunkCountZ,
    blocksPerChunkX,
    blocksPerChunkY,
    blocksPerChunkZ,
  } = useAppStore(
    useShallow(
      ({
        world: {
          params: { size },
        },
      }) => size
    )
  );
  return (
    <OrbitControls
      target={[
        (chunkCountX * blocksPerChunkX) / 2,
        blocksPerChunkY / 2,
        (chunkCountZ * blocksPerChunkZ) / 2,
      ]}
    />
  );
}

function worldToBlockCoords(
  x: number,
  y: number,
  z: number,
  blocksPerChunkX: number,
  blocksPerChunkY: number,
  blocksPerChunkZ: number
) {
  const chunkX = Math.floor(x / blocksPerChunkX);
  const chunkZ = Math.floor(z / blocksPerChunkZ);
  const blockX = x % blocksPerChunkX;
  const blockY = y % blocksPerChunkY;
  const blockZ = z % blocksPerChunkZ;

  return { chunkX, chunkZ, blockX, blockY, blockZ };
}

function useBlocks() {
  const [chunkGrid] = useAppStore(
    useShallow(({ world }) => [
      world.grid,
      world.params.size.blocksPerChunkX,
      world.params.size.blocksPerChunkY,
      world.params.size.blocksPerChunkZ,
    ])
  );

  const blockList = useMemo(() => chunkGrid.flat(4), [chunkGrid]);
  const blockCount = useMemo(() => blockList.length, [blockList]);

  return {
    blockList,
    blockCount,
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
    scale,
    magnitude,
    offset,
    seed,
    initializeGrid,
    generateTerrain,
  ] = useAppStore(
    useShallow(({ world }) => [
      world.params.size.chunkCountX,
      world.params.size.chunkCountZ,
      world.params.size.blocksPerChunkX,
      world.params.size.blocksPerChunkZ,
      world.params.size.blocksPerChunkY,
      world.params.terrain.scale,
      world.params.terrain.magnitude,
      world.params.terrain.offset,
      world.params.terrain.seed,
      world.initializeGrid,
      world.generateTerrain,
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
    };

    // Create the appropriate folder structure:
    const worldFolder = guiRef.current.addFolder("World");

    const chunkCountFolder = worldFolder.addFolder("Chunk count").close();
    const blockCountFolder = worldFolder.addFolder("Block count").close();
    const terrainFolder = worldFolder.addFolder("Terrain");

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

    const terrainOptions = {
      scale,
      magnitude,
      offset,
      seed,
    };

    terrainFolder
      .add(terrainOptions, "scale", 1, 100)
      .name("Scale")
      .onFinishChange(function (v: string) {
        useAppStore.setState((state) => {
          state.world.params.terrain.scale = Number(v);
        });
      });
    terrainFolder
      .add(terrainOptions, "magnitude", 0, 1)
      .name("Magnitude")
      .onFinishChange(function (v: string) {
        useAppStore.setState((state) => {
          state.world.params.terrain.magnitude = Number(v);
        });
      });
    terrainFolder
      .add(terrainOptions, "offset", 0, 1)
      .name("Offset")
      .onFinishChange(function (v: string) {
        useAppStore.setState((state) => {
          state.world.params.terrain.offset = Number(v);
        });
      });
    terrainFolder
      .add(terrainOptions, "seed", 0, 10000)
      .name("Seed")
      .onFinishChange(function (v: string) {
        useAppStore.setState((state) => {
          state.world.params.terrain.seed = Number(v);
        });
      });

    terrainFolder
      .add(
        {
          action: () => {
            generateTerrain();
          },
        },
        "action"
      )
      .name("Update terrain");

    // Add "Generate" button
    worldFolder
      .add(
        {
          action: () => {
            // Only update the store when the user clicks the "Generate" button
            initializeGrid(
              chunkCountXController.getValue(),
              chunkCountZController.getValue(),
              blocksPerChunkXController.getValue(),
              blocksPerChunkYController.getValue(),
              blocksPerChunkZController.getValue()
            );
            generateTerrain();
          },
        },
        "action"
      )
      .name("Generate world");

    return () => {
      worldFolder.destroy();
    };
  }, [
    chunkCountX,
    chunkCountZ,
    blocksPerChunkX,
    blocksPerChunkZ,
    blocksPerChunkY,
    initializeGrid,
    generateTerrain,
    guiRef,
    scale,
    magnitude,
    offset,
    seed,
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

  const [initializeGrid, generateTerrain] = useAppStore(
    useShallow((state) => [
      state.world.initializeGrid,
      state.world.generateTerrain,
    ])
  );

  const { blockList } = useBlocks();
  const solidBlockList = useMemo(
    () => blockList.filter((block) => block.type !== BlockType.Air),
    [blockList]
  );

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  useEffect(() => {
    initializeGrid();
    generateTerrain();
  }, [initializeGrid, generateTerrain]);

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
    <Canvas camera={{ position: [-32, 32, -32] }}>
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
