import { useEffect, useRef } from "react";
import { Canvas, MeshProps } from "@react-three/fiber";
import { InstancedMesh, Mesh, Object3D } from "three";

import { OrbitControls, Stats } from "@react-three/drei";

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

function Block(props: MeshProps) {
  const meshRef = useRef<Mesh>(null!);
  return (
    <mesh {...props} ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={"orange"} />
    </mesh>
  );
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
  const count = positions.length;
  const temp = new Object3D();

  useEffect(() => {
    // Set positions
    positions.forEach(([x, y, z], i) => {
      temp.position.set(x + 0.5, y + 0.5, z + 0.5);
      temp.updateMatrix();
      instancedMeshRef.current.setMatrixAt(i, temp.matrix);
    });
    // Update the instance
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <group>
      <instancedMesh
        ref={instancedMeshRef}
        args={[undefined, undefined, count]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={"orange"} />
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
