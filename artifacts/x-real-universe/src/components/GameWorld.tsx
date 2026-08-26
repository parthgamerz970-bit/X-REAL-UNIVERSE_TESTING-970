import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import * as THREE from 'three';
import { ArrowLeft, Camera, Download, Pause, Play, RotateCcw } from 'lucide-react';

type GameWorldProps = {
  onExit: () => void;
};

type InputState = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  run: boolean;
};

const WORLD_SIZE = 86;
const GRID_SIZE = 48;
const PLAYER_HEIGHT = 2.55;
const FIRST_PERSON_PITCH_LIMITS = { min: -0.9, max: 0.86 };
const THIRD_PERSON_PITCH_LIMITS = { min: 0.12, max: 1.05 };

type LakeDefinition = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  depth: number;
};

const LAKES: LakeDefinition[] = [
  { x: -24, z: -9, radiusX: 6.4, radiusZ: 3.9, depth: 0.8 },
  { x: 24, z: 14, radiusX: 4.8, radiusZ: 3.1, depth: 0.66 },
];

type RockPatch = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  count: number;
};

const ROCK_PATCHES: RockPatch[] = [
  { x: -30, z: -23, radiusX: 7.8, radiusZ: 5.3, count: 7 },
  { x: 29, z: -20, radiusX: 6.6, radiusZ: 4.4, count: 6 },
  { x: -31, z: 25, radiusX: 7.4, radiusZ: 5.6, count: 7 },
  { x: 30, z: 27, radiusX: 5.9, radiusZ: 4.8, count: 6 },
];

function baseTerrainHeight(x: number, z: number) {
  const broad = Math.sin(x * 0.12 + 0.8) * 0.38 + Math.cos(z * 0.1 - 0.35) * 0.3;
  const cross = Math.sin((x + z) * 0.075) * 0.22 + Math.cos((x - z) * 0.055) * 0.16;
  const hillA = Math.max(0, 1 - Math.hypot(x + 15, z - 11) / 22) ** 2 * 4.2;
  const hillB = Math.max(0, 1 - Math.hypot(x - 19, z + 18) / 20) ** 2 * 3.2;
  const shoulder = Math.max(0, 1 - Math.hypot(x - 24, z - 4) / 25) ** 2 * 0.75;
  const basin = Math.max(0, 1 - Math.hypot(x - 3, z - 4) / 13) ** 2 * 0.95;
  const detail = Math.sin(x * 0.47 + z * 0.13) * 0.075 + Math.cos(z * 0.42 - x * 0.18) * 0.055;
  return Math.max(-0.45, broad + cross + hillA + hillB + shoulder - basin + detail);
}

function terrainHeight(x: number, z: number) {
  let height = baseTerrainHeight(x, z);
  for (const lake of LAKES) {
    const nx = (x - lake.x) / lake.radiusX;
    const nz = (z - lake.z) / lake.radiusZ;
    const distance = nx * nx + nz * nz;
    if (distance < 1) {
      height -= lake.depth * (1 - distance) ** 2;
    }
  }
  return height;
}

function lakeWaterLevel(lake: LakeDefinition) {
  return baseTerrainHeight(lake.x, lake.z) - lake.depth * 0.26;
}

function isInsideLake(x: number, z: number) {
  return LAKES.some((lake) => {
    const nx = (x - lake.x) / lake.radiusX;
    const nz = (z - lake.z) / lake.radiusZ;
    return nx * nx + nz * nz < 0.92;
  });
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#91a085';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const colors = ['#a3ae8a', '#748b78', '#839477', '#b0aa7e', '#667e70'];
  for (let i = 0; i < 115; i += 1) {
    const x = (i * 37) % 64;
    const y = (i * 53 + 11) % 64;
    const size = 0.35 + (i % 4) * 0.22;
    context.fillStyle = colors[i % colors.length];
    context.globalAlpha = 0.18 + (i % 5) * 0.035;
    context.fillRect(x, y, size, size * (0.65 + (i % 3) * 0.18));
  }
  context.globalAlpha = 0.16;
  context.strokeStyle = '#d0c993';
  context.lineWidth = 0.45;
  for (let i = -64; i < 128; i += 11) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + 32, 64);
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13, 13);
  texture.anisotropy = 4;
  return texture;
}

