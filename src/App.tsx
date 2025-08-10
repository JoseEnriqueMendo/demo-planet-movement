// import { Canvas } from '@react-three/fiber';
// import './App.css';
// // import ThreeScene from './components/ThreeScene';
// // import RotatingBox from './components/RotatingBox';
// import { OrbitControls } from '@react-three/drei';
// import EarthSphere from './components/EarthSphere';
// import { useEffect } from 'react';

// function App() {
//   /*Frontend: Desarrollo en tecnologías como Three.js para visualización 3D y D3.js o
// Plotly para gráficos interactivos.
// */

//   const handleaction = () => {
//     alert('ss');
//   };

// const latLonToVec3 = (lat: number, lon: number, radius: number): THREE.Vector3 => {
//   const phi = (90 - lat) * (Math.PI / 180); // latitud a radianes
//   const theta = (lon + 180) * (Math.PI / 180); // longitud a radianes

//   const x = -radius * Math.sin(phi) * Math.cos(theta);
//   const y = radius * Math.cos(phi);
//   const z = radius * Math.sin(phi) * Math.sin(theta);

//   return new THREE.Vector3(x, y, z);
// };

//   const peruVec = latLonToVec3(-9.2, -75.0, 2.8); // Radio de tu esfera

//   // Usar lookAt para apuntar
//   camera.position.set(peruVec.x * 1.5, peruVec.y * 1.5, peruVec.z * 1.5); // Aleja un poco
//   camera.lookAt(peruVec); // Mira hacia Perú

//   useEffect(() => {
//     const peruVec = latLonToVec3(-9.2, -75.0, 2.8);
//     camera.position.set(peruVec.x * 1.5, peruVec.y * 1.5, peruVec.z * 1.5);
//     camera.lookAt(peruVec);
//     controlsRef.current.target.copy(peruVec);
//   }, []);

//   return (
//     <>
//       <div style={{ width: '50vw', height: '75vh', border: 'solid 1px' }}>
//         {/* Lienzo de react-three-fiber: donde se renderiza la escena 3D */}
//         <Canvas camera={{ position: [0, 0, 5] }} shadows>
//           {/*   position: [0, 0, 5] // Posición inicial de la cámara: alejada 5 unidades en el eje Z fov,, que es
//     }}
//     shadows // Habilita el soporte de sombras en toda la escena */}

//           {/* Luz ambiental: ilumina toda la escena de manera uniforme, sin dirección ni sombras */}
//           <ambientLight intensity={1.0} />
//           {/*     intensity={1.0} // Intensidad de la luz ambiental: 1 es valor máximo, ilumina todo uniformemente */}

//           {/* Luz direccional: simula una fuente de luz como el sol, con sombras habilitadas */}
//           <directionalLight position={[5, 5, 5]} castShadow />
//           {/* position={[5, 5, 5]} // Posición de la luz direccional: arriba, a la derecha y al fondo
//       castShadow // Permite que esta luz proyecte sombras sobre los objetos */}
//           <EarthSphere />

//           {/* Controles interactivos para rotar, hacer zoom y mover la cámara con el mouse */}
//           <OrbitControls
//             target={[peruVec.x, peruVec.y, peruVec.z]}
//             autoRotate={true}
//             autoRotateSpeed={0.2}
//             maxDistance={10}
//           />
//           {/* enableZoom	boolean	Habilita o deshabilita el zoom con el mouse
//               enableRotate	boolean	Permite girar la cámara
//               enablePan	boolean	Permite mover la cámara lateralmente
//               zoomSpeed	number	Velocidad del zoom (1 por defecto)
//               rotateSpeed	number	⭐ Velocidad de rotación (1 por defecto)
//               panSpeed	number	Velocidad de paneo lateral (1 por defecto)
//               autoRotate	boolean	Activa rotación automática alrededor del objetivo
//               autoRotateSpeed	number	⭐ Velocidad de rotación automática (por defecto 2.0)
//               minDistance / maxDistance	number	Distancia mínima/máxima que la cámara puede alejarse/acercarse
//               minPolarAngle / maxPolarAngle	number	Limita el ángulo vertical de rotación (para evitar que pase por debajo del suelo)
//               minAzimuthAngle / maxAzimuthAngle	number	Limita la rotación horizontal (azimut)

//               */}
//         </Canvas>
//       </div>
//       {/*
//       <div style={{ width: '50%', height: '50vh' }}>
//         <Canvas camera={{ position: [0, 0, 10] }}>
//           <ambientLight intensity={0.5} />
//           <directionalLight position={[5, 10, 5]} />
//           <RotatingBox />
//         </Canvas>
//       </div>
//       <div className="App">
//         <ThreeScene />
//       </div> */}
//       <button onClick={handleaction}>Test</button>
//     </>
//   );
// }

// export default App;
import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import BasicSphere from './components/BasicSphere';
import { OrbitControls } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface CameraControllerProps {
  lat: number;
  lon: number;
  radius: number;
  goToTarget: boolean;
  resetView: boolean;
  zoomIn: boolean;
  onActionDone: () => void;
}

// Convertir lat/lon en posición 3D sobre la esfera
const latLonToVec3 = (lat: number, lon: number, radius: number): THREE.Vector3 => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
};

