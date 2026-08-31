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
const FIRST_PERSON_PITCH_LIMITS = { min: -0.72, max: 0.62 };
const THIRD_PERSON_PITCH_LIMITS = { min: 0.12, max: 1.05 };

type LakeDefinition = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  depth: number;
  rotation: number;
};

const LAKES: LakeDefinition[] = [
  { x: -24, z: -9, radiusX: 6.4, radiusZ: 3.9, depth: 0.8, rotation: -0.18 },
  { x: 24, z: 14, radiusX: 4.8, radiusZ: 3.1, depth: 0.66, rotation: 0.3 },
  { x: -10, z: 27, radiusX: 4.7, radiusZ: 2.8, depth: 0.58, rotation: -0.42 },
  { x: 14, z: -27, radiusX: 5.3, radiusZ: 3.15, depth: 0.7, rotation: 0.16 },
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
  { x: 6, z: 20, radiusX: 5.4, radiusZ: 3.2, count: 4 },
];

function seededValue(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function baseTerrainHeight(x: number, z: number) {
  const broad = Math.sin(x * 0.12 + 0.8) * 0.38 + Math.cos(z * 0.1 - 0.35) * 0.3;
  const cross = Math.sin((x + z) * 0.075) * 0.22 + Math.cos((x - z) * 0.055) * 0.16;
  const hillA = Math.max(0, 1 - Math.hypot(x + 15, z - 11) / 22) ** 2 * 4.2;
  const hillB = Math.max(0, 1 - Math.hypot(x - 19, z + 18) / 20) ** 2 * 3.2;
  const shoulder = Math.max(0, 1 - Math.hypot(x - 24, z - 4) / 25) ** 2 * 0.75;
  const basin = Math.max(0, 1 - Math.hypot(x - 3, z - 4) / 13) ** 2 * 1.15;
  const valley = Math.max(0, 1 - Math.hypot(x + 8, z + 18) / 18) ** 2 * 0.9;
  const ridge = Math.sin((x * 0.18) - (z * 0.13)) * 0.12;
  const detail = Math.sin(x * 0.47 + z * 0.13) * 0.075 + Math.cos(z * 0.42 - x * 0.18) * 0.055;
  return Math.max(-0.55, broad + cross + hillA + hillB + shoulder - basin - valley + ridge + detail);
}

function terrainHeight(x: number, z: number) {
  let height = baseTerrainHeight(x, z);
  for (const lake of LAKES) {
    const cos = Math.cos(lake.rotation);
    const sin = Math.sin(lake.rotation);
    const dx = x - lake.x;
    const dz = z - lake.z;
    const nx = (dx * cos + dz * sin) / lake.radiusX;
    const nz = (-dx * sin + dz * cos) / lake.radiusZ;
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
    const cos = Math.cos(lake.rotation);
    const sin = Math.sin(lake.rotation);
    const dx = x - lake.x;
    const dz = z - lake.z;
    const nx = (dx * cos + dz * sin) / lake.radiusX;
    const nz = (-dx * sin + dz * cos) / lake.radiusZ;
    return nx * nx + nz * nz < 0.92;
  });
}

function terrainSlope(x: number, z: number) {
  const sample = 0.55;
  const xSlope = terrainHeight(x + sample, z) - terrainHeight(x - sample, z);
  const zSlope = terrainHeight(x, z + sample) - terrainHeight(x, z - sample);
  return Math.hypot(xSlope, zSlope) / (sample * 2);
}

