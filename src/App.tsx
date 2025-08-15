import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import BasicSphere from './components/BasicSphere';
import { OrbitControls, Billboard } from '@react-three/drei';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import Plot from 'react-plotly.js';
// importación de imagenes
import logoSmall from '/assets/logo-lds-movil.png';
import success from '/assets/success.png';
import alert from '/assets/alert.png';
import warning from '/assets/warning.png';
import cam1 from '/assets/cam1.jpg';
import cam2 from '/assets/cam2.jpg';
import cam3 from '/assets/cam3.jpg';
import cam4 from '/assets/cam4.webp';
import cam5 from '/assets/cam5.jpg';
import cam6 from '/assets/cam6.jpg';

type Lang = 'es' | 'en' | 'zh';

const M: Record<Lang, Record<string, string>> = {
  es: {
    focusPeru: 'Enfocar Perú',
    focusChina: 'Enfocar China',
    unlock: 'Desbloquear',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    langLabel: 'Idioma',
    date: 'Fecha',
    hour: 'Hora',
    distribucion: 'Distribución',
    generacion: 'Generación',
    subestaciones: 'Subestaciones',
    medicionInteligente: 'Medición Inteligente',
    enero: 'Enero',
    febrero: 'Febrero',
    marzo: 'Marzo',
    abril: 'Abril',
    mayo: 'Mayo',
    junio: 'Junio',
    julio: 'Julio',
    agosto: 'Agosto',
    septiembre: 'Septiembre',
    octubre: 'Octubre',
    noviembre: 'Noviembre',
    diciembre: 'Diciembre',
    nombre: 'Nombre',
    informacion: 'Información',
    verDetalles: 'Ver detalles',
    maximaDemandaForecast: 'Máxima demanda forecast',
    generacionMetaEnergia: 'Generación meta de energía',
  },
  en: {
    focusPeru: 'Focus Peru',
    focusChina: 'Focus China',
    unlock: 'Unlock',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    langLabel: 'Language',
    date: 'Date',
    hour: 'Hour',
    distribucion: 'Distribution',
    generacion: 'Generation',
    subestaciones: 'Substations',
    medicionInteligente: 'Smart Metering',
    enero: 'January',
    febrero: 'February',
    marzo: 'March',
    abril: 'April',
    mayo: 'May',
    junio: 'June',
    julio: 'July',
    agosto: 'August',
    septiembre: 'September',
    octubre: 'October',
    noviembre: 'November',
    diciembre: 'December',
    nombre: 'Name',
    informacion: 'Information',
    verDetalles: 'View details',
    maximaDemandaForecast: 'Maximum demand forecast',
    generacionMetaEnergia: 'Target energy generation',
  },
  zh: {
    focusPeru: '聚焦秘鲁',
    focusChina: '聚焦中国',
    unlock: '解除锁定',
    zoomIn: '放大',
    zoomOut: '缩小',
    langLabel: '语言',
    date: '日期',
    hour: '小时',
    distribucion: '配电',
    generacion: '发电',
    subestaciones: '变电站',
    medicionInteligente: '智能计量',
    enero: '一月',
    febrero: '二月',
    marzo: '三月',
    abril: '四月',
    mayo: '五月',
    junio: '六月',
    julio: '七月',
    agosto: '八月',
    septiembre: '九月',
    octubre: '十月',
    noviembre: '十一月',
    diciembre: '十二月',
    nombre: '名称',
    informacion: '信息',
    verDetalles: '查看详情',
    maximaDemandaForecast: '最大需求预测',
    generacionMetaEnergia: '能源发电目标',
  },
};

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
  km / (111.32 * Math.cos((latDeg * Math.PI) / 180));

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
    const x = (Math.random() - 0.5) * widthKm; // Este (+), Oeste (-)
    const y = (Math.random() - 0.5) * heightKm; // Norte (+), Sur (-)

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
  pxSize?: number; // tamaño objetivo en píxeles
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
          color={['#ff0000', '#00a000', '#0000ff'][Math.floor(Math.random() * 3)]}
        />
      </mesh>
    </Billboard>
  );
};

