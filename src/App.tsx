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
  Color,
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
import { createNoise2D } from "simplex-noise";
import { seededRandom } from "three/src/math/MathUtils.js";

enum BlockType {
  Air,
  Dirt,
  Grass,
}

interface BlockMetaData {
  isSolid: boolean;
  name: string;
}

type BlockMetaDataMap = Record<BlockType, BlockMetaData>;

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

    worldToBlockCoords: (
      x: number,
      y: number,
      z: number
    ) => {
      chunkX: number;
      chunkZ: number;
      blockX: number;
      blockY: number;
      blockZ: number;
    };

    getBlock: (
      x: number,
      y: number,
      z: number,
      grid?: BlockGrid
    ) => Block | null;

    setBlockType: (x: number, y: number, z: number, type: BlockType) => void;

    isBlockInBounds(x: number, y: number, z: number): boolean;

    isBlockObscured(x: number, y: number, z: number): boolean;

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

const BLOCK_META_DATA_MAP: BlockMetaDataMap = {
  [BlockType.Air]: {
    isSolid: false,
    name: "Air",
  },
  [BlockType.Dirt]: {
    isSolid: true,
    name: "Dirt",
  },
  [BlockType.Grass]: {
    isSolid: true,
    name: "Grass",
  },
};

const useAppStore = create<AppState>()(
  immer((set, get) => ({
    world: {
      grid: [] as BlockGrid,

      params: {
        size: {
          chunkCountX: 4,
          chunkCountZ: 4,
          blocksPerChunkX: 16,
          blocksPerChunkY: 16,
          blocksPerChunkZ: 16,
        },
        terrain: {
          scale: 70,
          magnitude: 0.5,
          offset: 0.2,
          seed: 0,
        },
      },

      worldToBlockCoords(x, y, z) {
        const { blocksPerChunkX, blocksPerChunkY, blocksPerChunkZ } =
          get().world.params.size;

        const chunkX = Math.floor(x / blocksPerChunkX);
        const chunkZ = Math.floor(z / blocksPerChunkZ);
        const blockX = x % blocksPerChunkX;
        const blockY = y % blocksPerChunkY;
        const blockZ = z % blocksPerChunkZ;

        return { chunkX, chunkZ, blockX, blockY, blockZ };
      },

      isBlockInBounds(x, y, z) {
        const {
          blocksPerChunkX,
          blocksPerChunkY,
          blocksPerChunkZ,
          chunkCountX,
          chunkCountZ,
        } = get().world.params.size;

        const isXInBounds = x >= 0 && x < blocksPerChunkX * chunkCountX;
        const isYInBounds = y >= 0 && y < blocksPerChunkY;
        const isZInBounds = z >= 0 && z < blocksPerChunkZ * chunkCountZ;

        return isXInBounds && isYInBounds && isZInBounds;
      },

      getBlock: (x, y, z, grid) => {
        const {
          world,
          world: { worldToBlockCoords, isBlockInBounds },
        } = get();

        if (!isBlockInBounds(x, y, z)) {
          return null;
        }

        const { chunkX, chunkZ, blockX, blockY, blockZ } = worldToBlockCoords(
          x,
          y,
          z
        );

        const block = (grid ?? world.grid)?.[chunkX]?.[chunkZ]?.[blockX]?.[
          blockY
        ]?.[blockZ];

        return block ?? null;
      },

      setBlockType: (x, y, z, type) => {
        set((state) => {
          const { getBlock } = state.world;
          const block = getBlock(x, y, z, state.world.grid);
          if (block) {
            block.type = type;
          }
        });
      },

      isBlockObscured(x, y, z) {
        const {
          world: { getBlock },
        } = get();

        const top = getBlock(x, y + 1, z);
        const bottom = getBlock(x, y - 1, z);
        const left = getBlock(x - 1, y, z);
        const right = getBlock(x + 1, y, z);
        const front = getBlock(x, y, z - 1);
        const back = getBlock(x, y, z + 1);

        return [top, bottom, left, right, front, back].every(
          (block) => block && BLOCK_META_DATA_MAP[block.type].isSolid
        );
      },

      generateTerrain: () => {
        const { seed } = get().world.params.terrain;
        const simplex = createNoise2D(() => seededRandom(seed));

        const {
          world: {
            grid,
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

        set((state) => {
          state.world.grid = Array.from({ length: chunkCountX }).map(
            (_, chunkX) =>
              Array.from({ length: chunkCountZ }).map((_, chunkZ) =>
                Array.from({ length: blocksPerChunkX }).map((_, blockX) =>
                  Array.from({ length: blocksPerChunkY }).map((_, blockY) =>
                    Array.from({ length: blocksPerChunkZ }).map((_, blockZ) => {
                      const value = simplex(
                        (chunkX * blocksPerChunkX + blockX) / scale,
                        (chunkZ * blocksPerChunkZ + blockZ) / scale
                      );

                      const scaledNoise = offset + magnitude * value;

                      const height = Math.floor(blocksPerChunkY * scaledNoise);
                      const clampedHeight = Math.max(
                        0,
                        Math.min(height, blocksPerChunkY - 1)
                      );

                      return {
                        ...grid[chunkX][chunkZ][blockX][blockY][blockZ]!,
                        type:
                          blockY <= clampedHeight
                            ? blockY === clampedHeight
                              ? BlockType.Grass
                              : BlockType.Dirt
                            : BlockType.Air,
                      };
                    })
                  )
                )
              )
          );
        });
      },

      initializeGrid: (
        chunkCountX,
        chunkCountZ,
        blocksPerChunkX,
        blocksPerChunkY,
        blocksPerChunkZ
      ) => {
        const { size } = get().world.params;

        const _chunkCountX = chunkCountX ?? size.chunkCountX;
        const _chunkCountZ = chunkCountZ ?? size.chunkCountZ;
        const _blocksPerChunkX = blocksPerChunkX ?? size.blocksPerChunkX;
        const _blocksPerChunkY = blocksPerChunkY ?? size.blocksPerChunkY;
        const _blocksPerChunkZ = blocksPerChunkZ ?? size.blocksPerChunkZ;

        set((state) => {
          state.world.params.size.chunkCountX = _chunkCountX;
          state.world.params.size.chunkCountZ = _chunkCountZ;
          state.world.params.size.blocksPerChunkX = _blocksPerChunkX;
          state.world.params.size.blocksPerChunkY = _blocksPerChunkY;
          state.world.params.size.blocksPerChunkZ = _blocksPerChunkZ;

          state.world.grid = Array.from({ length: _chunkCountX }).map(
            (_, chunkX) =>
              Array.from({ length: _chunkCountZ }).map((_, chunkZ) =>
                Array.from({ length: _blocksPerChunkX }).map((_, blockX) =>
                  Array.from({ length: _blocksPerChunkY }).map((_, blockY) =>
                    Array.from({ length: _blocksPerChunkZ }).map(
                      (_, blockZ) =>
                        ({
                          position: [
                            chunkX * _blocksPerChunkX + blockX,
                            blockY,
                            chunkZ * _blocksPerChunkZ + blockZ,
                          ],
                          type: BlockType.Dirt,
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
    worldFolder
      .add(
        {
          action: () => {
            useAppStore.setState((state) => {
              state.world.params.terrain.seed++; // = Math.floor(
              //   Math.random() * 10001
              // );
            });
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
      .name("Generate world with new seed");

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

  // Set up the texture
  const filteredDirtTexture = useFilteredTexture(dirtTexture);

  const [initializeGrid, generateTerrain, isBlockObscured] = useAppStore(
    useShallow((state) => [
      state.world.initializeGrid,
      state.world.generateTerrain,
      state.world.isBlockObscured,
    ])
  );

  const { blockList } = useBlocks();
  const solidBlockList = useMemo(
    () =>
      blockList.filter(
        (block) =>
          block.type !== BlockType.Air && !isBlockObscured(...block.position)
      ),
    [blockList, isBlockObscured]
  );

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  useEffect(() => {
    initializeGrid();
    generateTerrain();
  }, [initializeGrid, generateTerrain]);

  useEffect(() => {
    const matrix = new Matrix4();
    const instancedMesh = instancedMeshRef.current;
    // Set positions
    solidBlockList.forEach((block, index) => {
      const position = new Vector3(...block.position).addScalar(0.5).toArray();
      matrix.setPosition(...position);
      instancedMesh.setMatrixAt(index, matrix);
      instancedMesh.setColorAt(
        index,
        new Color(block.type === BlockType.Dirt ? "#79563A" : "#78AB4F")
      );
    });
    // Update the instance
    instancedMesh.instanceMatrix.needsUpdate = true;

    return () => {
      instancedMesh.dispose();
    };
  }, [solidBlockList, isBlockObscured]);

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, solidBlockList.length]}
      >
        <boxGeometry />
        <meshStandardMaterial
          // color="white"
          // map={texture}
          flatShading
          wireframe={false}
        />
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
      <axesHelper args={[5]} />
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
