// src/components/EarthSphere.tsx
import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';

interface EarthSphereProps {
  radius?: number;
  textureProp?: string;
}

const BasicSphere = ({
  radius = 2.8,
  textureProp = '/assets/8081_earthmap10k.jpg',
}: EarthSphereProps) => {
  const texture = useLoader(TextureLoader, textureProp);

  return (
    <mesh>
      {/* mesh = objeto 3D */}
      <sphereGeometry args={[radius, 128, 128]} />
      {/* h,w segmentos */}
      <meshStandardMaterial map={texture} roughness={0.5} metalness={0} />
      {/* roughness={1} // La superficie es completamente mate, sin reflejos especulares. */}
      {/* metalness={0} // La superficie no es metálica en absoluto. */}
    </mesh>
  );
};

export default BasicSphere;