const CameraController: React.FC<CameraControllerProps> = ({
  lat,
  lon,
  radius,
  goToTarget,
  resetView,
  zoomIn,
  onActionDone,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const targetRef = useRef<THREE.Vector3 | null>(null);
  const stepRef = useRef(0);
  const [zoomingIn, setZoomingIn] = useState(false);

  useFrame(() => {
    if (zoomingIn) {
      const target = latLonToVec3(lat, lon, radius);
      targetRef.current = target;
      console.log(zoomingIn);
      const direction = new THREE.Vector3().subVectors(camera.position, target);
      const distance = direction.length();
      console.log(distance);
      if (distance > 0.72) {
        console.log('test');
        // puedes ajustar el mínimo de distancia
        direction.multiplyScalar(0.94); // 5% más cerca cada frame
        const newPosition = new THREE.Vector3().addVectors(target, direction);
        camera.position.copy(newPosition);
        if (controlsRef.current) {
          controlsRef.current.update();
        }
      } else {
        console.log('sali');
        setZoomingIn(false); // detener zoom cuando ya estás suficientemente cerca
        targetRef.current = null;
        onActionDone();
        return;
      }
    }

    if (!controlsRef.current || !targetRef.current) return;
    const target = targetRef.current;

    // Fase 1: Interpolar el target del OrbitControls
    controlsRef.current.target.lerp(target, 0.05);

    // Fase 2: Interpolar la posición de la cámara hacia 1.5 veces el target (zoom progresivo)
    const multiply = resetView ? 1.8 : 1.5;

    const camTargetPos = target
      .clone()
      .normalize()
      .multiplyScalar(radius * multiply);
    camera.position.lerp(camTargetPos, 0.05);
    console.log('ss');
    controlsRef.current.update();
    // Si estamos cerca del destino, finalizar animación

    if (
      controlsRef.current.target.distanceTo(target) < 0.01 &&
      camera.position.distanceTo(camTargetPos) < 0.08
    ) {
      console.log('sds');
      targetRef.current = null;
      stepRef.current = 0;
      if (resetView) {
        console.log('entre');
        targetRef.current = null; // punto actual
        controlsRef.current?.target.set(0, 0, 0); // vista
      }
      onActionDone();
    }
  });

  useEffect(() => {
    if (goToTarget) {
      console.log('goToTarget');
      const target = latLonToVec3(lat, lon, radius);
      targetRef.current = target;
      if (controlsRef.current) {
        controlsRef.current.autoRotate = false;

        // Bloquear cualquier interacción con el mouse
        controlsRef.current.enableRotate = false; // Evita rotar
        controlsRef.current.enableZoom = false; // Evita zoom
        controlsRef.current.enablePan = false; // Evita desplazamiento
      }
    }

    if (resetView) {
      console.log('reset view');
      const target = latLonToVec3(lat, lon - 1, radius);
      targetRef.current = target;
      if (controlsRef.current) {
        controlsRef.current.autoRotate = true;
        controlsRef.current.enableRotate = true;
        controlsRef.current.enableZoom = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.update();
      }
    }
    if (zoomIn) {
      console.log('entre  zoom in');
      console.log(zoomIn);
      setZoomingIn(true);
    }
  }, [goToTarget, resetView, lat, lon, radius, camera, onActionDone, zoomIn]);

  return <OrbitControls ref={controlsRef} autoRotate autoRotateSpeed={0.5} />;
};

const App: React.FC = () => {
  const radius = 2.8;
  const [goToPeru, setGoToPeru] = useState(false);
  const [resetView, setResetView] = useState(true);
  const [zoomIn, setZoomIn] = useState(false);
  const [activate, setActivate] = useState(false);
  return (
    <div
      style={{
        // background: 'red',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => {
            setActivate(true);
            setGoToPeru(true);
          }}
          className={!activate ? 'custom-button' : 'custom-button-selected'}
        >
          Ir a Perú
        </button>
        <button
          onClick={() => {
            setResetView(true);
            setActivate(false);
          }}
          className="custom-button"
        >
          Reiniciar
        </button>
        <button
          onClick={() => {
            setZoomIn(true);
          }}
          className="custom-button"
          disabled={!activate}
        >
          Hacer Zoom
        </button>
      </div>
      <style>
        {`
    .custom-button {
      padding: 10px 40px;
      background-color: #1A1A1A;
      border: 1px solid #3a3838ff;
      border-radius: 4px;
      cursor: pointer;
    }

    .custom-button:hover {
      background-color: #3a3838ff
    }
  `}
      </style>

      <style>
        {`
    .custom-button-selected {
      padding: 10px 40px;
      background-color: #e92525ff;
      border: 1px solid #3a3838ff;
      border-radius: 4px;
      cursor: pointer;
    }

     .custom-button-selected:hover   {
      background-color: #ff5c5cff
    }
  `}
      </style>

      <div style={{ display: 'flex' }}>
        <div
          style={{
            width: '50vw',
            height: '75vh',
            // , border: '1px solid white'
          }}
        >
          <Canvas camera={{ position: [0, 0, 5] }} shadows>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} castShadow />
            <BasicSphere radius={radius} />
            <CameraController
              lat={-9.2}
              lon={-75.0}
              radius={radius}
              goToTarget={goToPeru}
              resetView={resetView}
              zoomIn={zoomIn} // 👈 Asegúrate de incluir esto
              onActionDone={() => {
                setGoToPeru(false);
                setResetView(false);
                setZoomIn(false); // 👈 Reseteas cuando termina el zoom
              }}
            />
          </Canvas>
        </div>
        {/* 
        <div style={{ width: '50vw', height: '75vh', border: '1px solid black' }}>
          <Canvas camera={{ position: [0, 0, 5] }} shadows>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} castShadow />
            <BasicSphere radius={radius} textureProp="/assets/mapa.png" />
            <OrbitControls autoRotate={true} autoRotateSpeed={0.2} maxDistance={10} />
          </Canvas>
        </div> */}
      </div>
    </div>
  );
};

export default App;