function makeTerrain() {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const step = WORLD_SIZE / GRID_SIZE;
  const half = WORLD_SIZE / 2;

  for (let iz = 0; iz <= GRID_SIZE; iz += 1) {
    for (let ix = 0; ix <= GRID_SIZE; ix += 1) {
      const x = ix * step - half;
      const z = iz * step - half;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);
      const noise = Math.sin(x * 0.9) * 0.035 + Math.cos(z * 0.65) * 0.025;
       const color = y > 2.7
        ? new THREE.Color('#899b84')
        : y > 0.8
          ? new THREE.Color('#a6ab7a')
          : new THREE.Color('#aaa076');
       color.offsetHSL(0, noise * 0.8, noise);
      colors.push(color.r, color.g, color.b);
    }
  }

  for (let iz = 0; iz < GRID_SIZE; iz += 1) {
    for (let ix = 0; ix < GRID_SIZE; ix += 1) {
      const a = iz * (GRID_SIZE + 1) + ix;
      const b = a + 1;
      const c = a + GRID_SIZE + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const groundTexture = makeGroundTexture();
  const material = new THREE.MeshStandardMaterial({
    map: groundTexture ?? undefined,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    flatShading: false,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  return ground;
}

function addWaterBodies(scene: THREE.Scene) {
  const waterGroup = new THREE.Group();
  waterGroup.name = 'Prototype Lakes';
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: '#5aa6aa',
    emissive: '#16454a',
    emissiveIntensity: 0.22,
    roughness: 0.18,
    metalness: 0.12,
    clearcoat: 0.55,
    clearcoatRoughness: 0.24,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide,
  });
  const sheenMaterial = new THREE.MeshBasicMaterial({
    color: '#c7fff1',
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  });

  for (const lake of LAKES) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), waterMaterial);
    water.name = 'Lake surface';
    water.rotation.x = -Math.PI / 2;
    water.position.set(lake.x, lakeWaterLevel(lake), lake.z);
    water.scale.set(lake.radiusX, lake.radiusZ, 1);
    water.receiveShadow = true;
    waterGroup.add(water);

    const sheen = new THREE.Mesh(new THREE.CircleGeometry(0.78, 40), sheenMaterial);
    sheen.rotation.x = -Math.PI / 2;
    sheen.rotation.z = lake.x * 0.04;
    sheen.position.set(lake.x - lake.radiusX * 0.16, lakeWaterLevel(lake) + 0.012, lake.z - lake.radiusZ * 0.11);
    sheen.scale.set(lake.radiusX, lake.radiusZ * 0.25, 1);
    waterGroup.add(sheen);
  }

  scene.add(waterGroup);
}

function addHabitatDetails(scene: THREE.Scene) {
  const details = new THREE.Group();
  const rockGeometry = new THREE.DodecahedronGeometry(0.45, 0);
  const rockColors = ['#6f7780', '#8d8170', '#596a68', '#9c927e'];
  let rockIndex = 0;
  for (const patch of ROCK_PATCHES) {
    for (let i = 0; i < patch.count; i += 1) {
      const seed = rockIndex + i * 17;
      const angle = seed * 2.31;
      const radius = 0.28 + ((seed * 13) % 71) / 100;
      const x = patch.x + Math.cos(angle) * patch.radiusX * radius;
      const z = patch.z + Math.sin(angle) * patch.radiusZ * radius;
      if (isInsideLake(x, z)) continue;
      const scale = 0.38 + ((seed * 7) % 9) / 18;
      const rock = new THREE.Mesh(
        rockGeometry,
        new THREE.MeshStandardMaterial({ color: rockColors[rockIndex % rockColors.length], roughness: 1, flatShading: true }),
      );
      rock.position.set(x, terrainHeight(x, z) + scale * 0.3, z);
      rock.scale.set(scale * 1.2, scale * (0.55 + (seed % 3) * 0.14), scale);
      rock.rotation.set(seed * 0.37, seed * 0.71, seed * 0.19);
      rock.castShadow = true;
      rock.receiveShadow = true;
      details.add(rock);
      rockIndex += 1;
    }
  }

  const marker = new THREE.Group();
  const markerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.6, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: '#273d46', roughness: 0.8, metalness: 0.3 }),
  );
  markerBase.position.y = terrainHeight(0, -4) + 0.12;
  marker.add(markerBase);
  const markerPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6),
    new THREE.MeshStandardMaterial({ color: '#82e8df', emissive: '#244c56', emissiveIntensity: 0.7 }),
  );
  markerPole.position.y = terrainHeight(0, -4) + 1.2;
  marker.add(markerPole);
  const markerLight = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22, 0),
    new THREE.MeshStandardMaterial({ color: '#c5fff0', emissive: '#7ff1dd', emissiveIntensity: 1.4 }),
  );
  markerLight.position.y = terrainHeight(0, -4) + 2.34;
  marker.add(markerLight);
  marker.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  details.add(marker);
  scene.add(details);
  addWaterBodies(scene);
}

