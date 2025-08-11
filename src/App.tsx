import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import BasicSphere from './components/BasicSphere';
import { OrbitControls, Billboard, Html } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import logoImg from '/assets/logo-lds.png' // tu logo

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

// Anclas para el foco (coinciden con el centro de los halos)
const LIMA_ANCHOR = { lat: -10.0464, lon: -77.0428 };
const BEIJING_ANCHOR = { lat: 39.9042, lon: 116.4074 };

// Conversión km -> grados (varía con la latitud para la longitud)
const kmToDegLat = (km: number) => km / 110.574; // aprox
const kmToDegLon = (km: number, latDeg: number) =>
  km / (111.320 * Math.cos((latDeg * Math.PI) / 180));

type City = { lat: number; lon: number };

/**
 * Genera puntos dentro de un rectángulo (widthKm x heightKm) en el plano local
 * ENU (E = +x, N = +y), rotado por angleDeg respecto a E (horario negativo).
 * - (lat0, lon0) es el centro del rectángulo
 * - biasEastKm desplaza todo el rectángulo hacia el Este (útil para Perú)
 */
function scatterRectRotated(
  lat0: number,
  lon0: number,
  widthKm: number,
  heightKm: number,
  count: number,
  angleDeg: number = 0,
  biasEastKm: number = 0
): City[] {
  const out: City[] = [];
  const theta = (angleDeg * Math.PI) / 180; // rad
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  for (let i = 0; i < count; i++) {
    // coordenadas uniformes en el rectángulo, centradas
    const x = (Math.random() - 0.5) * widthKm;   // Este (+), Oeste (-)
    const y = (Math.random() - 0.5) * heightKm;  // Norte (+), Sur (-)

    // rotación alrededor del centro
    const xr = x * c - y * s + biasEastKm; // sesgo al Este si quieres alejar del mar
    const yr = x * s + y * c;

    // pasa a grados en torno al centro
    const dLat = kmToDegLat(yr);
    const dLon = kmToDegLon(xr, lat0);

    out.push({ lat: lat0 + dLat, lon: lon0 + dLon });
  }
  return out;
}

// Convierte un tamaño en píxeles a tamaño en "mundo" para la distancia/fov actuales
const worldSizeForPixels = (
  px: number,
  distance: number,
  fovDeg: number,
  viewportHeightPx: number
) => {
  const fov = (fovDeg * Math.PI) / 180;
  const worldHeightAtD = 2 * distance * Math.tan(fov / 2);
  return (px / viewportHeightPx) * worldHeightAtD;
};

const CityHalo: React.FC<{
  position: THREE.Vector3;
  pxSize?: number;   // tamaño objetivo en píxeles
  phase?: number;
}> = ({ position, pxSize = 26, phase = 0 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const { camera, size } = useThree();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + phase); // 0..1

    const dist = camera.position.distanceTo(position);
    const base = worldSizeForPixels(
      pxSize,
      dist,
      (camera as THREE.PerspectiveCamera).fov,
      size.height
    );
    const scale = base * (0.9 + 0.2 * pulse); // pulso ±10%

    if (meshRef.current) meshRef.current.scale.setScalar(scale);
    if (matRef.current) matRef.current.opacity = 0.22 + 0.25 * pulse;
  });

  return (
    <Billboard position={position}>
      <mesh ref={meshRef}>
        <circleGeometry args={[0.5, 64]} />
        <meshBasicMaterial
          ref={matRef}
          transparent
          blending={THREE.NormalBlending}
          color={["#ff0000", "#00a000", "#0000ff"][Math.floor(Math.random() * 3)]}
        />
      </mesh>
    </Billboard>
  );
};

