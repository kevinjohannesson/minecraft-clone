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
  NearestFilter,
  Object3D,
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

interface Block {
  position: Vector3Tuple;
  // ?is perhaps actually type?
  id: number;
  instanceId: number | null;
}

type BlocksXYZ = Block[][][];

type ChunksXY = BlocksXYZ[][];

interface AppState {
  world: {
    blockGrid: ChunksXY;
    generate: (
      chunkCount: number,
      chunkSize?: number,
      chunkHeight?: number
    ) => void;

    chunkCount: number;
    chunkSize: number;
    chunkHeight: number;
  };
}

const useAppStore = create<AppState>()(
  immer((set) => ({
    world: {
      blockGrid: [] as ChunksXY,
      chunkCount: 0,
      chunkSize: 0,
      chunkHeight: 0,
      generate: (chunkCount, chunkSize = 16, chunkHeight = 1) => {
        console.log(`generate()`);
        console.log({ chunkCount, chunkSize, chunkHeight });
        set((state) => {
          state.world.chunkCount = chunkCount;
          state.world.chunkSize = chunkSize;
          state.world.chunkHeight = chunkHeight;

          state.world.blockGrid = Array.from({ length: chunkCount }).map(
            (_, chunkX) =>
              Array.from({ length: chunkCount }).map((_, chunkY) =>
                Array.from({ length: chunkSize }).map((_, blockX) =>
                  Array.from({ length: chunkHeight }).map((_, blockY) =>
                    Array.from({ length: chunkSize }).map(
                      (_, blockZ) =>
                        ({
                          position: [chunkX + blockX, chunkY + blockY, blockZ],
                          id: 0,
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
  return <OrbitControls />;
}

function useGenerateWorld() {
  return useAppStore(useShallow((state) => state.world.generate));
}

function useBlocks() {
  const [blockGrid] = useAppStore(useShallow(({ world }) => [world.blockGrid]));

  const blockList = useMemo(() => blockGrid.flat(4), [blockGrid]);
  const blockCount = useMemo(() => blockList.length, [blockList]);

  return { blockGrid, blockList, blockCount };
}

function useWorldGui() {
  const guiRef = useDebugGuiRef();

  const [chunkCount, chunkSize, chunkHeight, generateWorld] = useAppStore(
    useShallow(({ world }) => [
      world.chunkCount,
      world.chunkSize,
      world.chunkHeight,
      world.generate,
    ])
  );

  useEffect(() => {
    // Create the appropriate folder structure:
    const worldFolder = guiRef.current.addFolder("World");
    const chunksFolder = worldFolder.addFolder("Chunks");

    // Take a snapshot of the current state to pass to lil-gui
    const chunkOptions = {
      chunkCount,
      chunkSize,
      chunkHeight,
    };

    // Add controllers to alter chunks
    const chunkCountController = chunksFolder
      .add(chunkOptions, "chunkCount", 1, 8, 1)
      .name("Count");

    const chunkSizeController = chunksFolder
      .add(chunkOptions, "chunkSize", 1, 64, 1)
      .name("Size");

    const chunkHeightController = chunksFolder
      .add(chunkOptions, "chunkHeight", 1, 256, 1)
      .name("Height");

    // Add "Generate" button
    chunksFolder
      .add(
        {
          action: () => {
            console.log("Generate");
            // Only update the store when the user clicks the "Generate" button
            generateWorld(
              chunkCountController.getValue(),
              chunkSizeController.getValue(),
              chunkHeightController.getValue()
            );
          },
        },
        "action"
      )
      .name("Generate");

    return () => {
      worldFolder.destroy();
    };
  }, [chunkCount, chunkSize, chunkHeight, generateWorld, guiRef]);
}

function World() {
  useWorldGui();

  const generateWorld = useGenerateWorld();
  const { blockList, blockCount } = useBlocks();

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  useEffect(() => {
    generateWorld(1);
  }, [generateWorld]);

  useEffect(() => {
    const temp = new Object3D();
    // Set positions
    blockList.forEach((block, index) => {
      const position = new Vector3(...block.position).addScalar(0.5).toArray();
      temp.position.set(...position);
      temp.updateMatrix();
      instancedMeshRef.current.setMatrixAt(index, temp.matrix);
    });
    // Update the instance
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [blockList]);

  // TODO Extract to hook as ultimately all textures need this filter
  // Set up the texture
  const texture = useLoader(TextureLoader, dirtTexture);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, blockCount]}
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
    <Canvas camera={{ position: [-32, 48, -32] }}>
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