function makePlayer() {
  const player = new THREE.Group();
  player.name = 'Explorer';
  const suit = new THREE.MeshStandardMaterial({ color: '#d3d9d0', roughness: 0.75, metalness: 0.12 });
  const darkSuit = new THREE.MeshStandardMaterial({ color: '#33434a', roughness: 0.82, metalness: 0.1 });
  const visor = new THREE.MeshStandardMaterial({ color: '#6ee6e1', emissive: '#2e686b', emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.45 });

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.43), darkSuit);
  hips.position.y = 1.08;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.05, 0.52), suit);
  torso.position.y = 1.78;
  torso.rotation.z = -0.03;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 0.55), darkSuit);
  chest.position.set(0, 1.88, -0.03);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.43, 1), suit);
  head.position.y = 2.65;
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.08), visor);
  visorMesh.position.set(0, 2.67, -0.4);
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.65, 3, 6), suit);
  const armR = armL.clone();
  armL.position.set(-0.61, 1.79, 0);
  armR.position.set(0.61, 1.79, 0);
  const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.72, 3, 6), darkSuit);
  const legR = legL.clone();
  legL.position.set(-0.24, 0.55, 0);
  legR.position.set(0.24, 0.55, 0);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.52), darkSuit);
  const bootR = bootL.clone();
  bootL.position.set(-0.24, 0.12, -0.1);
  bootR.position.set(0.24, 0.12, -0.1);

  player.add(hips, torso, chest, head, visorMesh, armL, armR, legL, legR, bootL, bootR);
  player.userData.limbs = { armL, armR, legL, legR };
  player.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return player;
}

