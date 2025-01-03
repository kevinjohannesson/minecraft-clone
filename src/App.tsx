import { useRef } from "react";
import { Canvas, MeshProps } from "@react-three/fiber";
import { Mesh } from "three";
import { OrbitControls } from "@react-three/drei";

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

function World({ radius = 16 }: { radius?: number }) {
  return (
    <group>
      {Array.from({ length: radius * 2 }).map((_, x) =>
        Array.from({ length: radius * 2 }).map((_, z) => (
          <Block position={[-radius + x, 0, -radius + z]} />
        ))
      )}
    </group>
  );
}

function App() {
  return (
    <>
      <Canvas camera={{ position: [-32, 16, -32] }}>
        <Lights />
        <Controls />
        <World />
      </Canvas>
    </>
  );
}

export default App;