function terrainColor(x: number, z: number, height: number) {
  const grass = new THREE.Color('#7f9a7e');
  const meadow = new THREE.Color('#a0aa7b');
  const sand = new THREE.Color('#b6aa7d');
  const dryGrass = new THREE.Color('#8f9870');
  const color = new THREE.Color();
  const lowlandMix = THREE.MathUtils.smoothstep(height, -0.2, 1.15);
  color.lerpColors(sand, meadow, lowlandMix);
  color.lerp(grass, THREE.MathUtils.smoothstep(height, 1.2, 3.15) * 0.72);
  color.lerp(dryGrass, THREE.MathUtils.clamp(terrainSlope(x, z) * 0.95, 0, 0.35));

  let shoreMix = 0;
  for (const lake of LAKES) {
    const cos = Math.cos(lake.rotation);
    const sin = Math.sin(lake.rotation);
    const dx = x - lake.x;
    const dz = z - lake.z;
    const nx = (dx * cos + dz * sin) / lake.radiusX;
    const nz = (-dx * sin + dz * cos) / lake.radiusZ;
    const distance = Math.hypot(nx, nz);
    shoreMix = Math.max(shoreMix, 1 - THREE.MathUtils.smoothstep(distance, 0.86, 1.18));
  }
  color.lerp(sand, shoreMix * 0.58);
  color.offsetHSL((seededValue(x * 0.7 + z * 1.3) - 0.5) * 0.025, 0, (seededValue(x * 1.9 - z * 0.8) - 0.5) * 0.05);
  return color;
}

function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#9aa27c';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const colors = ['#a9ad82', '#7c967b', '#879a76', '#b5aa7d', '#6f8875'];
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

