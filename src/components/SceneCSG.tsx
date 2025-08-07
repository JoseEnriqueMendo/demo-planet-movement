// src/components/SceneCSG.tsx
import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import Stats from 'stats.js';

const params = {
  operation: SUBTRACTION,
  useGroups: true,
  wireframe: false,
};

export const SceneCSG = () => {
  const [result, setResult] = useState<THREE.Mesh | null>(null);

  const baseBrush = useRef<Brush>(null);
  const brush = useRef<Brush>(null);
  const core = useRef<Brush>(null);
  const evaluator = useRef<Evaluator>(new Evaluator());
  const wireframe = useRef<THREE.Mesh>(
    new THREE.Mesh(
      undefined,
      new THREE.MeshBasicMaterial({ wireframe: true, color: 0x009688 })
    )
  );
  const shadowPlane = useRef<THREE.Mesh>(null!);
  const statsRef = useRef<Stats>(null);

  const { scene, camera, gl: renderer } = useThree();

  // Initial setup
  useEffect(() => {
    camera.position.set(-1, 1, 1).normalize().multiplyScalar(10);
    scene.background = new THREE.Color(0xfce4ec);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbfd4d2, 3));

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight.position.set(1, 4, 3).multiplyScalar(3);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.setScalar(2048);
    dirLight.shadow.bias = -1e-4;
    dirLight.shadow.normalBias = 1e-4;
    scene.add(dirLight);

    // Plane shadow
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(),
      new THREE.ShadowMaterial({
        color: 0xd81b60,
        transparent: true,
        opacity: 0.075,
        side: THREE.DoubleSide,
      })
    );
    plane.position.y = -3;
    plane.rotation.x = -Math.PI / 2;
    plane.scale.setScalar(10);
    plane.receiveShadow = true;
    shadowPlane.current = plane;
    scene.add(plane);

    // Wireframe placeholder
    scene.add(wireframe.current);

    // GUI manual si deseas
    // const gui = new GUI();
    // gui.add(params, "operation", { SUBTRACTION, INTERSECTION, ADDITION });
    // gui.add(params, "wireframe");
    // gui.add(params, "useGroups");

    // Stats
    statsRef.current = new Stats();
    document.body.appendChild(statsRef.current.dom);

    return () => {
      if (statsRef.current) document.body.removeChild(statsRef.current.dom);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    const t = performance.now() + 9000;

    // Animar brushes
    if (baseBrush.current && brush.current) {
      baseBrush.current.rotation.set(t * 0.0001, t * 0.00025, t * 0.0005);
      baseBrush.current.updateMatrixWorld();

      brush.current.rotation.set(t * -0.0002, t * -0.0005, t * -0.001);
      const s = 0.5 + 0.5 * (1 + Math.sin(t * 0.001));
      brush.current.scale.set(s, 1, s);
      brush.current.updateMatrixWorld();

      // Evaluar CSG
      evaluator.current.useGroups = params.useGroups;
      const newResult = evaluator.current.evaluate(
        baseBrush.current,
        brush.current,
        params.operation,
        undefined // Always pass undefined or a Brush here
      );

      newResult.castShadow = true;
      newResult.receiveShadow = true;

      if (result) scene.remove(result);
      scene.add(newResult);
      setResult(newResult);

      // Wireframe
      wireframe.current.geometry = newResult.geometry;
      wireframe.current.visible = params.wireframe;
    }

    statsRef.current?.update();
  });

  return (
    <>
      <primitive
        object={
          (baseBrush.current = new Brush(
            new THREE.IcosahedronGeometry(2, 3),
            new THREE.MeshStandardMaterial({
              flatShading: true,
              polygonOffset: true,
              polygonOffsetUnits: 1,
              polygonOffsetFactor: 1,
            })
          ))
        }
      />
      <primitive
        object={
          (brush.current = new Brush(
            new THREE.CylinderGeometry(1, 1, 5, 45),
            new THREE.MeshStandardMaterial({
              color: 0x80cbc4,
              polygonOffset: true,
              polygonOffsetUnits: 1,
              polygonOffsetFactor: 1,
            })
          ))
        }
      />
      <primitive
        object={
          (core.current = new Brush(
            new THREE.IcosahedronGeometry(0.15, 1),
            new THREE.MeshStandardMaterial({
              flatShading: true,
              color: 0xff9800,
              emissive: 0xff9800,
              emissiveIntensity: 0.35,
              polygonOffset: true,
              polygonOffsetUnits: 1,
              polygonOffsetFactor: 1,
            })
          ))
        }
      />
    </>
  );
};