const CityHalos: React.FC<{ cities: City[]; radius: number; visible: boolean }> = ({
  cities,
  radius,
  visible,
}) => {
  const positions = React.useMemo(
    () =>
      cities.map((c, i) => ({
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
  zoomOut = false, // 👈 nuevo
  onActionDone,
}) => {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  // Estados internos para la animación por fases
  const phaseRef = useRef<'idle' | 'azimuth' | 'polar' | 'zoomIn' | 'zoomOut'>('idle');
  const desiredDirRef = useRef<THREE.Vector3 | null>(null);

  // Guardamos la distancia orbital previa al Zoom In para "deshacer"
  const preZoomDistRef = useRef<number | null>(null); // 👈 nuevo

  // Configuración (ajusta a tu gusto)
  const speedAzimuth = 0.08; // 0.03–0.12
  const speedPolar = 0.07;
  const speedZoom = 0.06;
  const equatorFirst = true; // 👈 fuerza pasar por el ecuador

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
    if (phaseRef.current === 'zoomOut') {
      // 👈 nuevo
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

  const initialCameraPos = useRef<[number, number, number]>([0, 0, 5]); // ejemplo
  const initialTarget = useRef<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    if (camera) {
      initialCameraPos.current = [camera.position.x, camera.position.y, camera.position.z];
    }
    if (controlsRef.current) {
      const target = controlsRef.current.target;
      initialTarget.current = [target.x, target.y, target.z];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetView && controlsRef.current && camera) {
      controlsRef.current.autoRotate = true;
      controlsRef.current.enableRotate = true;
      controlsRef.current.enableZoom = true;
      controlsRef.current.enablePan = true;
      controlsRef.current.enableDamping = true;
      controlsRef.current.dampingFactor = 0.08;

      controlsRef.current.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetView]);

  useEffect(() => {
    if (zoomIn) {
      // Guardamos la distancia actual ANTES de acercar, para poder deshacer
      preZoomDistRef.current = camera.position.length(); // 👈 clave
      // Usa la dirección deseada actual (si existe) o la actual de la cámara
      if (!desiredDirRef.current) {
        desiredDirRef.current = camera.position.clone().normalize();
      }
      phaseRef.current = 'zoomIn';
    }
  }, [zoomIn, camera]);

  useEffect(() => {
    if (zoomOut) {
      // 👈 nuevo
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
  const [zoomOut, setZoomOut] = useState(false); // 👈 nuevo
  const [activeLabel, setActiveLabel] = useState<'peru' | 'china' | null>(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [pendingZoomIn, setPendingZoomIn] = useState(false);
  const [haloPoints, setHaloPoints] = useState<City[]>([]);

  const [lang, setLang] = useState<Lang>(() => {
    // opcional: detectar idioma del navegador
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith('es')) return 'es';
    if (nav.startsWith('zh')) return 'zh';
    return 'en';
  });
  const t = (key: string) => M[lang][key] ?? key;

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
          100, // widthKm (E-O)
          300, // heightKm (N-S)
          20, // cantidad (ajusta)
          28, // angleDeg (horario negativo)
          40 // biasEastKm (mueve rectángulo hacia el Este)
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

  const [horaLima, setHoraLima] = useState('');
  const [fechaLima, setHFechaLima] = useState('');
  const clipPath1 = 'polygon(10% 0, 80% 0, 90% 42% , 100% 48% , 88% 100% , 0 100% )';
  const clipPath2 = 'polygon(0 0, 100% 0, 90% 100% , 10% 100%)';
  const clipPath3 = 'polygon(6% 0, 100% 0, 100% 100% , 0% 100%)';
  const clipPathUp1 = 'polygon(0 0, 100% 0, 70% 100% , 65% 80%, 35% 80%,  30% 100% )';
  const months = [
    t('enero'),
    t('febrero'),
    t('marzo'),
    t('abril'),
    t('mayo'),
    t('junio'),
    t('julio'),
    t('agosto'),
    t('septiembre'),
    t('octubre'),
    t('noviembre'),
    t('diciembre'),
  ];

  useEffect(() => {
    const actualizarHora = () => {
      const fecha = new Date();
      const fechaLima = fecha.toLocaleDateString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
      const hora = fecha.toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      setHoraLima(hora);
      setHFechaLima(fechaLima);
    };

    actualizarHora();
    const intervalo = setInterval(actualizarHora, 1000);

    return () => clearInterval(intervalo);
  }, []);

  const [dataExample1, setDataExample1] = useState([
    28, 30, 25, 8, 15, 9, 22, 10, 12, 17, 20, 24,
  ]);

  const [dataExample2, setDataExample2] = useState([
    [10, 15, 8, 20, 12, 18, 25, 22, 17, 30, 28, 24],
    [28, 30, 25, 8, 15, 9, 22, 10, 12, 17, 20, 24],
  ]);

  const [opcionSelect1, setOpcionSelect1] = useState('op1-1');
  const [opcionSelect2, setOpcionSelect2] = useState('op2-1');

  const CardImage: React.FC<{
    title: string;
    description: string;
    image: string;
  }> = ({ title, description, image }) => {
    return (
      <div className="border flex flex-col w-[7vw] ">
        <img src={image} className="w-[7vw] h-[8vh]" />
        <div className="flex flex-row  h-7 gap-1">
          <div className=" bg-[#0d2538]  p-1 w-7 h-full  flex items-center justify-center align-middle">
            <div className="bg-amber-50 w-2 h-2 rounded-full "></div>
          </div>
          <div className="flex flex-col text-[9px] ">
            <p className="truncate">{title}</p>
            <p className="truncate">{description}</p>
          </div>
        </div>
      </div>
    );
  };

  const CardData: React.FC<{
    hour: string;
    date: string;
    type: string;
    description: string;
    title: string;
  }> = ({ hour, description, date, title, type }) => {
    return (
      <div
        className={
          'flex flex-row w-full py-2  px-1 items-center text-[9px]  bg-gradient-to-r  justify-around ' +
          (type == 'alert'
            ? 'from-[#c02311] via-[#101C34] to-[#040B27] '
            : 'from-[#314D62] via-[#101C34] to-[#040B27]')
        }
      >
        <img
          src={type == 'alert' ? alert : type == 'warning' ? warning : success}
          className={' h-fit ' + (type == 'warning' ? ' w-6' : 'w-4')}
        />
        <div className="flex flex-col max-w-[80%]">
          <p>{`${t('nombre')}: ${title}`}</p>
          <p>{`${t('informacion')}: ${description} ${date} ${hour}`}</p>
        </div>

        <div className="border-[0.5px] w-10 text-[8px] text-center"> {t('verDetalles')}</div>
      </div>
    );
  };

  return (
    <div className="bg-[#011338] min-w-[100vw] min-h-[100vh]">
      <div className="w-full  min-h-[7vh] h-[7vh]  flex flex-row  justify-center  items-center px-[1vw]">
        {/* barras de abajo*/}
        {/* opciones izquierda */}
        <div className="flex flex-row items-center gap-3 w-[15vw] text-white max-xl:text-xs">
          <label className="flex items-center gap-2">
            {t('langLabel')}:
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Lang)}
              className="  bg-transparent   border border-gray-400   rounded-md   px-4 py-1   text-white  focus:outline-none   focus:border-blue-400  "
            >
              <option value="es" className="bg-[#0a1f44]">
                Español
              </option>
              <option value="en" className="bg-[#0a1f44]">
                English
              </option>
              <option value="zh" className="bg-[#0a1f44]">
                中文
              </option>
            </select>
          </label>
        </div>

        {/* barra del centro */}
        <div
          className="px-[3px] pb-[3px]   bg-white mb-auto w-[65%] h-full "
          style={{
            clipPath: clipPathUp1,
          }}
        >
          <div
            className="bg-[#040B27] p-2  h-full  flex flex-row items-center justify-center gap-6 text-center"
            style={{
              clipPath: clipPathUp1,
            }}
          >
            <h1
              className="text-4xl mt-10 mb-15 font-bold text-[#a7f2fc] max-xl:text-2xl"
              style={{ textShadow: '0 0 10px #5e8bff' }}
            >
              Information Center
            </h1>
          </div>
        </div>
        {/* opciones derecha */}
        <div className="flex flex-row gap-3 w-[15vw]  text-base   max-xl:text-xs max-xl:flex-col max-xl:gap-0  items-center justify-center align-middle ">
          <p> {t('date') + ': ' + fechaLima}</p>

          <p>{t('hour') + ': ' + horaLima}</p>
        </div>
      </div>
      <div className="relative w-full min-h-[82vh] flex flex-row items-center justify-center  overflow-hidden">
        {/* Estrellas */}
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white animate-twinkle"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
            }}
          ></div>
        ))}
        {/* lateral izquierdo */}
        {activeLabel && isZoomedIn && (
          <div className="overflow-hidden bg-gradient-to-tr from-[#03253f] via-[#101C34] to-[#040B27] w-[25%] max-w-[22.8vw] h-[95%] border-[0.2px] absolute top-8 left-5  rounded-xs shadow-lg">
            <div className=" pl-2 bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27] shadow-2xl px-[0.3vw] py-[0.5vw] border-b-[0.5px] flex flex-row gap-2 items-center">
              {/* <div className="rounded-full w-[0.5vw] h-[0.5vw] bg-[#4656a0] "></div> */}
              <p className="font-bold font-serif"> {'🔹' + t('distribucion')}</p>
            </div>
            <div className="relative isolate p-4  bg-white/5 backdrop-blur shadow-xl border border-white/10">
              <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] blur-2xl bg-gradient-to-br from-fuchsia-500/25 via-cyan-400/20 to-emerald-500/25"></div>
              {/* opciones */}

              <div className="w-full mx-auto   min-h-10 flex flex-row items-center  justify-center gap-[0.2vw] text-xs truncate max-xl:text-[8px]">
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-1' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-1');
                    setDataExample1([28, 30, 25, 8, 15, 9, 22, 10, 12, 17, 20, 24]);
                  }}
                >
                  2020
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-2' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-2');
                    setDataExample1([12, 25, 28, 17, 24, 9, 22, 8, 15, 30, 10, 20]);
                  }}
                >
                  2021
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-3' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-3');
                    setDataExample1([28, 10, 24, 22, 20, 17, 8, 25, 30, 12, 15, 9]);
                  }}
                >
                  2022
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-4' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-4');
                    setDataExample1([10, 30, 28, 12, 17, 20, 8, 15, 24, 22, 25, 9]);
                  }}
                >
                  2023
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-5' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-5');
                    setDataExample1([28, 12, 9, 10, 30, 25, 15, 20, 8, 17, 22, 24]);
                  }}
                >
                  2024
                </button>
              </div>
              <div className=" w-[26vw] max-xl:w-[30vw] bg-transparent p-0 m-0 h-[26vh] ">
                <Plot
                  data={[
                    {
                      x: months,
                      y: dataExample1,
                      type: 'scatter',
                      mode: 'lines+markers', // línea + puntos
                      fill: 'tozeroy',
                      fillcolor: 'rgba(70, 86, 160, 0.3)', // color del área
                      line: { color: '#4656a0', width: 1 }, // color de la línea
                      marker: {
                        color: '#fffff', // color de los puntos
                        size: 5, // tamaño de los puntos
                        line: { color: 'white', width: 1 }, // borde de cada punto
                      },
                    },
                  ]}
                  layout={{
                    title: {
                      text:
                        '<span  style="color:white; text-shadow: 2px 2px 4px #4656a0;">' +
                        t('maximaDemandaForecast') +
                        '</span>',
                      x: 0.15, // posición horizontal (0 = izquierda, 0.5 = centro, 1 = derecha)
                      xanchor: 'left', // anclar desde la izquierda para que no se corra
                      y: 0.85, // control vertical
                      yanchor: 'top',
                    },
                    xaxis: { tickfont: { color: 'white', size: 10 } },
                    yaxis: { tickfont: { color: 'white', size: 10 } },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                  }}
                  useResizeHandler={true}
                  className="w-full  ml-[-3.5vw] mt-[-2vh] h-[300px]  text-gray-600"
                  config={{
                    responsive: true,
                    displayModeBar: false,
                  }}
                />
              </div>
            </div>
            <div className="pl-2 bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27] shadow-2xl px-[0.3vw] py-[0.5vw] border-t-[2px] border-b-[0.5px] flex flex-row gap-2 items-center">
              {/* <div className="rounded-full w-[0.5vw] h-[0.5vw] bg-[#4656a0] "></div> */}
              <p className="font-bold font-serif"> {'🔹' + t('generacion')}n</p>
            </div>
            <div className="relative isolate px-6   bg-white/5 backdrop-blur shadow-xl border border-white/10">
              <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] blur-2xl bg-gradient-to-br from-fuchsia-500/25 via-cyan-400/20 to-emerald-500/25"></div>

              <div className=" mt-3 w-full mx-auto  min-h-10 flex flex-row items-center  justify-center gap-[0.2vw] text-xs truncate max-xl:text-[8px]">
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect2 == 'op2-1' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect2('op2-1');
                    setDataExample2([
                      [12, 15, 9, 21, 13, 19, 26, 23, 18, 31, 29, 25],
                      [29, 31, 26, 9, 16, 12, 17, 24, 13, 18, 21, 25],
                    ]);
                  }}
                >
                  2020
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect2 == 'op2-2' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect2('op2-2');
                    setDataExample2([
                      [11, 14, 8, 19, 12, 17, 24, 24, 8, 14, 27, 23],
                      [27, 29, 19, 12, 17, 9, 21, 24, 19, 32, 30, 19, 23],
                    ]);
                  }}
                >
                  2021
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect2 == 'op2-3' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect2('op2-3');
                    setDataExample2([
                      [13, 11, 24, 13, 14, 20, 27, 24, 19, 32, 30, 26],
                      [30, 32, 27, 10, 16, 11, 24, 13, 14, 19, 22, 26],
                    ]);
                  }}
                >
                  2022
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect2 == 'op2-4' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect2('op2-4');
                    setDataExample2([
                      [9, 13, 7, 18, 11, 16, 23, 20, 15, 28, 26, 22],
                      [26, 28, 25, 14, 15, 8, 20, 9, 11, 15, 18, 22],
                    ]);
                  }}
                >
                  2023
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect2 == 'op2-5' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect2('op2-5');
                    setDataExample2([
                      [14, 18, 12, 23, 15, 21, 28, 25, 20, 33, 31, 27],
                      [20, 33, 28, 12, 18, 13, 25, 14, 15, 20, 23, 27],
                    ]);
                  }}
                >
                  2024
                </button>
              </div>
              <div className="   w-[400px] bg-transparent p-0 m-0 h-[300px] ">
                <Plot
                  data={[
                    {
                      x: months,
                      y: dataExample2[0],
                      type: 'scatter',
                      mode: 'lines+markers',
                      fill: 'tozeroy',
                      fillcolor: 'rgba(0, 123, 255, 0.3)',
                      marker: { color: 'blue', size: 8 },
                      line: { color: 'blue', width: 2 },
                      name: 'Serie 1',
                    },
                    {
                      x: months,
                      y: dataExample2[1],
                      type: 'scatter',
                      mode: 'lines+markers',
                      fill: 'tozeroy',
                      fillcolor: 'rgba(255, 0, 0, 0.3)',
                      marker: { color: 'red', size: 8 },
                      line: { color: 'red', width: 2 },
                      name: 'Serie 2',
                    },
                  ]}
                  layout={{
                    title: {
                      text:
                        '<span  style="color:white; text-shadow: 2px 2px 4px #4656a0;">' +
                        t('generacionMetaEnergia') +
                        '</span>',

                      x: 0.05, // posición horizontal (0 = izquierda, 0.5 = centro, 1 = derecha)
                      xanchor: 'left', // anclar desde la izquierda para que no se corra
                      y: 0.85, // control vertical
                      yanchor: 'top',
                    },
                    paper_bgcolor: 'transparent',
                    plot_bgcolor: 'transparent',
                    margin: { l: 30, r: 0 },
                    xaxis: {
                      tickfont: { color: 'white', size: 10 },
                    },
                    yaxis: {
                      tickfont: { color: 'white', size: 10 },
                    },
                    legend: { font: { color: 'white' } },
                  }}
                  config={{
                    responsive: true,
                    displayModeBar: false,
                  }}
                  className="w-full ml-[-1vw]  mt-[-1vh] h-[300px]  text-gray-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* Planeta */}
        <div className=" rounded-full  z-10 h-[75vh] w-[50vw]">
          <Canvas camera={{ position: [0, 0, 5] }} shadows>
            <ambientLight intensity={1} />
            <directionalLight position={[5, 5, 5]} castShadow />
            <BasicSphere radius={radius} />
            <CityHalos cities={haloPoints} radius={radius} visible={isZoomedIn} />
            {/* 👇 Un solo controlador de cámara */}
            <CameraController
              lat={dest.lat}
              lon={dest.lon}
              radius={radius}
              goToTarget={goToTarget}
              resetView={resetView}
              zoomIn={zoomIn}
              zoomOut={zoomOut} // 👈 nuevo
              onActionDone={() => {
                setGoToTarget(false);
                setResetView(false);
                if (pendingZoomIn) {
                  setIsZoomedIn(true); // 👈 esto dispara el efecto que genera puntos
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
        {/* lateral derecho */}
        {activeLabel && isZoomedIn && (
          <div className="overflow-hidden bg-gradient-to-tr from-[#03253f] via-[#101C34] to-[#040B27] w-[25%] max-w-[22.8vw] h-[95%] border-[0.2px] absolute top-8 right-5  rounded-xs shadow-lg">
            <div className=" pl-2 bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27] shadow-2xl px-[0.3vw] py-[0.5vw] border-b-[0.5px] flex flex-row gap-2 items-center">
              {/* <div className="rounded-full w-[0.5vw] h-[0.5vw] bg-[#4656a0] "></div> */}
              <p className="font-bold font-serif">{'🔹' + t('subestaciones')}</p>
            </div>
            <div className="relative isolate p-4  bg-white/5 backdrop-blur shadow-xl border border-white/10">
              <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] blur-2xl bg-gradient-to-br from-fuchsia-500/25 via-cyan-400/20 to-emerald-500/25"></div>
              {/* opciones */}

              <div className="w-full mx-auto   min-h-10 flex flex-row items-center  justify-center gap-[0.2vw] text-xs truncate max-xl:text-[8px]">
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-1' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-1');
                    setDataExample1([28, 30, 25, 8, 15, 9, 22, 10, 12, 17, 20, 24]);
                  }}
                >
                  2020
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-2' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-2');
                    setDataExample1([12, 25, 28, 17, 24, 9, 22, 8, 15, 30, 10, 20]);
                  }}
                >
                  2021
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-3' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-3');
                    setDataExample1([28, 10, 24, 22, 20, 17, 8, 25, 30, 12, 15, 9]);
                  }}
                >
                  2022
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-4' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-4');
                    setDataExample1([10, 30, 28, 12, 17, 20, 8, 15, 24, 22, 25, 9]);
                  }}
                >
                  2023
                </button>
                <button
                  className={
                    ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] ' +
                    (opcionSelect1 == 'op1-5' ? 'via-[#609ca7]' : '')
                  }
                  onClick={() => {
                    setOpcionSelect1('op1-5');
                    setDataExample1([28, 12, 9, 10, 30, 25, 15, 20, 8, 17, 22, 24]);
                  }}
                >
                  2024
                </button>
              </div>

              <div className="grid grid-cols-3">
                <CardImage
                  title="Subestación Santa Rosa"
                  description="Lima Norte"
                  image={cam1}
                />
                <CardImage title="Subestación Ventanilla" description="Callao" image={cam2} />
                <CardImage
                  title="Subestación Carabayllo"
                  description="Carabayllo"
                  image={cam3}
                />
                <CardImage
                  title="Subestación Chorrillos"
                  description="Chorrillos"
                  image={cam4}
                />
                <CardImage title="Subestación Huachipa" description="Ate" image={cam5} />
                <CardImage title="Subestación San Juan" description="SJL" image={cam6} />
              </div>
              {/* <div className="rounded-full w-[0.5vw] h-[0.5vw] bg-[#4656a0] "></div> */}
            </div>
            <div className="pl-2 bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27] shadow-2xl px-[0.3vw] py-[0.5vw] border-t-[2px] border-b-[0.5px] flex flex-row gap-2 items-center">
              {/* <div className="rounded-full w-[0.5vw] h-[0.5vw] bg-[#4656a0] "></div> */}
              <p className="font-bold font-serif">{'🔹' + t('medicionInteligente')}</p>
            </div>
            <div className="relative isolate px-6   bg-white/5 backdrop-blur shadow-xl border border-white/10">
              <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] blur-2xl bg-gradient-to-br from-fuchsia-500/25 via-cyan-400/20 to-emerald-500/25"></div>
            </div>
            <div className="w-full mt-[1vh] mx-auto   min-h-10 flex flex-row items-center  justify-center gap-[0.2vw] text-xs truncate max-xl:text-[8px]">
              <button
                className={
                  ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] '
                }
              >
                2020
              </button>
              <button
                className={
                  ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] '
                }
              >
                2021
              </button>
              <button
                className={
                  ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] '
                }
              >
                2022
              </button>
              <button
                className={
                  ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] '
                }
              >
                2023
              </button>
              <button
                className={
                  ' border-[0.5px] h-[3vh] w-[4vw] bg-gradient-to-r from-[#314D62] via-[#101C34] to-[#040B27]shadow-2xl cursor-pointer hover:via-[#609ca7] '
                }
              >
                2024
              </button>
            </div>
            <div className="flex flex-col gap-2  mx-auto w-[92%] mt-[1vh] max-h-[280px] overflow-auto">
              <CardData
                hour="10:15 AM"
                date="15/08/2025"
                type="alert"
                title="Corte programado en Miraflores"
                description="El suministro eléctrico se interrumpirá de 10:00 a 14:00 por trabajos de mantenimiento."
              />
              <CardData
                hour="11:30 AM"
                date="15/08/2025"
                type="warning"
                title="Posibles interrupciones en San Isidro"
                description="Debido a condiciones climáticas, podrían producirse cortes temporales en algunas zonas."
              />
              <CardData
                hour="12:05 PM"
                date="15/08/2025"
                type="success"
                title="Restablecimiento de servicio"
                description="El suministro eléctrico se ha restablecido con normalidad en Surco y La Molina."
              />
              <CardData
                hour="1:45 PM"
                date="15/08/2025"
                type="alert"
                title="Corte de emergencia en Callao"
                description="Una falla en la red ha provocado la interrupción del servicio. Estamos trabajando para solucionarlo."
              />
              <CardData
                hour="2:20 PM"
                date="15/08/2025"
                type="warning"
                title="Trabajo de poda preventiva"
                description="Se realizará la poda de árboles cercanos a las líneas eléctricas en Chorrillos. Puede haber cortes breves."
              />
            </div>
          </div>
        )}
      </div>

      <div className="w-full min-h-[8vh]  flex flex-row items-center justify-center pb-[2vh]  ">
        {/* barras  izquierda*/}
        <div
          className="p-[1px] bg-white h-[3.3vh] max-xl:h-[4.5vh] -mr-[1vw]  mt-auto xl:mb-1"
          style={{
            clipPath: clipPath3,
            transform: 'scaleX(-1)',
          }}
        >
          <div
            className="bg-[#040B27] p-2 w-[20vw]  h-[3vh] max-xl:h-[4.1vh] pl-8 flex flex-row gap-5 items-center"
            style={{
              clipPath: clipPath3,
            }}
          >
            <div className="w-[8px] h-[8px] rounded-full bg-[#3f8aa4] "> </div>
            <div className="w-[6px] h-[6px] rounded-full bg-[#3f8aa4] "> </div>
            <div className="w-[4px] h-[4px] rounded-full bg-[#3f8aa4] "> </div>
          </div>
        </div>

        {/* diseño boton 1 izquierdo */}
        <div
          className="p-[1.5px] bg-white mt-2 "
          style={{
            clipPath: clipPath1,
            transform: 'scaleX(-1)',
          }}
        >
          <div
            className={
              'bg-gradient-to-r from-[#314D62] to-[#040B27] p-4 w-[10vw] max-xl:text-xs truncate hover:via-[#2a4986] ' +
              (activeLabel === 'peru' ? 'via-[#0509ee] hover:via-[#0509ee] ' : ' ')
            }
            style={{
              clipPath: clipPath1,
            }}
          >
            <button
              className={
                'w-full text-center font-semibold transform scale-x-[-1]  cursor-pointer'
              }
              onClick={() => {
                setActiveLabel('peru');
                setDest(LIMA_ANCHOR);
                setGoToTarget(true);
              }}
            >
              {t('focusPeru')}
            </button>
          </div>
        </div>
        {/* diseño boton 2 izquierdo */}
        <div
          className="p-[1.5px] bg-white mt-2 -ml-4"
          style={{
            clipPath: clipPath2,
          }}
        >
          <div
            className={
              'bg-gradient-to-r from-[#314D62] to-[#040B27] truncate  max-xl:text-xs p-4 w-[10vw]  hover:via-[#2a4986] ' +
              (activeLabel === 'china' ? 'via-[#0509ee] hover:via-[#0509ee]' : ' ')
            }
            style={{
              clipPath: clipPath2,
            }}
          >
            <button
              className={' w-full text-center font-semibold   cursor-pointer'}
              onClick={() => {
                setActiveLabel('china');
                setDest(BEIJING_ANCHOR);
                setGoToTarget(true);
              }}
            >
              {t('focusChina')}
            </button>
          </div>
        </div>
        {/* logo */}
        <div>
          <div
            className="relative group flex  w-[4vw] h-[4vw] bg-gradient-to-b from-blue-500 to-blue-700 rounded-full border-2 border-teal-300 items-center justify-center cursor pointer"
            onClick={() => {
              setResetView(true);
              setIsZoomedIn(false);
              setActiveLabel(null);
            }}
          >
            <img src={logoSmall} alt="Luz del Sur" className="w-[95%]" />
            <span
              className="absolute bottom-full mb-2 hidden group-hover:block 
                   bg-gray-800 text-white text-sm px-2 py-1 rounded shadow-lg"
            >
              {t('unlock')}
            </span>
          </div>{' '}
        </div>

        {/* diseño boton 2 derecho */}
        <div
          className="p-[1.5px] bg-white mt-2 -mr-4"
          style={{
            clipPath: clipPath2,
            transform: 'scaleX(-1)',
          }}
        >
          <div
            className="bg-gradient-to-r from-[#314D62] via-[#101C34] max-xl:text-xs to-[#040B27]  p-4 w-[10vw]  hover:via-[#2a4986] "
            style={{
              clipPath: clipPath2,
            }}
          >
            <button
              className=" w-full text-center font-semibold transform scale-x-[-1]  cursor-pointer"
              onClick={() => {
                setPendingZoomIn(true);
                setZoomIn(true);
              }}
              disabled={!activeLabel}
            >
              {t('zoomIn')}
            </button>
          </div>
        </div>

        {/* diseño 1 boton derecho */}

        <div
          className="p-[1.5px] bg-white mt-2"
          style={{
            clipPath: clipPath1,
          }}
        >
          <div
            className="bg-gradient-to-r from-[#314D62] via-[#101C34] max-xl:text-xs to-[#040B27] p-4 w-[10vw]  hover:via-[#2a4986] "
            style={{
              clipPath: clipPath1,
            }}
          >
            <button
              className=" w-full text-center font-semibold cursor-pointer"
              onClick={() => {
                setIsZoomedIn(false);
                setZoomOut(true);
              }}
            >
              {t('zoomOut')}
            </button>
          </div>
        </div>
        {/* barra derecha */}
        <div
          className="p-[1.5px] bg-white h-[3.3vh] max-xl:h-[4.5vh]  mt-auto -ml-[1vw] xl:mb-1 "
          style={{
            clipPath: clipPath3,
          }}
        >
          <div
            className="bg-[#040B27] p-2 w-[20vw] h-[3vh] max-xl:h-[4.1vh] pl-8 flex flex-row gap-5 items-center "
            style={{
              clipPath: clipPath3,
            }}
          >
            <div className="w-[8px] h-[8px] rounded-full bg-[#3f8aa4] "> </div>
            <div className="w-[6px] h-[6px] rounded-full bg-[#3f8aa4] "> </div>
            <div className="w-[4px] h-[4px] rounded-full bg-[#3f8aa4] "> </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