export function GameWorld({ onExit }: GameWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onExitRef = useRef(onExit);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [firstPerson, setFirstPerson] = useState(false);
  const firstPersonRef = useRef(false);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const joystickRef = useRef({ x: 0, y: 0 });
  const keys = useRef<InputState>({ forward: false, back: false, left: false, right: false, run: false });
  const cameraAngles = useRef({ yaw: 0.55, pitch: 0.38, distance: 7.5 });
  const drag = useRef({ active: false, x: 0, y: 0 });
  const playerRef = useRef<THREE.Group | null>(null);

  onExitRef.current = onExit;
  const setPausedState = (value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
  };
  const setCameraMode = (value: boolean) => {
    if (value && !firstPersonRef.current) {
      cameraAngles.current.pitch = 0.04;
    } else if (!value && firstPersonRef.current) {
      cameraAngles.current.pitch = 0.38;
    } else {
      cameraAngles.current.pitch = value
        ? THREE.MathUtils.clamp(cameraAngles.current.pitch, FIRST_PERSON_PITCH_LIMITS.min, FIRST_PERSON_PITCH_LIMITS.max)
        : THREE.MathUtils.clamp(cameraAngles.current.pitch, THIRD_PERSON_PITCH_LIMITS.min, THIRD_PERSON_PITCH_LIMITS.max);
    }
    firstPersonRef.current = value;
    setFirstPerson(value);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8baeb1');
    scene.fog = new THREE.Fog('#8baeb1', 34, 92);
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 150);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const hemi = new THREE.HemisphereLight('#d8f0e8', '#435c55', 1.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff0cf', 3.1);
    sun.position.set(-24, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 85;
    scene.add(sun);
    scene.add(new THREE.AmbientLight('#8aa7c0', 0.22));
    scene.add(makeTerrain());
    addHabitatDetails(scene);

    const player = makePlayer();
    player.position.set(0, terrainHeight(0, 5), 5);
    scene.add(player);
    playerRef.current = player;

    const movement = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    const target = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const cameraRay = new THREE.Vector3();
    const cameraCandidate = new THREE.Vector3();
    const cameraLookTarget = new THREE.Vector3();
    const cameraLookDirection = new THREE.Vector3();
    const cameraLookMatrix = new THREE.Matrix4();
    const cameraLookQuaternion = new THREE.Quaternion();
    const skyColor = new THREE.Color();
    const daySky = new THREE.Color('#8baeb1');
    const nightSky = new THREE.Color('#202d4a');
    let worldTime = 0.18;
    let grounded = true;
    let jumpQueued = false;
    let walkTime = 0;
    let last = performance.now();

    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const keyChange = (event: KeyboardEvent, value: boolean) => {
      const key = event.key.toLowerCase();
      if (key === 'w' || key === 'arrowup') keys.current.forward = value;
      if (key === 's' || key === 'arrowdown') keys.current.back = value;
      if (key === 'a' || key === 'arrowleft') keys.current.left = value;
      if (key === 'd' || key === 'arrowright') keys.current.right = value;
      if (key === 'shift') keys.current.run = value;
      if (key === ' ') {
        if (value && !event.repeat) jumpQueued = true;
        event.preventDefault();
      }
      if ((key === 'v' || key === 'f5') && value && !event.repeat) {
        event.preventDefault();
        setCameraMode(!firstPersonRef.current);
      }
      if (key === 'escape' && value && !event.repeat) setPausedState(!pausedRef.current);
    };
    const keyDown = (event: KeyboardEvent) => keyChange(event, true);
    const keyUp = (event: KeyboardEvent) => keyChange(event, false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    const frame = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      worldTime = (worldTime + delta / 150) % 1;
      const sunAngle = worldTime * Math.PI * 2;
      const daylight = THREE.MathUtils.clamp(Math.sin(sunAngle) * 0.5 + 0.5, 0.08, 1);
      skyColor.lerpColors(nightSky, daySky, daylight);
      scene.background = skyColor;
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(skyColor);
      sun.position.set(Math.cos(sunAngle) * 30, 10 + daylight * 30, Math.sin(sunAngle) * 25);
      sun.intensity = 0.6 + daylight * 2.5;
      hemi.intensity = 0.7 + daylight * 0.85;
      if (!pausedRef.current) {
        const inputX = Number(keys.current.right) - Number(keys.current.left) + joystickRef.current.x;
        const inputY = Number(keys.current.forward) - Number(keys.current.back) - joystickRef.current.y;
        const length = Math.hypot(inputX, inputY);
        const normalizedX = length > 1 ? inputX / length : inputX;
        const normalizedY = length > 1 ? inputY / length : inputY;
        // The explorer's model faces local -Z (the visor is on that side).
        // Keep the input basis aligned with that facing direction so W is
        // always forward and the joystick matches desktop movement.
        const forward = new THREE.Vector3(
          -Math.sin(cameraAngles.current.yaw),
          0,
          -Math.cos(cameraAngles.current.yaw),
        );
        const right = new THREE.Vector3(
          Math.cos(cameraAngles.current.yaw),
          0,
          -Math.sin(cameraAngles.current.yaw),
        );
        movement.set(0, 0, 0).addScaledVector(right, normalizedX).addScaledVector(forward, normalizedY);
        const moving = movement.lengthSq() > 0.001;
        const speed = keys.current.run ? 6.8 : 4.1;
        if (moving) movement.normalize().multiplyScalar(speed);
        velocity.x = THREE.MathUtils.damp(velocity.x, movement.x, moving ? 10 : 14, delta);
        velocity.z = THREE.MathUtils.damp(velocity.z, movement.z, moving ? 10 : 14, delta);
        if (jumpQueued && grounded) {
          velocity.y = 7.2;
          grounded = false;
        }
        jumpQueued = false;
        velocity.y -= 17 * delta;
        player.position.x = THREE.MathUtils.clamp(player.position.x + velocity.x * delta, -39, 39);
        player.position.z = THREE.MathUtils.clamp(player.position.z + velocity.z * delta, -39, 39);
        const floor = terrainHeight(player.position.x, player.position.z);
        player.position.y += velocity.y * delta;
        if (player.position.y <= floor) {
          player.position.y = floor;
          velocity.y = 0;
          grounded = true;
        }
        if (moving) {
          walkTime += delta * (keys.current.run ? 11 : 7);
          const limbs = player.userData.limbs as Record<string, THREE.Object3D>;
          limbs.armL.rotation.x = Math.sin(walkTime) * 0.48;
          limbs.armR.rotation.x = -Math.sin(walkTime) * 0.48;
          limbs.legL.rotation.x = -Math.sin(walkTime) * 0.42;
          limbs.legR.rotation.x = Math.sin(walkTime) * 0.42;
          player.rotation.y = Math.atan2(-movement.x, -movement.z);
        } else {
          const limbs = player.userData.limbs as Record<string, THREE.Object3D>;
          limbs.armL.rotation.x = THREE.MathUtils.damp(limbs.armL.rotation.x, 0, 8, delta);
          limbs.armR.rotation.x = THREE.MathUtils.damp(limbs.armR.rotation.x, 0, 8, delta);
          limbs.legL.rotation.x = THREE.MathUtils.damp(limbs.legL.rotation.x, 0, 8, delta);
          limbs.legR.rotation.x = THREE.MathUtils.damp(limbs.legR.rotation.x, 0, 8, delta);
        }
      }

      player.visible = !firstPersonRef.current;
      target.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.48, player.position.z);
      const { yaw, pitch, distance } = cameraAngles.current;
      if (firstPersonRef.current) {
        desiredCamera.set(player.position.x, player.position.y + 2.28, player.position.z);
      } else {
        desiredCamera.set(
          target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
          target.y + Math.sin(pitch) * distance,
          target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
        );
        // Keep the follow camera above the local terrain while orbiting low or
        // standing on one of the prototype's taller hills.
        desiredCamera.y = Math.max(
          desiredCamera.y,
          terrainHeight(desiredCamera.x, desiredCamera.z) + 1.1,
        );
        // Resolve the complete camera ray, not only its endpoint. This keeps
        // the follow camera from tunneling through a hill when orbiting.
        cameraRay.subVectors(desiredCamera, target);
        let safeT = 1;
        for (let step = 1; step <= 18; step += 1) {
          const t = step / 18;
          cameraCandidate.copy(target).addScaledVector(cameraRay, t);
          if (cameraCandidate.y < terrainHeight(cameraCandidate.x, cameraCandidate.z) + 1.05) {
            safeT = Math.max(0.27, (step - 1) / 18);
            break;
          }
        }
        if (safeT < 1) desiredCamera.copy(target).addScaledVector(cameraRay, safeT);
        desiredCamera.y = Math.max(desiredCamera.y, terrainHeight(desiredCamera.x, desiredCamera.z) + 1.1);
      }
      camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, delta));
      if (firstPersonRef.current) {
        cameraLookDirection.set(
          -Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        );
        cameraLookTarget.copy(desiredCamera).addScaledVector(cameraLookDirection, 10);
      } else {
        cameraLookTarget.copy(target);
      }
      cameraLookMatrix.lookAt(camera.position, cameraLookTarget, camera.up);
      cameraLookQuaternion.setFromRotationMatrix(cameraLookMatrix);
      camera.quaternion.slerp(cameraLookQuaternion, 1 - Math.pow(0.0001, delta));
      renderer.render(scene, camera);
      animation = requestAnimationFrame(frame);
    };
    let animation = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animation);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
          else object.material.dispose();
        }
      });
      playerRef.current = null;
    };
  }, []);

  const updateJoystick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width / 2;
    const x = (event.clientX - (rect.left + radius)) / radius;
    const y = (event.clientY - (rect.top + radius)) / radius;
    const next = { x: THREE.MathUtils.clamp(x, -1, 1), y: THREE.MathUtils.clamp(y, -1, 1) };
    joystickRef.current = next;
    setJoystick(next);
  };
  const stopJoystick = () => {
    joystickRef.current = { x: 0, y: 0 };
    setJoystick({ x: 0, y: 0 });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    cameraAngles.current.yaw -= dx * 0.008;
    const limits = firstPersonRef.current ? FIRST_PERSON_PITCH_LIMITS : THIRD_PERSON_PITCH_LIMITS;
    cameraAngles.current.pitch = THREE.MathUtils.clamp(cameraAngles.current.pitch - dy * 0.006, limits.min, limits.max);
  };
  const handlePointerUp = () => { drag.current.active = false; };
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    cameraAngles.current.distance = THREE.MathUtils.clamp(cameraAngles.current.distance + event.deltaY * 0.008, 4.1, 12);
  };
  const resetCamera = () => {
    cameraAngles.current = { yaw: 0.55, pitch: 0.38, distance: 7.5 };
  };
  const captureScreenshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `exovanta-prototype-03-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <main
      className="world-screen"
      aria-label="Exovanta playable habitat"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="world-canvas" data-testid="canvas-playable-world" />
      <div className="world-vignette" aria-hidden="true" />
      <div className="world-topbar">
        <div className="world-brand" data-testid="status-habitat">
          <span className="world-brand-mark" aria-hidden="true" />
          <div><strong>EXOVANTA</strong><span>HABITAT 01 / FIELD TEST</span></div>
        </div>
        <div className="world-status"><span className="status-dot" />OFFLINE SIMULATION</div>
        <button
          className="camera-mode-button"
          type="button"
          data-testid="button-camera-mode"
          aria-pressed={firstPerson}
          aria-label={`Switch to ${firstPerson ? 'third-person' : 'first-person'} camera`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setCameraMode(!firstPersonRef.current)}
        >
          <Camera size={14} strokeWidth={1.7} />
          <span>{firstPerson ? 'First person' : 'Third person'}</span>
        </button>
        <button
          className="screenshot-button"
          type="button"
          data-testid="button-screenshot"
          aria-label="Capture screenshot"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={captureScreenshot}
        >
          <Download size={14} strokeWidth={1.7} />
          <span>Capture</span>
        </button>
        <button className="pause-button" type="button" data-testid="button-pause" onClick={() => setPausedState(!pausedRef.current)}>
          <Pause size={14} strokeWidth={1.7} /><span>Pause</span>
        </button>
      </div>
      <div className="world-crosshair" aria-hidden="true" />
      <p className="world-hint">WASD MOVE&nbsp;&nbsp; / &nbsp;&nbsp;SHIFT RUN&nbsp;&nbsp; / &nbsp;&nbsp;SPACE JUMP&nbsp;&nbsp; / &nbsp;&nbsp;DRAG LOOK&nbsp;&nbsp; / &nbsp;&nbsp;F5 VIEW</p>

      <div className="mobile-controls" aria-label="Touch controls">
        <div
          className="joystick"
          data-testid="control-joystick"
          onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); updateJoystick(event); }}
          onPointerMove={(event) => { event.stopPropagation(); if (event.currentTarget.hasPointerCapture(event.pointerId)) updateJoystick(event); }}
          onPointerUp={(event) => { event.stopPropagation(); stopJoystick(); }}
          onPointerCancel={stopJoystick}
        >
          <span className="joystick-knob" style={{ transform: `translate(${joystick.x * 29}px, ${joystick.y * 29}px)` }} />
        </div>
        <div className="touch-camera-area" data-testid="control-camera-area">
          <span className="touch-camera-label">DRAG TO ORBIT</span>
        </div>
        <button className="jump-button" type="button" data-testid="button-jump" onPointerDown={(event) => { event.stopPropagation(); window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); }}>
          JUMP
        </button>
      </div>

      {paused && (
        <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Simulation paused">
          <div className="pause-card">
            <p className="pause-kicker">FIELD TEST / HOLD</p>
            <h2 className="pause-title">Paused</h2>
            <p className="pause-copy">The habitat is waiting. Resume your walk or return to the launch deck.</p>
            <div className="pause-actions">
              <button type="button" data-testid="button-resume" onClick={() => setPausedState(false)}><Play size={14} /> Resume simulation</button>
              <button type="button" data-testid="button-return-menu" onClick={onExitRef.current}><ArrowLeft size={14} /> Return to menu</button>
              <button type="button" data-testid="button-reset-view" onClick={resetCamera}><RotateCcw size={14} /> Reset camera</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}