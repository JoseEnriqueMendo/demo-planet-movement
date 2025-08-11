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
  // 👇 nuevo
  zoomOut?: boolean;
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

const shortestAngleDelta = (from: number, to: number) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const CameraController: React.FC<CameraControllerProps> = ({
  lat,
  lon,
  radius,
  goToTarget,
  resetView,
  zoomIn,
  zoomOut = false,         // 👈 nuevo
  onActionDone,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  // No mover el target; siempre en el centro
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Estados internos para la animación por fases
  const phaseRef = useRef<'idle' | 'azimuth' | 'polar' | 'zoomIn' | 'zoomOut'>('idle');
  const desiredDirRef = useRef<THREE.Vector3 | null>(null);

  // Guardamos la distancia orbital previa al Zoom In para "deshacer"
  const preZoomDistRef = useRef<number | null>(null);  // 👈 nuevo

  // Configuración (ajusta a tu gusto)
  const speedAzimuth = 0.08; // 0.03–0.12
  const speedPolar = 0.07;
  const speedZoom = 0.06;
  const equatorFirst = true;  // 👈 fuerza pasar por el ecuador

  useFrame(() => {
    if (!controlsRef.current) return;

    // Mantén el target en el centro SIEMPRE
    controlsRef.current.target.set(0, 0, 0);

    // --- ZOOM PROGRESIVO independiente ---
    if (phaseRef.current === 'zoomIn') {
      // acercar manteniendo dirección
      const dirToCenter = camera.position.clone().normalize();
      const target = desiredDirRef.current
        ? desiredDirRef.current.clone().multiplyScalar(radius) // punto sobre la superficie
        : new THREE.Vector3(0, 0, 0);

      // distancia deseada para vista cercana
      const minDist = radius * 1.05; // apenas fuera de la esfera
      const curDist = camera.position.length();
      const nextDist = THREE.MathUtils.lerp(curDist, minDist, speedZoom);

      camera.position.copy(dirToCenter.multiplyScalar(nextDist));
      controlsRef.current.update();

      if (Math.abs(nextDist - minDist) < 0.01) {
        phaseRef.current = 'idle';
        onActionDone();
      }
      return;
    }

    // --- ZOOM OUT (deshacer) ---
    if (phaseRef.current === 'zoomOut') {                         // 👈 nuevo
      const dirToCenter = camera.position.clone().normalize();
      const curDist = camera.position.length();

      // Si por alguna razón no tenemos "previa", usamos la orbital por defecto
      const fallbackDist = radius * (resetView ? 1.8 : 1.5);
      const targetDist = preZoomDistRef.current ?? fallbackDist;

      const nextDist = THREE.MathUtils.lerp(curDist, targetDist, speedZoom);
      camera.position.copy(dirToCenter.multiplyScalar(nextDist));
      controlsRef.current.update();

      if (Math.abs(nextDist - targetDist) < 0.01) {
        // limpiamos estado de zoom previo
        preZoomDistRef.current = null;
        phaseRef.current = 'idle';
        onActionDone();
      }
      return;
    }
    // Si no hay objetivo deseado, nada que hacer
    if (!desiredDirRef.current) return;

    // Spherical actual y deseado
    const cur = new THREE.Spherical().setFromVector3(camera.position.clone());
    const desiredDir = desiredDirRef.current.clone().normalize();
    const des = new THREE.Spherical().setFromVector3(desiredDir);

    // Distancia objetivo de la cámara (zoom orbital)
    const desiredDist = radius * (resetView ? 1.8 : 1.5);

    if (phaseRef.current === 'azimuth') {
      // 1) Azimut hacia el destino, moviéndonos por el ecuador si equatorFirst=true
      const thetaDelta = shortestAngleDelta(cur.theta, des.theta);
      const nextTheta = cur.theta + thetaDelta * speedAzimuth;
      const nextPhi = equatorFirst ? Math.PI / 2 : cur.phi; // mantener en ecuador

      const nextR = THREE.MathUtils.lerp(cur.radius, desiredDist, 0.06);
      const next = new THREE.Spherical(nextR, nextPhi, nextTheta);
      camera.position.setFromSpherical(next);

      controlsRef.current.update();

      const azimuthClose = Math.abs(thetaDelta) < THREE.MathUtils.degToRad(1.0);
      if (azimuthClose) {
        phaseRef.current = 'polar';
      }
      return;
    }

    if (phaseRef.current === 'polar') {
      // 2) Ajustar latitud (phi) hacia el destino
      const phiDelta = des.phi - cur.phi;
      const nextPhi = cur.phi + phiDelta * speedPolar;
      const nextTheta = des.theta; // ya alineados en azimut
      const nextR = THREE.MathUtils.lerp(cur.radius, desiredDist, 0.06);

      const next = new THREE.Spherical(nextR, nextPhi, nextTheta);
      camera.position.setFromSpherical(next);

      controlsRef.current.update();

      const polarClose = Math.abs(phiDelta) < THREE.MathUtils.degToRad(1.0);
      const distClose = Math.abs(nextR - desiredDist) < 0.03;
      if (polarClose && distClose) {
        // fin de animación
        desiredDirRef.current = null;
        phaseRef.current = 'idle';
        onActionDone();
      }
      return;
    }
  });

  useEffect(() => {
    // Iniciar viaje a destino
    if (goToTarget) {
      // Dirección deseada a partir de lat/lon (vector unitario)
      const dir = latLonToVec3(lat, lon, 1);
      desiredDirRef.current = dir;

      // Bloquear interacción y apagar autoRotate durante la animación
      if (controlsRef.current) {
        controlsRef.current.autoRotate = false;
        controlsRef.current.enableRotate = false;
        controlsRef.current.enableZoom = false;
        controlsRef.current.enablePan = false;
        controlsRef.current.enableDamping = true;
        controlsRef.current.dampingFactor = 0.08;
      }

      // Fase 1: mover azimut primero (sobre el ecuador)
      phaseRef.current = 'azimuth';
    }
  }, [goToTarget, lat, lon, radius]);

  useEffect(() => {
    // Reiniciar vista: permitir interacción y (si quieres) auto-rotar
    if (resetView && controlsRef.current) {
      controlsRef.current.autoRotate = true;
      controlsRef.current.enableRotate = true;
      controlsRef.current.enableZoom = true;
      controlsRef.current.enablePan = true;
      controlsRef.current.enableDamping = true;
      controlsRef.current.dampingFactor = 0.08;
      controlsRef.current.update();

      // Cancelar cualquier animación pendiente
      desiredDirRef.current = null;
      phaseRef.current = 'idle';
    }
  }, [resetView]);

  useEffect(() => {
    if (zoomIn) {
      // Guardamos la distancia actual ANTES de acercar, para poder deshacer
      preZoomDistRef.current = camera.position.length();     // 👈 clave
      // Usa la dirección deseada actual (si existe) o la actual de la cámara
      if (!desiredDirRef.current) {
        desiredDirRef.current = camera.position.clone().normalize();
      }
      phaseRef.current = 'zoomIn';
    }
  }, [zoomIn, camera]);

  useEffect(() => {
    if (zoomOut) {                                           // 👈 nuevo
      // Si no hay distancia previa, no pasa nada malo: vuelve a la orbital por defecto
      if (!desiredDirRef.current) {
        desiredDirRef.current = camera.position.clone().normalize();
      }
      phaseRef.current = 'zoomOut';
    }
  }, [zoomOut, camera]);

  return <OrbitControls ref={controlsRef} autoRotate autoRotateSpeed={0.5} />;
};

const App: React.FC = () => {
  const radius = 2.8;

  // Un único destino controlado por estado
  const [dest, setDest] = useState<{ lat: number; lon: number }>({ lat: -9.2, lon: -75.0 }); // Perú por defecto
  const [goToTarget, setGoToTarget] = useState(false);
  const [resetView, setResetView] = useState(true);
  const [zoomIn, setZoomIn] = useState(false);
  const [zoomOut, setZoomOut] = useState(false);   // 👈 nuevo
  const [activeLabel, setActiveLabel] = useState<'peru' | 'china' | null>(null);

  return (
    <div style={{ width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => {
            setActiveLabel('peru');
            setDest({ lat: -9.2, lon: -75.0 });
            setGoToTarget(true);
          }}
          className={activeLabel === 'peru' ? 'custom-button-selected' : 'custom-button'}
        >
          Focus Perú
        </button>

        <button
          onClick={() => {
            setActiveLabel('china');
            setDest({ lat: 35.0, lon: 105.0 });
            setGoToTarget(true);
          }}
          className={activeLabel === 'china' ? 'custom-button-selected' : 'custom-button'}
        >
          Focus China
        </button>

        <button
          onClick={() => {
            setResetView(true);
            setActiveLabel(null);
          }}
          className="custom-button"
        >
          Desbloquear
        </button>

        <button
          onClick={() => setZoomIn(true)}
          className="custom-button"
          disabled={!activeLabel}
        >
          Zoom In
        </button>

        <button
          onClick={() => setZoomOut(true)}          // 👈 nuevo
          className="custom-button"
          disabled={false /* si quieres, desactívalo hasta que haya hecho Zoom In */}
        >
          Zoom Out
        </button>
      </div>

      {/* estilos… (deja tus <style> tal cual) */}

      <div style={{ display: 'flex' }}>
        <div style={{ width: '50vw', height: '75vh' }}>
          <Canvas camera={{ position: [0, 0, 5] }} shadows>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} castShadow />

            <BasicSphere radius={radius} />

            {/* 👇 Un solo controlador de cámara */}
            <CameraController
              lat={dest.lat}
              lon={dest.lon}
              radius={radius}
              goToTarget={goToTarget}
              resetView={resetView}
              zoomIn={zoomIn}
              zoomOut={zoomOut}                     // 👈 nuevo
              onActionDone={() => {
                setGoToTarget(false);
                setResetView(false);
                setZoomIn(false);
                setZoomOut(false);                  // 👈 limpia Zoom Out también
              }}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
};

export default App;
