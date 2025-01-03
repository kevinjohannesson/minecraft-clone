import { useEffect, useRef } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { InstancedMesh, NearestFilter, Object3D, TextureLoader } from "three";

import { OrbitControls, Stats } from "@react-three/drei";

import dirtTexture from "./assets/dirt.png";

// How to Choose the Right Terms for Your Use Case:
// If your context is physical (real-world measurements): Stick with length (X), width (Y), height (Z).
// If your context is computer graphics or game development: Use length (X), width (Z), height (Y).

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

function World({
  dimensions = [8, 8, 16],
}: {
  dimensions?: [number, number, number];
}) {
  const [length, width, height] = dimensions;

  const instancedMeshRef = useRef<InstancedMesh>(null!);

  const positions = Array.from({ length: height }).flatMap((_, y) =>
    Array.from({ length: width }).flatMap((_, z) =>
      Array.from({ length: length }).map((_, x) => [x, y, z] as const)
    )
  );

  console.log({ positions });
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

  // TODO make hook for loading nearest-filter textures?
  const texture = useLoader(TextureLoader, dirtTexture);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, positions.length]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial map={texture} flatShading />
      </instancedMesh>
    </group>
  );
}

function App() {
  return (
    <>
      <Canvas camera={{ position: [-32, 16, -32] }}>
        <Lights />
        <Controls />
        <Stats />
        <World />
      </Canvas>
    </>
  );
}

export default App;
