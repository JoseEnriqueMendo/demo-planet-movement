// src/components/RotatingBox.tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

const RotatingBox = () => {
  const meshRef = useRef<Mesh>(null!);

  // Animación: rotar en cada frame
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#007bff" />
    </mesh>
  );
};

export default RotatingBox;