const CityHalos: React.FC<{ cities: City[]; radius: number; visible: boolean; }>
  = ({ cities, radius, visible }) => {
    const positions = React.useMemo(
      () => cities.map((c, i) => ({
        pos: latLonToVec3(c.lat, c.lon, radius * 1.015), // 1.5% sobre la esfera
        phase: (i * Math.PI * 2) / Math.max(1, cities.length),
      })),
      [cities, radius]
    );

    if (!visible) return null;
    return (
      <>
        {positions.map(({ pos, phase }, idx) => (
          <CityHalo key={idx} position={pos} phase={phase} />
        ))}
      </>
    );
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
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [pendingZoomIn, setPendingZoomIn] = useState(false);
  const [haloPoints, setHaloPoints] = useState<City[]>([]);

  useEffect(() => {
    if (!isZoomedIn || !activeLabel) {
      setHaloPoints([]);
      return;
    }

    if (activeLabel === 'peru') {
      // Rectángulo de ~250 km (ancho) x 600 km (alto), girado ~-35°
      // Empujamos ~40 km al Este para evitar océano
      setHaloPoints(
        scatterRectRotated(
          LIMA_ANCHOR.lat + 1,
          LIMA_ANCHOR.lon - 0.8,
          100,   // widthKm (E-O)
          300,   // heightKm (N-S)
          20,   // cantidad (ajusta)
          28,   // angleDeg (horario negativo)
          40     // biasEastKm (mueve rectángulo hacia el Este)
        )
      );
    } else {
      // Beijing: rectángulo ~300 x 300 km sin sesgo, sin rotar
      setHaloPoints(
        scatterRectRotated(
          BEIJING_ANCHOR.lat - 1,
          BEIJING_ANCHOR.lon - 0.9,
          300,
          300,
          30,
          0,
          0
        )
      );
    }
  }, [isZoomedIn, activeLabel]);

  return (



    <div style={{ width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => {
            setActiveLabel('peru');
            setDest(LIMA_ANCHOR);
            setGoToTarget(true);
          }}
          className={activeLabel === 'peru' ? 'btn btn-accent' : 'btn btn-ghost'}
        >
          Focus Perú
        </button>

        <button
          onClick={() => {
            setActiveLabel('china');
            setDest(BEIJING_ANCHOR);
            setGoToTarget(true);
          }}
          className={activeLabel === 'china' ? 'btn btn-accent' : 'btn btn-ghost'}
        >
          Focus China
        </button>

        <button
          onClick={() => {
            setResetView(true);
            setIsZoomedIn(false);   // 👈
            setActiveLabel(null);
          }}
          className="btn btn-ghost"
        >
          Desbloquear
        </button>

        <button
          onClick={() => { setPendingZoomIn(true); setZoomIn(true); }}
          className="btn btn-primary"
          disabled={!activeLabel}
        >
          Zoom In
        </button>

        <button
          onClick={() => { setIsZoomedIn(false); setZoomOut(true); }}
          className="btn btn-primary"
        >
          Zoom Out
        </button>
      </div>

      {/* estilos… (deja tus <style> tal cual) */}

      <div style={{ display: 'flex' }}>
        <div style={{ width: '50vw', height: '75vh', borderRadius: '24px', overflow: 'hidden' }}>
          <Canvas camera={{ position: [0, 0, 5] }} shadows>
            <color attach="background" args={['#020a21']} />
            <Html fullscreen>
              <img
                src={logoImg}        // o "/logo-lds.png" si está en public
                alt="Luz del Sur"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 16,
                  width: 140,            // ajusta tamaño
                  pointerEvents: 'none', // no bloquea el drag del OrbitControls
                  userSelect: 'none',
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.35))'
                }}
              />
            </Html>

            <ambientLight intensity={1} />

            <directionalLight position={[5, 5, 5]} castShadow />

            <BasicSphere radius={radius} />

            <CityHalos
              cities={haloPoints}
              radius={radius}
              visible={isZoomedIn}
            />

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
                if (pendingZoomIn) {
                  setIsZoomedIn(true);     // 👈 esto dispara el efecto que genera puntos
                  setPendingZoomIn(false);
                  // Si además quieres que se acerque más, asegúrate de que aquí se llame setZoomIn(true)
                  // si no lo estás haciendo antes.
                }
                setZoomIn(false);
                setZoomOut(false);
              }}
            />
          </Canvas>
        </div>
      </div>
    </div>
  );
};

export default App;
