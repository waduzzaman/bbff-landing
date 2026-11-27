'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/*
  A 3D river scene: a beaver swims a stick over to its dam, climbs up,
  adds the stick to the top, then swims off for another one.

  World layout: the river flows along +x. The dam sits across it at x = 0.
  Upstream water (x < 0) is high, downstream water (x > 0) is low.
*/

const UPSTREAM_Y = 0.9;
const DOWNSTREAM_Y = 0.2;
const DAM_TOP = 1.1;
const CYCLE = 20; // seconds for one round trip

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (t: number) => {
  const k = Math.min(Math.max(t, 0), 1);
  return k * k * (3 - 2 * k);
};

// Ground height: a river channel along x with grassy banks on both sides.
function terrainHeight(x: number, z: number) {
  const a = Math.abs(z);
  const bumps = Math.sin(x * 0.3) * Math.cos(z * 0.4) * 0.4 + Math.sin(x * 0.9 + z * 0.7) * 0.15;
  if (a < 4.5) return -0.5;
  if (a < 8) return -0.5 + 1.9 * ease((a - 4.5) / 3.5) + bumps * ease((a - 4.5) / 3.5);
  return 1.4 + bumps + (a - 8) * 0.08;
}

const headingTo = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(-(b.z - a.z), b.x - a.x);

// ---------- Materials ----------
const barkColors = ['#6b4a2e', '#7a5534', '#5a3d24', '#8a6440'];
const barkMats = barkColors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
const cutWoodMat = new THREE.MeshStandardMaterial({ color: '#d9b38c', roughness: 0.8 });
const barkMat = () => barkMats[Math.floor(Math.random() * barkMats.length)];

// A log lying along the z axis, with light-coloured cut ends.
function makeLog(length: number, radius: number) {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.05, length, 10);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, [barkMat(), cutWoodMat, cutWoodMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A leafy stick the beaver carries.
function makeStick() {
  const group = new THREE.Group();
  const length = rand(1.2, 1.6);
  group.add(makeLog(length, 0.05));
  const leafMat = new THREE.MeshStandardMaterial({ color: '#4f7a2e', roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), leafMat);
    leaf.scale.set(1, 0.35, 1.6);
    leaf.position.set(rand(-0.05, 0.05), 0.05, length / 2 - 0.1 - i * 0.12);
    leaf.castShadow = true;
    group.add(leaf);
  }
  return group;
}

function makeBeaver() {
  const fur = new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.95 });
  const darkFur = new THREE.MeshStandardMaterial({ color: '#4a2e17', roughness: 0.95 });
  const snoutFur = new THREE.MeshStandardMaterial({ color: '#7d5532', roughness: 0.95 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#2e2620', roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.3 });
  const teethMat = new THREE.MeshStandardMaterial({ color: '#e08a2c', roughness: 0.5 });
  const sphere = new THREE.SphereGeometry(1, 24, 16);

  const part = (mat: THREE.Material, s: [number, number, number], p: [number, number, number]) => {
    const m = new THREE.Mesh(sphere, mat);
    m.scale.set(...s);
    m.position.set(...p);
    m.castShadow = true;
    return m;
  };

  const beaver = new THREE.Group();
  beaver.rotation.order = 'YZX';

  // Pear-shaped body
  beaver.add(part(fur, [0.5, 0.34, 0.36], [0.05, 0.38, 0]));
  beaver.add(part(fur, [0.42, 0.38, 0.4], [-0.2, 0.38, 0]));

  // Head
  const head = new THREE.Group();
  head.position.set(0.5, 0.5, 0);
  head.add(part(fur, [0.24, 0.21, 0.22], [0, 0, 0]));
  head.add(part(snoutFur, [0.14, 0.12, 0.14], [0.18, -0.05, 0]));
  head.add(part(black, [0.045, 0.04, 0.05], [0.31, 0.01, 0]));
  head.add(part(black, [0.03, 0.03, 0.03], [0.12, 0.08, 0.15]));
  head.add(part(black, [0.03, 0.03, 0.03], [0.12, 0.08, -0.15]));
  head.add(part(darkFur, [0.05, 0.05, 0.04], [-0.04, 0.19, 0.14]));
  head.add(part(darkFur, [0.05, 0.05, 0.04], [-0.04, 0.19, -0.14]));
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.06), teethMat);
  teeth.position.set(0.28, -0.14, 0);
  head.add(teeth);
  const mouth = new THREE.Group();
  mouth.position.set(0.27, -0.1, 0);
  head.add(mouth);
  beaver.add(head);

  // Flat, scaly tail on a pivot so it can paddle
  const tail = new THREE.Group();
  tail.position.set(-0.52, 0.25, 0);
  tail.add(part(tailMat, [0.38, 0.05, 0.17], [-0.34, 0, 0]));
  beaver.add(tail);

  // Four legs (hind feet are bigger, like real beavers)
  const legs: THREE.Group[] = [];
  for (const [x, z, big] of [
    [0.3, 0.2, false],
    [0.3, -0.2, false],
    [-0.28, 0.24, true],
    [-0.28, -0.24, true],
  ] as const) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.22, z);
    leg.add(part(darkFur, big ? [0.13, 0.12, 0.09] : [0.07, 0.13, 0.07], [0, -0.12, 0]));
    beaver.add(leg);
    legs.push(leg);
  }

  return { beaver, head, mouth, tail, legs };
}