function makeSkyDome() {
  const uniforms = {
    topColor: { value: new THREE.Color('#4f879f') },
    horizonColor: { value: new THREE.Color('#d0c08f') },
    bottomColor: { value: new THREE.Color('#637f86') },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vDirection;
      void main() {
        float height = clamp(vDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 lower = mix(bottomColor, horizonColor, smoothstep(0.08, 0.52, height));
        vec3 sky = mix(lower, topColor, smoothstep(0.48, 0.94, height));
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(118, 24, 16), material);
  mesh.name = 'Procedural atmosphere';
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

function makeStarField() {
  const positions: number[] = [];
  for (let i = 0; i < 150; i += 1) {
    const angle = i * 2.399963;
    const height = 0.18 + seededValue(i * 4.17) * 0.78;
    const ring = Math.sqrt(1 - height * height);
    const radius = 94 + seededValue(i * 2.31) * 14;
    positions.push(
      Math.cos(angle) * ring * radius,
      height * radius,
      Math.sin(angle) * ring * radius,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#e5f4ff',
    size: 0.28,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'Night star field';
  return stars;
}

function makeClouds() {
  const clouds = new THREE.Group();
  clouds.name = 'Lightweight cloud layers';
  const cloudGeometry = new THREE.SphereGeometry(1, 8, 6);
  const cloudMaterial = new THREE.MeshLambertMaterial({
    color: '#f2f3e7',
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  const cloudSeeds = [
    { x: -42, z: -33, y: 18, scale: 1.2, speed: 0.28 },
    { x: -10, z: 3, y: 22, scale: 0.85, speed: 0.22 },
    { x: 28, z: -18, y: 19, scale: 1.35, speed: 0.31 },
    { x: 48, z: 18, y: 24, scale: 0.9, speed: 0.24 },
    { x: 8, z: 38, y: 20, scale: 1.05, speed: 0.26 },
  ];
  for (const [cloudIndex, seed] of cloudSeeds.entries()) {
    const cloud = new THREE.Group();
    cloud.position.set(seed.x, seed.y, seed.z);
    cloud.userData.baseX = seed.x;
    cloud.userData.speed = seed.speed;
    cloud.userData.phase = cloudIndex * 7.4;
    const puffs = 3 + (cloudIndex % 3);
    for (let i = 0; i < puffs; i += 1) {
      const puff = new THREE.Mesh(cloudGeometry, cloudMaterial);
      puff.position.set((i - 1) * 1.05, seededValue(i + cloudIndex * 9) * 0.28, (i % 2) * 0.28);
      puff.scale.set(
        seed.scale * (1.25 - (i % 2) * 0.15),
        seed.scale * (0.36 + (i % 3) * 0.08),
        seed.scale * (0.7 + (i % 2) * 0.15),
      );
      cloud.add(puff);
    }
    clouds.add(cloud);
  }
  clouds.userData.cloudMaterial = cloudMaterial;
  return clouds;
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
      const color = terrainColor(x, z, y);
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
  const waterGeometry = new THREE.CircleGeometry(1, 48);
  const sheenGeometry = new THREE.CircleGeometry(0.78, 40);
  const shoreGeometry = new THREE.RingGeometry(0.92, 1.08, 48);
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    color: '#4c9fa4',
    emissive: '#123b43',
    emissiveIntensity: 0.18,
    roughness: 0.16,
    metalness: 0.16,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const sheenMaterial = new THREE.MeshBasicMaterial({
    color: '#d5fff0',
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  });
  const shoreMaterial = new THREE.MeshStandardMaterial({
    color: '#b4a67a',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  for (const lake of LAKES) {
    const level = lakeWaterLevel(lake);
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.name = 'Lake surface';
    water.rotation.x = -Math.PI / 2;
    water.rotation.z = lake.rotation;
    water.position.set(lake.x, level, lake.z);
    water.scale.set(lake.radiusX, lake.radiusZ, 1);
    water.receiveShadow = true;
    water.renderOrder = 1;
    waterGroup.add(water);

    const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);
    shore.name = 'Lake shoreline';
    shore.rotation.x = -Math.PI / 2;
    shore.rotation.z = lake.rotation;
    shore.position.set(lake.x, level - 0.035, lake.z);
    shore.scale.set(lake.radiusX, lake.radiusZ, 1);
    shore.receiveShadow = true;
    waterGroup.add(shore);

    const sheen = new THREE.Mesh(sheenGeometry, sheenMaterial);
    sheen.rotation.x = -Math.PI / 2;
    sheen.rotation.z = lake.rotation + lake.x * 0.04;
    sheen.position.set(lake.x - lake.radiusX * 0.16, level + 0.012, lake.z - lake.radiusZ * 0.11);
    sheen.scale.set(lake.radiusX, lake.radiusZ * 0.25, 1);
    sheen.renderOrder = 2;
    waterGroup.add(sheen);
  }

  scene.add(waterGroup);
}

function addVegetation(scene: THREE.Scene) {
  const vegetation = new THREE.Group();
  vegetation.name = 'Controlled habitat vegetation';
  const grassGeometry = new THREE.ConeGeometry(0.11, 0.58, 3);
  const grassMaterial = new THREE.MeshStandardMaterial({
    color: '#6f926f',
    roughness: 1,
    metalness: 0,
  });
  const grass = new THREE.InstancedMesh(grassGeometry, grassMaterial, 140);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  let grassCount = 0;

  for (let x = -37; x <= 37 && grassCount < 140; x += 4.4) {
    for (let z = -37; z <= 37 && grassCount < 140; z += 4.7) {
      const seed = x * 17.3 + z * 31.7;
      const chance = seededValue(seed);
      const height = terrainHeight(x, z);
      const inMeadow = height > -0.1 && height < 2.8;
      const nearWater = LAKES.some((lake) => {
        const distance = Math.hypot((x - lake.x) / lake.radiusX, (z - lake.z) / lake.radiusZ);
        return distance > 0.92 && distance < 1.5;
      });
      if (isInsideLake(x, z) || (!inMeadow && !nearWater) || chance < (nearWater ? 0.72 : 0.79)) continue;
      const offsetX = (seededValue(seed + 1.7) - 0.5) * 2.1;
      const offsetZ = (seededValue(seed + 4.1) - 0.5) * 2.1;
      const bladeHeight = 0.72 + seededValue(seed + 5.3) * 0.55;
      position.set(x + offsetX, terrainHeight(x + offsetX, z + offsetZ) + bladeHeight * 0.5, z + offsetZ);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seededValue(seed + 7.4) * Math.PI * 2);
      scale.set(0.72 + seededValue(seed + 8.6) * 0.48, bladeHeight, 0.72 + seededValue(seed + 9.2) * 0.48);
      matrix.compose(position, rotation, scale);
      grass.setMatrixAt(grassCount, matrix);
      grassCount += 1;
    }
  }
  grass.count = grassCount;
  grass.instanceMatrix.needsUpdate = true;
  grass.castShadow = false;
  grass.receiveShadow = true;
  vegetation.add(grass);

  const bushGeometry = new THREE.DodecahedronGeometry(0.6, 1);
  const bushMaterial = new THREE.MeshStandardMaterial({ color: '#567a68', roughness: 1 });
  const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, 18);
  let bushCount = 0;
  for (let i = 0; i < 18; i += 1) {
    const x = -32 + seededValue(i * 8.4 + 2) * 64;
    const z = -34 + seededValue(i * 5.2 + 9) * 68;
    if (isInsideLake(x, z) || terrainHeight(x, z) > 3.1) continue;
    position.set(x, terrainHeight(x, z) + 0.42, z);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seededValue(i * 3.1) * Math.PI * 2);
    const bushScale = 0.55 + seededValue(i * 4.7) * 0.45;
    scale.set(1.1 * bushScale, 0.76 * bushScale, 0.9 * bushScale);
    matrix.compose(position, rotation, scale);
    bushes.setMatrixAt(bushCount, matrix);
    bushCount += 1;
  }
  bushes.count = bushCount;
  bushes.instanceMatrix.needsUpdate = true;
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  vegetation.add(bushes);

  const flowerGeometry = new THREE.ConeGeometry(0.08, 0.24, 5);
  const flowerMaterial = new THREE.MeshStandardMaterial({
    color: '#e7c7a0',
    emissive: '#3d2f26',
    emissiveIntensity: 0.22,
    roughness: 0.8,
  });
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 24);
  let flowerCount = 0;
  for (let i = 0; i < 24; i += 1) {
    const x = -34 + seededValue(i * 6.7 + 14) * 68;
    const z = -34 + seededValue(i * 7.9 + 21) * 68;
    if (isInsideLake(x, z) || terrainHeight(x, z) < 0.1 || terrainHeight(x, z) > 2.4) continue;
    position.set(x, terrainHeight(x, z) + 0.13, z);
    rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), seededValue(i * 2.7) * Math.PI * 2);
    scale.setScalar(0.7 + seededValue(i * 4.9) * 0.5);
    matrix.compose(position, rotation, scale);
    flowers.setMatrixAt(flowerCount, matrix);
    flowerCount += 1;
  }
  flowers.count = flowerCount;
  flowers.instanceMatrix.needsUpdate = true;
  vegetation.add(flowers);
  scene.add(vegetation);
}

function addHabitatDetails(scene: THREE.Scene) {
  const details = new THREE.Group();
  const rockGeometry = new THREE.DodecahedronGeometry(0.45, 0);
  const rockMaterials = ['#6f7780', '#8d8170', '#596a68', '#9c927e'].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
  );
  let rockIndex = 0;
  const placeRock = (x: number, z: number, seed: number) => {
    if (isInsideLake(x, z)) return;
    const scale = 0.34 + seededValue(seed + 7) * 0.72;
    const rock = new THREE.Mesh(rockGeometry, rockMaterials[rockIndex % rockMaterials.length]);
    rock.position.set(x, terrainHeight(x, z) + scale * 0.3, z);
    rock.scale.set(scale * 1.2, scale * (0.55 + (seed % 3) * 0.14), scale);
    rock.rotation.set(seed * 0.37, seed * 0.71, seed * 0.19);
    rock.castShadow = true;
    rock.receiveShadow = true;
    details.add(rock);
    rockIndex += 1;
  };

  for (const patch of ROCK_PATCHES) {
    for (let i = 0; i < patch.count; i += 1) {
      const seed = rockIndex * 13 + i * 17 + 5;
      const angle = seed * 2.31;
      const radius = 0.22 + seededValue(seed * 1.7) * 0.8;
      placeRock(
        patch.x + Math.cos(angle) * patch.radiusX * radius,
        patch.z + Math.sin(angle) * patch.radiusZ * radius,
        seed,
      );
    }
  }
  for (const [lakeIndex, lake] of LAKES.entries()) {
    for (let i = 0; i < 4; i += 1) {
      const seed = lakeIndex * 41 + i * 19 + 11;
      const angle = seededValue(seed) * Math.PI * 2;
      const distance = 1.02 + seededValue(seed + 3) * 0.18;
      const localX = Math.cos(angle) * lake.radiusX * distance;
      const localZ = Math.sin(angle) * lake.radiusZ * distance;
      const cos = Math.cos(lake.rotation);
      const sin = Math.sin(lake.rotation);
      placeRock(lake.x + localX * cos - localZ * sin, lake.z + localX * sin + localZ * cos, seed);
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
  addVegetation(scene);
}

function makePlayer() {
  const player = new THREE.Group();
  player.name = 'Explorer';
  const suit = new THREE.MeshStandardMaterial({ color: '#d6ddd5', roughness: 0.7, metalness: 0.14 });
  const darkSuit = new THREE.MeshStandardMaterial({ color: '#2f4249', roughness: 0.78, metalness: 0.16 });
  const trim = new THREE.MeshStandardMaterial({ color: '#78979a', roughness: 0.52, metalness: 0.28 });
  const visor = new THREE.MeshStandardMaterial({ color: '#78eee5', emissive: '#2d7778', emissiveIntensity: 0.58, roughness: 0.16, metalness: 0.5 });
  const accent = new THREE.MeshStandardMaterial({ color: '#c9eee0', emissive: '#39726e', emissiveIntensity: 0.42, roughness: 0.32, metalness: 0.35 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.66, 5, 10), suit);
  torso.position.y = 1.77;
  torso.scale.z = 0.66;
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.25, 4, 8), darkSuit);
  hips.position.y = 1.05;
  hips.scale.z = 0.7;

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.08), darkSuit);
  chest.position.set(0, 1.88, -0.34);
  const chestPanel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.025), accent);
  chestPanel.position.set(0, 1.9, -0.39);
  const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), trim);
  const shoulderR = shoulderL.clone();
  shoulderL.position.set(-0.53, 2.09, 0);
  shoulderR.position.set(0.53, 2.09, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.18, 8), darkSuit);
  neck.position.y = 2.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.43, 12, 8), suit);
  head.position.y = 2.69;
  head.scale.set(0.95, 1.05, 0.9);
  const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 6, 0, Math.PI * 2, 0.2, Math.PI * 0.45), visor);
  visorMesh.position.set(0, 2.7, -0.34);
  visorMesh.scale.set(1.18, 0.58, 0.18);
  const helmetBand = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.035, 5, 12, Math.PI), trim);
  helmetBand.rotation.x = Math.PI / 2;
  helmetBand.position.set(0, 2.72, 0);

  const armGeometry = new THREE.CapsuleGeometry(0.14, 0.64, 4, 8);
  const armL = new THREE.Mesh(armGeometry, suit);
  const armR = new THREE.Mesh(armGeometry, suit);
  armL.position.set(-0.62, 1.78, 0);
  armR.position.set(0.62, 1.78, 0);
  armL.rotation.z = -0.08;
  armR.rotation.z = 0.08;
  const gloveGeometry = new THREE.SphereGeometry(0.17, 8, 6);
  const gloveL = new THREE.Mesh(gloveGeometry, darkSuit);
  const gloveR = new THREE.Mesh(gloveGeometry, darkSuit);
  gloveL.position.set(-0.64, 1.35, 0);
  gloveR.position.set(0.64, 1.35, 0);

  const legGeometry = new THREE.CapsuleGeometry(0.17, 0.64, 4, 8);
  const legL = new THREE.Mesh(legGeometry, darkSuit);
  const legR = new THREE.Mesh(legGeometry, darkSuit);
  legL.position.set(-0.23, 0.58, 0);
  legR.position.set(0.23, 0.58, 0);
  const bootGeometry = new THREE.BoxGeometry(0.3, 0.22, 0.56);
  const bootL = new THREE.Mesh(bootGeometry, darkSuit);
  const bootR = new THREE.Mesh(bootGeometry, darkSuit);
  bootL.position.set(-0.23, 0.12, -0.1);
  bootR.position.set(0.23, 0.12, -0.1);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.76, 0.2), trim);
  backpack.position.set(0, 1.72, 0.31);
  const packLight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.025), accent);
  packLight.position.set(0, 1.76, 0.43);
  player.add(
    hips, torso, chest, chestPanel, shoulderL, shoulderR, neck, head, visorMesh, helmetBand,
    armL, armR, gloveL, gloveR, legL, legR, bootL, bootR, backpack, packLight,
  );
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
    scene.fog = new THREE.Fog('#8baeb1', 38, 98);
    const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 150);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const skyDome = makeSkyDome();
    const stars = makeStarField();
    const clouds = makeClouds();
    scene.add(skyDome.mesh, stars, clouds);
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
    const moonLight = new THREE.DirectionalLight('#9bb8e8', 0.08);
    moonLight.position.set(24, 28, -18);
    scene.add(moonLight);
    const ambient = new THREE.AmbientLight('#8aa7c0', 0.22);
    scene.add(ambient);
    const celestialGeometry = new THREE.SphereGeometry(1, 14, 10);
    const sunOrb = new THREE.Mesh(
      celestialGeometry,
      new THREE.MeshBasicMaterial({ color: '#fff1bb', transparent: true, opacity: 0.94 }),
    );
    sunOrb.name = 'Sun';
    sunOrb.scale.setScalar(1.7);
    const moonOrb = new THREE.Mesh(
      celestialGeometry,
      new THREE.MeshBasicMaterial({ color: '#d9e6ff', transparent: true, opacity: 0.92 }),
    );
    moonOrb.name = 'Moon';
    moonOrb.scale.setScalar(1.2);
    scene.add(sunOrb, moonOrb);
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
    const celestialPosition = new THREE.Vector3();
    const skyColor = new THREE.Color();
    const daySky = new THREE.Color('#8baeb1');
    const nightSky = new THREE.Color('#202d4a');
    const sunsetSky = new THREE.Color('#c68b78');
    const dayTop = new THREE.Color('#4f879f');
    const nightTop = new THREE.Color('#101629');
    const sunsetTop = new THREE.Color('#8f5e6d');
    const dayHorizon = new THREE.Color('#d1c08e');
    const nightHorizon = new THREE.Color('#354260');
    const sunsetHorizon = new THREE.Color('#d99b75');
    const dayBottom = new THREE.Color('#67858a');
    const nightBottom = new THREE.Color('#1f3451');
    const sunsetBottom = new THREE.Color('#765969');
    const skyTop = new THREE.Color();
    const skyHorizon = new THREE.Color();
    const skyBottom = new THREE.Color();
    const cloudMaterial = clouds.userData.cloudMaterial as THREE.MeshLambertMaterial;
    let worldTime = 0.18;
    let grounded = true;
    let jumpQueued = false;
    let walkTime = 0;
    let landingPulse = 0;
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
      const sunAltitude = Math.sin(sunAngle);
      const daylight = THREE.MathUtils.clamp(sunAltitude * 0.5 + 0.5, 0.08, 1);
      const nightFactor = THREE.MathUtils.clamp((0.22 - sunAltitude) / 0.62, 0, 1);
      const twilight = THREE.MathUtils.clamp(1 - Math.abs(sunAltitude) / 0.38, 0, 1) * (1 - nightFactor * 0.72);
      skyColor.lerpColors(nightSky, daySky, daylight);
      skyColor.lerp(sunsetSky, twilight * 0.42);
      scene.background = skyColor;
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(skyColor);
      skyTop.lerpColors(nightTop, dayTop, daylight).lerp(sunsetTop, twilight * 0.44);
      skyHorizon.lerpColors(nightHorizon, dayHorizon, daylight).lerp(sunsetHorizon, twilight * 0.58);
      skyBottom.lerpColors(nightBottom, dayBottom, daylight).lerp(sunsetBottom, twilight * 0.3);
      skyDome.uniforms.topColor.value.copy(skyTop);
      skyDome.uniforms.horizonColor.value.copy(skyHorizon);
      skyDome.uniforms.bottomColor.value.copy(skyBottom);
      celestialPosition.set(Math.cos(sunAngle) * 62, 12 + sunAltitude * 43, Math.sin(sunAngle) * 62);
      sun.position.copy(celestialPosition);
      sunOrb.position.copy(celestialPosition);
      moonOrb.position.copy(celestialPosition).multiplyScalar(-1);
      moonLight.position.copy(moonOrb.position);
      sun.intensity = 0.12 + daylight * 2.65;
      moonLight.intensity = 0.04 + nightFactor * 0.42;
      ambient.intensity = 0.16 + daylight * 0.23 + nightFactor * 0.1;
      hemi.intensity = 0.66 + daylight * 0.92 + nightFactor * 0.08;
      (stars.material as THREE.PointsMaterial).opacity = nightFactor * 0.86;
      stars.rotation.y = worldTime * 0.035;
      clouds.visible = daylight > 0.09;
      cloudMaterial.opacity = 0.05 + daylight * 0.13;
      clouds.children.forEach((cloud) => {
        const baseX = cloud.userData.baseX as number;
        const speed = cloud.userData.speed as number;
        const phase = cloud.userData.phase as number;
        cloud.position.x = ((baseX + worldTime * 84 * speed + phase) % 112) - 56;
        cloud.position.z += Math.sin(worldTime * 2.4 + phase) * delta * 0.008;
      });
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
        const acceleration = moving ? (keys.current.run ? 8.2 : 9.4) : 13.5;
        velocity.x = THREE.MathUtils.damp(velocity.x, movement.x, acceleration, delta);
        velocity.z = THREE.MathUtils.damp(velocity.z, movement.z, acceleration, delta);
        if (jumpQueued && grounded) {
          velocity.y = 7.4;
          grounded = false;
        }
        jumpQueued = false;
        velocity.y -= 17.5 * delta;
        player.position.x = THREE.MathUtils.clamp(player.position.x + velocity.x * delta, -39, 39);
        player.position.z = THREE.MathUtils.clamp(player.position.z + velocity.z * delta, -39, 39);
        const floor = terrainHeight(player.position.x, player.position.z);
        player.position.y += velocity.y * delta;
        if (player.position.y <= floor) {
          if (!grounded && velocity.y < -2) landingPulse = Math.min(1, Math.abs(velocity.y) * 0.025);
          player.position.y = floor;
          velocity.y = 0;
          grounded = true;
        }
        if (moving) {
          walkTime += delta * (keys.current.run ? 10.5 : 6.8);
          const limbs = player.userData.limbs as Record<string, THREE.Object3D>;
          const gait = Math.sin(walkTime) * (grounded ? 0.34 : 0.11);
          limbs.armL.rotation.x = gait;
          limbs.armR.rotation.x = -gait;
          limbs.legL.rotation.x = -gait * 0.82;
          limbs.legR.rotation.x = gait * 0.82;
          const targetRotation = Math.atan2(-movement.x, -movement.z);
          const rotationDelta = Math.atan2(
            Math.sin(targetRotation - player.rotation.y),
            Math.cos(targetRotation - player.rotation.y),
          );
          player.rotation.y += rotationDelta * (1 - Math.exp(-11 * delta));
        } else {
          const limbs = player.userData.limbs as Record<string, THREE.Object3D>;
          limbs.armL.rotation.x = THREE.MathUtils.damp(limbs.armL.rotation.x, 0, 8, delta);
          limbs.armR.rotation.x = THREE.MathUtils.damp(limbs.armR.rotation.x, 0, 8, delta);
          limbs.legL.rotation.x = THREE.MathUtils.damp(limbs.legL.rotation.x, 0, 8, delta);
          limbs.legR.rotation.x = THREE.MathUtils.damp(limbs.legR.rotation.x, 0, 8, delta);
        }
        landingPulse = THREE.MathUtils.damp(landingPulse, 0, 10, delta);
        const landingScale = 1 - landingPulse * 0.08;
        player.scale.y = THREE.MathUtils.damp(player.scale.y, landingScale, 15, delta);
        const widthScale = 1 + landingPulse * 0.05;
        player.scale.x = THREE.MathUtils.damp(player.scale.x, widthScale, 15, delta);
        player.scale.z = THREE.MathUtils.damp(player.scale.z, widthScale, 15, delta);
      }

      player.visible = !firstPersonRef.current;
      target.set(player.position.x, player.position.y + PLAYER_HEIGHT * 0.74, player.position.z);
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
    link.download = `exovanta-prototype-04-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
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
          <div><strong>EXOVANTA</strong><span>HABITAT 01 / PROTOTYPE 0.4</span></div>
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
            <p className="pause-kicker">PROTOTYPE 0.4 / HOLD</p>
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