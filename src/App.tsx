import { useRef } from "react";
import { Canvas, MeshProps } from "@react-three/fiber";
import { Mesh } from "three";
import { OrbitControls } from "@react-three/drei";

function Box(props: MeshProps) {
  const meshRef = useRef<Mesh>(null!);
  return (
    <mesh {...props} ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={"orange"} />
    </mesh>
  );
}

function App() {
  return (
    <>
      <Canvas>
        <ambientLight intensity={Math.PI / 2} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
          decay={0}
          intensity={Math.PI}
        />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
        <Box position={[0, 0, 0]} />
        <OrbitControls />
      </Canvas>
    </>
  );
}

export default App;
