import {
  createContext,
  MutableRefObject,
  ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { InstancedMesh, NearestFilter, Object3D, TextureLoader } from "three";
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

interface Dimensions {
  length: number;
  width: number;
  height: number;
}

interface AppState {
  world: {
    dimensions: Dimensions;
    setDimensions: (dimensions: Dimensions) => void;
  };
}

const useAppStore = create<AppState>()(
  immer((set) => ({
    world: {
      dimensions: {
        length: 16,
        width: 16,
        height: 32,
      },
      setDimensions: (dimensions: Dimensions) =>
        set((state) => {
          state.world.dimensions = dimensions;
        }),
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

function World() {
  const [dimensions, setDimensions] = useAppStore(
    useShallow((state) => [state.world.dimensions, state.world.setDimensions])
  );

  const guiRef = useDebugGuiRef();

  const { length, width, height } = dimensions;

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  const positions = Array.from({ length: height }).flatMap((_, y) =>
    Array.from({ length: width }).flatMap((_, z) =>
      Array.from({ length: length }).map((_, x) => [x, y, z] as const)
    )
  );

  useEffect(() => {
    const temp = new Object3D();
    // Set positions
    positions.forEach(([x, y, z], i) => {
      temp.position.set(x + 0.5, y + 0.5, z + 0.5);
      temp.updateMatrix();
      instancedMeshRef.current.setMatrixAt(i, temp.matrix);
    });
    // Update the instance
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions]);

  // TODO Extract to hook as ultimately all textures need this filter
  const texture = useLoader(TextureLoader, dirtTexture);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  // TODO Extract to a hook as it is too bulky
  useEffect(() => {
    // Create the appropriate folder structure:
    const rootFolder = guiRef.current.addFolder("World");
    const dimensionsFolder = rootFolder.addFolder("Dimensions");

    // Take a snapshot of the current dimensions state to pass to lil-gui
    const _dimensions = { ...dimensions };

    // Add controllers for dimensions
    const lengthController = dimensionsFolder
      .add(_dimensions, "length", 1, 128, 2)
      .name("Length");

    const widthController = dimensionsFolder
      .add(_dimensions, "width", 1, 128, 2)
      .name("Width");

    const heightController = dimensionsFolder
      .add(_dimensions, "height", 1, 256, 1)
      .name("Height");

    // Add "Generate" button
    dimensionsFolder
      .add(
        {
          action: () => {
            console.log("Generate");
            // Only update the store when the user clicks the "Generate" button
            setDimensions({
              length: lengthController.getValue(),
              width: widthController.getValue(),
              height: heightController.getValue(),
            });
          },
        },
        "action"
      )
      .name("Generate");

    return () => {
      rootFolder.destroy();
    };
  }, [dimensions, setDimensions, guiRef]);

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, positions.length]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="white" map={texture} flatShading />
      </instancedMesh>
    </group>
  );
}

const DebugGuiRefContext = createContext<MutableRefObject<GUI>>(null!);

function DebugGuiRefProvider({ children }: { children?: ReactNode }) {
  const gui = useRef(new GUI());

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
      <Lights />
      <Controls />
      <Stats />
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