function makePine(scale: number) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 1 }),
  );
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  tree.add(trunk);
  const green = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(rand(0.27, 0.36), rand(0.35, 0.5), rand(0.16, 0.24)),
    roughness: 0.9,
    flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3 - i * 0.3, 1.8, 8), green);
    cone.position.y = 1.6 + i * 0.9;
    cone.castShadow = true;
    tree.add(cone);
  }
  tree.scale.setScalar(scale);
  return tree;
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6fa9d6');
  g.addColorStop(1, '#e3eef0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWater(xFrom: number, xTo: number, y: number, color: string) {
  const geo = new THREE.PlaneGeometry(xTo - xFrom, 22, 60, 30);
  geo.rotateX(-Math.PI / 2);
  geo.translate((xFrom + xTo) / 2, y, 0);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, base: Float32Array.from(geo.attributes.position.array) };
}

function buildScene(container: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog('#dceaee', 30, 110);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 300);
  const lookAt = new THREE.Vector3(-2.5, 0.9, -0.5);

  // ---------- Lights ----------
  scene.add(new THREE.HemisphereLight('#cfe8ff', '#5a4a30', 1.1));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.position.set(14, 20, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ---------- Terrain ----------
  const groundGeo = new THREE.PlaneGeometry(120, 70, 180, 100);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = terrainHeight(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    if (h > 1.1) c.setHSL(rand(0.24, 0.3), 0.42, rand(0.3, 0.36));
    else if (h > 0.1) c.set('#7a6243');
    else c.set('#5b4a36');
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Distant hazy mountains
  const mountainMat = new THREE.MeshStandardMaterial({ color: '#7d8fa3', flatShading: true, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(rand(14, 24), rand(12, 22), 7), mountainMat);
    m.position.set(-60 + i * 20 + rand(-5, 5), 5, rand(-80, -60));
    scene.add(m);
  }

  // Pine forest on the banks (kept out of the camera's foreground)
  for (let i = 0; i < 90; i++) {
    const side = Math.random() < 0.65 ? -1 : 1;
    const x = rand(-50, 40);
    const z = side * rand(9, 30);
    if (side === 1 && x > -4) continue; // keep the camera's view clear
    const tree = makePine(rand(0.8, 1.6));
    tree.position.set(x, terrainHeight(x, z) - 0.1, z);
    tree.rotation.y = rand(0, Math.PI * 2);
    tree.userData.sway = rand(0, 10);
    scene.add(tree);
  }
  const trees = scene.children.filter((o) => o.userData.sway !== undefined);

  // Rocks along the shore
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8b8d88', flatShading: true, roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const x = rand(-30, 30);
    const z = (Math.random() < 0.5 ? -1 : 1) * rand(5.5, 9);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.15, 0.5)), rockMat);
    rock.position.set(x, terrainHeight(x, z), z);
    rock.rotation.set(rand(0, 3), rand(0, 3), 0);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }

  // Tree stumps the beaver has chewed (pointed tops)
  for (const [x, z] of [[-5, 7.6], [3, -7.6], [-7, -7.8]]) {
    const stump = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), barkMat());
    base.position.y = 0.25;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 10), cutWoodMat);
    tip.position.y = 0.67;
    base.castShadow = tip.castShadow = true;
    stump.add(base, tip);
    stump.position.set(x, terrainHeight(x, z) - 0.05, z);
    scene.add(stump);
  }

  // ---------- The dam ----------
  const dam = new THREE.Group();
  const mudShape = new THREE.Shape();
  mudShape.moveTo(-1.1, -0.5);
  mudShape.lineTo(1.1, -0.5);
  mudShape.lineTo(0.3, 0.95);
  mudShape.lineTo(-0.3, 0.95);
  const mudGeo = new THREE.ExtrudeGeometry(mudShape, { depth: 16, bevelEnabled: false });
  mudGeo.translate(0, 0, -8);
  const mud = new THREE.Mesh(mudGeo, new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 1 }));
  mud.receiveShadow = true;
  dam.add(mud);

  for (let row = 0; row < 6; row++) {
    const count = 7 - row;
    const y = -0.35 + row * 0.26;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 0.3;
      let z = -8;
      while (z < 8) {
        const len = rand(2.5, 4.5);
        const log = makeLog(len, rand(0.11, 0.17));
        log.position.set(x + rand(-0.05, 0.05), y, z + len / 2);
        log.rotation.set(rand(-0.05, 0.05), rand(-0.08, 0.08), 0);
        dam.add(log);
        z += len - 0.3;
      }
    }
  }
  // Loose sticks poking out in all directions
  for (let i = 0; i < 70; i++) {
    const stick = makeLog(rand(0.6, 1.4), rand(0.025, 0.05));
    const t = Math.random();
    stick.position.set(rand(-0.9, 0.9) * (1 - t * 0.7), -0.3 + t * 1.35, rand(-7, 7));
    stick.rotation.set(rand(-0.6, 0.6), rand(0, Math.PI), rand(-0.4, 0.4));
    dam.add(stick);
  }
  scene.add(dam);

  // ---------- Water ----------
  const upstream = makeWater(-60, -0.2, UPSTREAM_Y, '#3a7f98');
  const downstream = makeWater(0.4, 60, DOWNSTREAM_Y, '#4f97ae');
  scene.add(upstream.mesh, downstream.mesh);

  // Water leaking through and spilling over the dam
  const DROPS = 700;
  const dropPos = new Float32Array(DROPS * 3);
  const dropVel = new Float32Array(DROPS * 2);
  const resetDrop = (i: number) => {
    dropPos[i * 3] = rand(0.15, 0.5);
    dropPos[i * 3 + 1] = rand(0.45, 0.95);
    dropPos[i * 3 + 2] = rand(-6, 6);
    dropVel[i * 2] = rand(0.3, 0.8);
    dropVel[i * 2 + 1] = 0;
  };
  for (let i = 0; i < DROPS; i++) {
    resetDrop(i);
    dropPos[i * 3 + 1] = rand(DOWNSTREAM_Y, 0.95);
  }
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(
    dropGeo,
    new THREE.PointsMaterial({ color: '#e8f6ff', size: 0.06, transparent: true, opacity: 0.75 }),
  );
  scene.add(drops);

  // Autumn leaves drifting on the pond
  const leafColors = ['#c8641e', '#d89a2a', '#9c3b1b', '#6d8a2e'];
  const leaves = Array.from({ length: 14 }, () => {
    const leaf = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 6),
      new THREE.MeshStandardMaterial({ color: leafColors[Math.floor(rand(0, 4))], side: THREE.DoubleSide }),
    );
    leaf.rotation.x = -Math.PI / 2;
    leaf.scale.set(1, 1.6, 1);
    leaf.position.set(rand(-30, -1), UPSTREAM_Y + 0.03, rand(-5, 5));
    scene.add(leaf);
    return leaf;
  });

  // ---------- The beaver ----------
  const { beaver, head, mouth, tail, legs } = makeBeaver();
  scene.add(beaver);

  const swimY = UPSTREAM_Y - 0.36;

  // Stick pile on the far bank, where the beaver fetches each new stick
  const PILE_X = -8;
  const PILE_Z = -7.6;
  for (let i = 0; i < 9; i++) {
    const s = makeStick();
    const x = PILE_X + rand(-0.9, 0.9);
    const z = PILE_Z - rand(0.3, 1.2);
    s.position.set(x, terrainHeight(x, z) + 0.06 + (i % 3) * 0.06, z);
    s.rotation.set(rand(-0.15, 0.15), rand(0, Math.PI), rand(-0.15, 0.15));
    scene.add(s);
  }

  const L = new THREE.Vector3(PILE_X, terrainHeight(PILE_X, PILE_Z), PILE_Z); // on land at the pile
  const P = new THREE.Vector3(PILE_X, swimY, -5.6); // in the water next to the pile
  const W = new THREE.Vector3(); // in the water at the foot of the dam
  const D = new THREE.Vector3(); // standing on top of the dam

  let cycleStart = 0;
  let heading = headingTo(L, P);
  let stick: THREE.Group | null = makeStick();
  mouth.add(stick);

  type Falling = { mesh: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; qFrom: THREE.Quaternion; qTo: THREE.Quaternion; start: number };
  const placed: Falling[] = [];

  const startCycle = (time: number) => {
    cycleStart = time;
    const targetZ = rand(-4.5, 4.5);
    W.set(-1.5, swimY, targetZ);
    D.set(-0.3, DAM_TOP, targetZ);
  };

  const pickUpStick = () => {
    if (stick) return;
    stick = makeStick();
    mouth.add(stick);
  };

  const releaseStick = (time: number) => {
    if (!stick) return;
    const from = new THREE.Vector3();
    const qFrom = new THREE.Quaternion();
    stick.getWorldPosition(from);
    stick.getWorldQuaternion(qFrom);
    mouth.remove(stick);
    scene.add(stick);
    const to = new THREE.Vector3(rand(-0.05, 0.25), DAM_TOP + rand(0.02, 0.1), D.z + rand(-0.4, 0.4));
    const qTo = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand(-0.1, 0.1), rand(-0.5, 0.5), rand(-0.1, 0.1)));
    placed.push({ mesh: stick, from, to, qFrom, qTo, start: time });
    stick = null;
    // Keep the pile from growing forever
    if (placed.length > 30) {
      const old = placed.shift()!;
      scene.remove(old.mesh);
    }
  };

  // ---------- Resize ----------
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on narrow screens so the dam stays in view
    camera.fov = w / h < 1.2 ? 55 : 38;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // ---------- Animation loop ----------
  const clock = new THREE.Clock();
  let frame = 0;

  const animate = () => {
    frame = requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (cycleStart === 0 || t - cycleStart > CYCLE) startCycle(t || 0.0001);
    const p = t - cycleStart;

    // Where the beaver is and where it faces in each part of the trip
    let targetHeading = heading;
    let pitch = 0;
    let moving = true;
    let swimming = true;
    head.rotation.z = 0;

    // The round trip, step by step (times in seconds):
    if (p < 1.2) {
      // slide off the bank into the water
      const k = ease(p / 1.2);
      beaver.position.lerpVectors(L, P, k);
      pitch = -0.4 * Math.sin(k * Math.PI);
      targetHeading = headingTo(L, P);
      swimming = k > 0.6;
    } else if (p < 6) {
      // swim to the dam with the stick
      beaver.position.lerpVectors(P, W, ease((p - 1.2) / 4.8));
      targetHeading = headingTo(P, W);
    } else if (p < 7.2) {
      // climb up onto the dam
      const k = ease((p - 6) / 1.2);
      beaver.position.lerpVectors(W, D, k);
      pitch = 0.45 * Math.sin(k * Math.PI);
      targetHeading = 0;
      swimming = k < 0.4;
    } else if (p < 8.8) {
      // lower its head and set the stick down
      const k = (p - 7.2) / 1.6;
      beaver.position.copy(D);
      head.rotation.z = -0.6 * Math.sin(k * Math.PI);
      if (k > 0.5) releaseStick(t);
      targetHeading = 0;
      moving = swimming = false;
    } else if (p < 10) {
      // turn around
      beaver.position.copy(D);
      targetHeading = Math.PI;
      swimming = false;
    } else if (p < 11) {
      // slide back into the pond
      const k = ease(p - 10);
      beaver.position.lerpVectors(D, W, k);
      pitch = -0.4 * Math.sin(k * Math.PI);
      targetHeading = Math.PI;
      swimming = k > 0.6;
    } else if (p < 16) {
      // swim back to the stick pile, mouth empty
      beaver.position.lerpVectors(W, P, ease((p - 11) / 5));
      targetHeading = headingTo(W, P);
    } else if (p < 17.2) {
      // climb out onto the bank
      const k = ease((p - 16) / 1.2);
      beaver.position.lerpVectors(P, L, k);
      pitch = 0.4 * Math.sin(k * Math.PI);
      targetHeading = headingTo(P, L);
      swimming = k < 0.4;
    } else if (p < 18.6) {
      // bend down and grab a new stick from the pile
      const k = (p - 17.2) / 1.4;
      beaver.position.copy(L);
      head.rotation.z = -0.6 * Math.sin(k * Math.PI);
      if (k > 0.5) pickUpStick();
      targetHeading = headingTo(P, L);
      moving = swimming = false;
    } else {
      // turn back toward the water
      beaver.position.copy(L);
      targetHeading = headingTo(L, P);
      swimming = false;
    }

    // Turn smoothly along the shortest way round
    const diff = Math.atan2(Math.sin(targetHeading - heading), Math.cos(targetHeading - heading));
    heading += diff * Math.min(1, dt * 3);
    beaver.rotation.y = heading;
    beaver.rotation.z = pitch;

    if (swimming) beaver.position.y += Math.sin(t * 5) * 0.03;
    tail.rotation.z = Math.sin(t * (swimming ? 5 : 2)) * (swimming ? 0.3 : 0.08);
    legs.forEach((leg, i) => {
      leg.rotation.z = moving ? Math.sin(t * 9 + (i % 2) * Math.PI) * 0.7 : 0;
    });

    // Sticks dropping into place on the dam
    for (const s of placed) {
      const k = ease((t - s.start) / 0.6);
      s.mesh.position.lerpVectors(s.from, s.to, k);
      s.mesh.quaternion.slerpQuaternions(s.qFrom, s.qTo, k);
    }

    // Gentle waves on both water surfaces
    for (const [water, speed] of [[upstream, 1], [downstream, 2.2]] as const) {
      const arr = water.mesh.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = water.base[i];
        const z = water.base[i + 2];
        arr[i + 1] = water.base[i + 1] + Math.sin(x * 0.9 - t * 1.6 * speed) * 0.035 + Math.sin(z * 1.4 + t * 1.1) * 0.025;
      }
      water.mesh.geometry.attributes.position.needsUpdate = true;
      water.mesh.geometry.computeVertexNormals();
    }

    // Falling water
    for (let i = 0; i < DROPS; i++) {
      dropVel[i * 2 + 1] -= 6 * dt;
      dropPos[i * 3] += dropVel[i * 2] * dt;
      dropPos[i * 3 + 1] += dropVel[i * 2 + 1] * dt;
      if (dropPos[i * 3 + 1] < DOWNSTREAM_Y) resetDrop(i);
    }
    dropGeo.attributes.position.needsUpdate = true;

    // Leaves drift toward the dam
    for (const leaf of leaves) {
      leaf.position.x += dt * 0.35;
      leaf.position.y = UPSTREAM_Y + 0.04 + Math.sin(t * 1.5 + leaf.position.z) * 0.02;
      leaf.rotation.z += dt * 0.2;
      if (leaf.position.x > -0.6) leaf.position.set(rand(-35, -25), UPSTREAM_Y, rand(-5, 5));
    }

    // Trees sway in the wind
    for (const tree of trees) {
      tree.rotation.z = Math.sin(t * 0.8 + tree.userData.sway) * 0.02;
    }

    // Slow drifting camera
    camera.position.set(9 + Math.sin(t * 0.08) * 1.2, 3.4 + Math.sin(t * 0.13) * 0.25, 8.5);
    camera.lookAt(lookAt);

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m: THREE.Material) => m.dispose());
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export default function BeaverScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return buildScene(ref.current);
  }, []);

  return <div ref={ref} className="scene" role="img" aria-label="A beaver carrying sticks to build a dam across a river" />;
}
