// Procedural Three.js Floor Generator
// Builds accurate 3D architectural floors directly from normalized SVG geometry
// and ENHANCED_ROOM_DB metadata (slabs, walls with doorway cutouts, doors,
// room zones, washrooms, elevators, staircases, and floating room labels).

import * as THREE from '../vendor/three.module.js';
import {
  BUILDING_WIDTH,
  BUILDING_DEPTH,
  FLOOR_HEIGHT,
  FLOOR_DEFINITIONS,
  SLAB_THICKNESS,
  WALL_HEIGHT,
  ENHANCED_ROOM_DB,
  formatFloorLabel,
} from '../data/building-data.js';
import { FLOOR_CORRIDOR_LAYOUTS } from './navigation-graph.js';

const CATEGORY_COLORS = {
  office:   0x1b365d, // VU Navy
  lab:      0x059669, // Emerald
  study:    0xd97706, // Amber
  meeting:  0x0284c7, // Azure
  medical:  0xdc2626, // Crimson
  social:   0x00a0df, // VU Blue
  studio:   0x7c3aed, // Violet
  utility:  0x64748b, // Slate
  facility: 0x0d9488, // Teal
};

const sharedMaterials = {
  slabTop: new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.85, metalness: 0.05 }),
  slabEdge: new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.7, metalness: 0.1 }),
  interiorWall: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65, metalness: 0.05 }),
  exteriorGlass: new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.22,
    roughness: 0.15,
    metalness: 0.1,
    depthWrite: false,
  }),
  mullion: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 }),
  doorFrame: new THREE.MeshStandardMaterial({ color: 0x1b365d, roughness: 0.5, metalness: 0.25 }),
  doorPanel: new THREE.MeshStandardMaterial({
    color: 0x00a0df,
    transparent: true,
    opacity: 0.35,
    roughness: 0.3,
  }),
  toiletFloor: new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.7 }),
  elevatorFloor: new THREE.MeshStandardMaterial({
    color: 0x9333ea,
    emissive: 0x581c87,
    emissiveIntensity: 0.4,
    roughness: 0.35,
    metalness: 0.25,
  }),
  elevatorWall: new THREE.MeshPhysicalMaterial({
    color: 0x7c3aed,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.52,
    roughness: 0.25,
    depthWrite: false,
  }),
  elevatorDoor: new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x7c3aed,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.55,
  }),
  elevatorFrame: new THREE.MeshStandardMaterial({
    color: 0x6d28d9,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.3,
    roughness: 0.35,
    metalness: 0.4,
  }),
  stairStep: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.2 }),
  stairRail: new THREE.MeshStandardMaterial({ color: 0x0f2242, roughness: 0.4, metalness: 0.6 }),
  constructionStripe: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
};

export function applyFloorTheme(isDark) {
  sharedMaterials.slabTop.color.setHex(isDark ? 0x162238 : 0xf1f5f9);
  sharedMaterials.slabEdge.color.setHex(isDark ? 0x263859 : 0xcbd5e1);
  sharedMaterials.interiorWall.color.setHex(isDark ? 0x293954 : 0xe2e8f0);
  sharedMaterials.exteriorGlass.color.setHex(isDark ? 0x38bdf8 : 0xbae6fd);
  sharedMaterials.exteriorGlass.opacity = isDark ? 0.16 : 0.22;
  sharedMaterials.mullion.color.setHex(isDark ? 0x0f172a : 0x1e293b);
  sharedMaterials.doorFrame.color.setHex(isDark ? 0x60a5fa : 0x1b365d);
  sharedMaterials.doorPanel.color.setHex(isDark ? 0x38bdf8 : 0x00a0df);
  sharedMaterials.stairStep.color.setHex(isDark ? 0x64748b : 0x94a3b8);
  sharedMaterials.stairRail.color.setHex(isDark ? 0x93c5fd : 0x0f2242);
  sharedMaterials.elevatorFloor.emissiveIntensity = isDark ? 0.62 : 0.4;
  sharedMaterials.elevatorDoor.emissiveIntensity = isDark ? 0.65 : 0.45;
}

/**
 * Splits a wall segment [x1, z1, x2, z2] by any door openings collinear with it,
 * returning sub-segments to extrude as solid walls so doorways remain physically open.
 */
function splitWallAtDoors(wall, doors) {
  const [x1, z1, x2, z2] = wall;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return [];

  const isHorizontal = Math.abs(dx) >= Math.abs(dz);
  const start = isHorizontal ? Math.min(x1, x2) : Math.min(z1, z2);
  const end = isHorizontal ? Math.max(x1, x2) : Math.max(z1, z2);
  const fixedCoord = isHorizontal ? (z1 + z2) / 2 : (x1 + x2) / 2;

  const intervals = [];
  for (const d of doors) {
    if (isHorizontal && d.orient === 'H' && Math.abs(d.cz - fixedCoord) < 0.65) {
      const half = Math.max(d.width, 1.5) / 2;
      if (d.cx + half > start && d.cx - half < end) {
        intervals.push([Math.max(start, d.cx - half), Math.min(end, d.cx + half)]);
      }
    } else if (!isHorizontal && d.orient === 'V' && Math.abs(d.cx - fixedCoord) < 0.65) {
      const half = Math.max(d.width, 1.5) / 2;
      if (d.cz + half > start && d.cz - half < end) {
        intervals.push([Math.max(start, d.cz - half), Math.min(end, d.cz + half)]);
      }
    }
  }

  if (!intervals.length) return [wall];

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of intervals) {
    if (!merged.length || iv[0] > merged[merged.length - 1][1]) {
      merged.push(iv);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    }
  }

  const segments = [];
  let cursor = start;
  for (const [gStart, gEnd] of merged) {
    if (gStart - cursor > 0.25) {
      segments.push(
        isHorizontal
          ? [cursor, fixedCoord, gStart, fixedCoord]
          : [fixedCoord, cursor, fixedCoord, gStart]
      );
    }
    cursor = Math.max(cursor, gEnd);
  }
  if (end - cursor > 0.25) {
    segments.push(
      isHorizontal
        ? [cursor, fixedCoord, end, fixedCoord]
        : [fixedCoord, cursor, fixedCoord, end]
    );
  }
  return segments;
}

function isExteriorWall([x1, z1, x2, z2]) {
  const halfW = BUILDING_WIDTH / 2 - 0.35;
  const halfD = BUILDING_DEPTH / 2 - 0.35;
  const onWest = Math.abs(x1) > halfW && Math.abs(x2) > halfW && Math.sign(x1) === Math.sign(x2);
  const onNorthSouth = Math.abs(z1) > halfD && Math.abs(z2) > halfD && Math.sign(z1) === Math.sign(z2);
  return onWest || onNorthSouth;
}

function createLabelSprite(title, subtitle, accentHex = '#1b365d') {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');

  // Rounded pill background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 18);
  ctx.fill();
  ctx.stroke();

  // Accent bar
  ctx.fillStyle = accentHex;
  roundRect(ctx, 14, 16, 10, canvas.height - 32, 5);
  ctx.fill();

  // Title
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px Inter, Segoe UI, sans-serif';
  ctx.textBaseline = 'middle';
  const cleanTitle = title.length > 20 ? `${title.slice(0, 19)}…` : title;
  ctx.fillText(cleanTitle, 36, subtitle ? 40 : 56);

  if (subtitle) {
    ctx.fillStyle = '#475569';
    ctx.font = '600 20px Inter, Segoe UI, sans-serif';
    const cleanSub = subtitle.length > 26 ? `${subtitle.slice(0, 25)}…` : subtitle;
    ctx.fillText(cleanSub, 36, 76);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.6, 1.43, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function createFloorBadgeSprite(floorCode) {
  const canvas = document.createElement('canvas');
  canvas.width = 340;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = floorCode === 'G' ? '#059669' : floorCode.startsWith('B') ? '#475569' : '#1b365d';
  roundRect(ctx, 4, 4, 332, 76, 16);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatFloorLabel(floorCode), 170, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(6.2, 1.54, 1);
  return sprite;
}

/**
 * Generates a complete Three.js Group for one floor.
 * Returns { group, roomMeshes, labelSprites, exteriorGroup }
 */
export function buildFloorGroup(floorDef, floorGeom) {
  const group = new THREE.Group();
  group.name = `floor-${floorDef.code}`;
  group.userData = { floorCode: floorDef.code, levelIndex: floorDef.levelIndex };

  const roomMeshes = [];
  const labelSprites = [];
  const exteriorGroup = new THREE.Group();
  exteriorGroup.name = `exterior-${floorDef.code}`;
  group.add(exteriorGroup);

  // 1. Floor slab
  const slabGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 0.4, SLAB_THICKNESS, BUILDING_DEPTH + 0.4);
  const slab = new THREE.Mesh(slabGeo, sharedMaterials.slabTop);
  slab.position.set(0, -SLAB_THICKNESS / 2, 0);
  slab.receiveShadow = true;
  group.add(slab);

  // Slab perimeter fascia band
  const fasciaGeo = new THREE.BoxGeometry(BUILDING_WIDTH + 0.55, SLAB_THICKNESS + 0.04, BUILDING_DEPTH + 0.55);
  const fasciaEdges = new THREE.EdgesGeometry(fasciaGeo);
  const fasciaLine = new THREE.LineSegments(
    fasciaEdges,
    new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 })
  );
  fasciaLine.position.copy(slab.position);
  group.add(fasciaLine);

  // Subtle architectural floor grid for spatial scale
  const grid = new THREE.GridHelper(BUILDING_DEPTH, 27, 0xcbd5e1, 0xe2e8f0);
  grid.position.set(0, 0.01, 0);
  grid.scale.set(BUILDING_WIDTH / BUILDING_DEPTH, 1, 1);
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  group.add(grid);

  // 2. Walls (exterior glass curtain vs interior partitions, split at doors)
  const doors = [...(floorGeom.doors || [])];
  if (floorDef.code === '9') {
    // Open the 2m corridor threshold [6,16.2]->[8,16.2] into the Floor 9 Library
    doors.push({ cx: 7.0, cz: 16.2, width: 2.0, orient: 'H' });
  }
  for (const wall of floorGeom.walls || []) {
    const isExt = isExteriorWall(wall);
    const subSegs = isExt
      ? (floorDef.code === 'G'
          ? splitWallAtDoors(wall, [{ cx: 6.0, cz: 27, width: 4.5, orient: 'H' }])
          : [wall])
      : splitWallAtDoors(wall, doors);

    for (const [x1, z1, x2, z2] of subSegs) {
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length < 0.15) continue;
      const thickness = isExt ? 0.22 : 0.18;
      const height = isExt ? WALL_HEIGHT + 0.35 : WALL_HEIGHT;
      const geo = new THREE.BoxGeometry(length, height, thickness);
      const mat = isExt ? sharedMaterials.exteriorGlass : sharedMaterials.interiorWall;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((x1 + x2) / 2, height / 2, (z1 + z2) / 2);
      mesh.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      if (!isExt) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      } else {
        exteriorGroup.add(mesh);
      }
    }
  }

  // Exterior corner & perimeter structural columns
  const colGeo = new THREE.BoxGeometry(0.45, WALL_HEIGHT + 0.45, 0.45);
  const colPositions = [
    [-16, -27], [0, -27], [16, -27],
    [-16, -9],  [16, -9],
    [-16, 9],   [16, 9],
    [-16, 27],  [16, 27],
  ];
  for (const [cx, cz] of colPositions) {
    const col = new THREE.Mesh(colGeo, sharedMaterials.mullion);
    col.position.set(cx, (WALL_HEIGHT + 0.45) / 2, cz);
    exteriorGroup.add(col);
  }

  // 3. Doorways (frames + semi-transparent door leaf + header lintel)
  // Skip any SVG door strokes inside the north elevator/stair circulation core so no stray door stands in front of the elevators
  const elevBoxForDoors = floorGeom.elevator || [-4.0, -25.0, 4.0, -21.0];
  for (const d of doors) {
    if (
      d.cx >= elevBoxForDoors[0] - 2.2 &&
      d.cx <= elevBoxForDoors[2] + 2.2 &&
      d.cz >= elevBoxForDoors[1] - 2.2 &&
      d.cz <= elevBoxForDoors[3] + 2.2
    ) {
      continue;
    }
    const doorW = Math.min(Math.max(d.width, 1.3), 2.2);
    const doorH = 2.25;
    const doorGroup = new THREE.Group();
    doorGroup.position.set(d.cx, 0, d.cz);
    if (d.orient === 'V') doorGroup.rotation.y = Math.PI / 2;

    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH, 0.24), sharedMaterials.doorFrame);
    frameL.position.set(-doorW / 2, doorH / 2, 0);
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH, 0.24), sharedMaterials.doorFrame);
    frameR.position.set(doorW / 2, doorH / 2, 0);
    const header = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.12, WALL_HEIGHT - doorH, 0.18), sharedMaterials.interiorWall);
    header.position.set(0, doorH + (WALL_HEIGHT - doorH) / 2, 0);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.72, doorH - 0.08, 0.06), sharedMaterials.doorPanel);
    leaf.position.set(-doorW * 0.14, (doorH - 0.08) / 2, 0.36);
    leaf.rotation.y = 0.55;

    doorGroup.add(frameL, frameR, header, leaf);
    group.add(doorGroup);
  }

  // Ground Floor Main Entrance Portal (South-East foyer at X=+6, Z=+27)
  if (floorDef.code === 'G') {
    const portalGroup = new THREE.Group();
    portalGroup.position.set(6.0, 0, 27.0);
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 0.28, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x1b365d, roughness: 0.4, metalness: 0.4 })
    );
    canopy.position.set(0, 3.3, 1.6);
    const matWelcome = new THREE.Mesh(
      new THREE.BoxGeometry(5.0, 0.05, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.7 })
    );
    matWelcome.position.set(0, 0.03, 0.6);
    const entranceSprite = createLabelSprite('MAIN ENTRANCE', 'Market Plaza · Ground Floor', '#059669');
    entranceSprite.position.set(0, 4.1, 2.0);
    labelSprites.push(entranceSprite);
    portalGroup.add(canopy, matWelcome, entranceSprite);
    group.add(portalGroup);
  }

  // 4. Toilets / Washrooms from SVG green polygons
  for (const [x1, z1, x2, z2] of floorGeom.toilets || []) {
    const w = Math.max(0.8, x2 - x1);
    const d = Math.max(0.8, z2 - z1);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.06, d - 0.2), sharedMaterials.toiletFloor);
    plate.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2);
    group.add(plate);
    const sp = createLabelSprite('Washrooms', 'Restrooms', '#059669');
    sp.position.set((x1 + x2) / 2, 2.35, (z1 + z2) / 2);
    sp.scale.set(3.2, 1.0, 1);
    labelSprites.push(sp);
    group.add(sp);
  }

  // 5. Central Dual-Elevator Core & Physically Attached Directional Staircases (Right = UP, Left = DOWN)
  const fullFloorName = formatFloorLabel(floorDef.code);
  const elevCoords = floorGeom.elevator || [-4.0, -25.0, 4.0, -21.0];
  {
    const [rawEx1, rawEz1, rawEx2, rawEz2] = elevCoords;
    const ecx = (rawEx1 + rawEx2) / 2;
    const ecz = (rawEz1 + rawEz2) / 2;

    // Consistent architectural proportions matching s1.png - s4.png
    const coreW = 4.0;
    const coreD = 2.5;
    const coreH = FLOOR_HEIGHT;
    const stairW = 1.35;
    const rearDeckD = 1.1;

    const coreX1 = ecx - coreW / 2;
    const coreX2 = ecx + coreW / 2;
    const coreZ1 = ecz - coreD / 2;
    const coreZ2 = ecz + coreD / 2; // Front face (South, facing floor corridor)

    const leftStairX = coreX1 - stairW / 2;
    const rightStairX = coreX2 + stairW / 2;

    const elevGroup = new THREE.Group();
    elevGroup.name = `elevator-core-${floorDef.code}`;
    elevGroup.userData = {
      isElevatorCore: true,
      floorCode: floorDef.code,
      elevatorCount: 2,
      coreBounds: [coreX1, coreZ1, coreX2, coreZ2],
      leftStairX,
      rightStairX,
    };

    const railGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.34,
      roughness: 0.2,
      depthWrite: false,
    });
    const topRailWoodMat = new THREE.MeshStandardMaterial({
      color: 0xb45309,
      roughness: 0.45,
      metalness: 0.2,
    });
    const landingDeckMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.72,
      metalness: 0.12,
    });
    const stringerMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.45,
    });
    const treadTopMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.55,
      metalness: 0.1,
    });

    // 5a. Attached Circulation Landing Slab wrapping Left, Front, and Right of the Dual-Elevator Core
    const totalStructW = coreW + stairW * 2;
    const totalStructD = coreD + 0.9;
    const baseDeck = new THREE.Mesh(
      new THREE.BoxGeometry(totalStructW, 0.14, totalStructD),
      landingDeckMat
    );
    baseDeck.position.set(ecx, 0.07, ecz + 0.25);
    elevGroup.add(baseDeck);

    // Purple elevator threshold apron directly in front of the two elevator doors (as in s4.png)
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(coreW + 0.16, 0.16, coreD + 0.55),
      sharedMaterials.elevatorFloor
    );
    apron.position.set(ecx, 0.08, ecz + 0.15);
    apron.userData.isElevatorSurface = true;
    elevGroup.add(apron);

    const apronRim = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(coreW + 0.2, 0.18, coreD + 0.58)),
      new THREE.LineBasicMaterial({ color: 0xd8b4fe })
    );
    apronRim.position.copy(apron.position);
    elevGroup.add(apronRim);

    // Structural outer support columns at the 4 corners of the attached staircase bays
    const outerLeftX = coreX1 - stairW;
    const outerRightX = coreX2 + stairW;
    const frontDeckZ = coreZ2 + 0.65;
    const backDeckZ = coreZ1 - rearDeckD;
    const postGeo = new THREE.BoxGeometry(0.18, coreH, 0.18);
    for (const [px, pz] of [
      [outerLeftX + 0.09, frontDeckZ - 0.09],
      [outerLeftX + 0.09, coreZ1 + 0.09],
      [outerLeftX + 0.09, backDeckZ + 0.09],
      [outerRightX - 0.09, frontDeckZ - 0.09],
      [outerRightX - 0.09, coreZ1 + 0.09],
      [outerRightX - 0.09, backDeckZ + 0.09],
    ]) {
      const post = new THREE.Mesh(postGeo, stringerMat);
      post.position.set(px, coreH / 2, pz);
      elevGroup.add(post);
    }

    // 5b. Central Dual-Elevator Core Structure (Two side-by-side elevators in one housing)
    const doorH = 2.22;
    const fasciaY = 2.42;
    const transomTopY = 3.65;

    // Translucent purple rear wall, left wall, right wall, and central dividing wall between Elevator 1 & Elevator 2
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(coreW, transomTopY, 0.14), sharedMaterials.elevatorWall);
    backWall.position.set(ecx, transomTopY / 2, coreZ1);
    backWall.userData.isElevatorSurface = true;

    const leftCoreWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, transomTopY, coreD), sharedMaterials.elevatorWall);
    leftCoreWall.position.set(coreX1, transomTopY / 2, ecz);
    leftCoreWall.userData.isElevatorSurface = true;

    const rightCoreWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, transomTopY, coreD), sharedMaterials.elevatorWall);
    rightCoreWall.position.set(coreX2, transomTopY / 2, ecz);
    rightCoreWall.userData.isElevatorSurface = true;

    const centerDividerWall = new THREE.Mesh(new THREE.BoxGeometry(0.16, transomTopY, coreD), sharedMaterials.elevatorFrame);
    centerDividerWall.position.set(ecx, transomTopY / 2, ecz);
    centerDividerWall.userData.isElevatorSurface = true;

    // Front vertical structural piers (Left, Center between the 2 elevators, Right)
    const pierGeo = new THREE.BoxGeometry(0.24, transomTopY + 0.15, 0.22);
    for (const px of [coreX1, ecx, coreX2]) {
      const pier = new THREE.Mesh(pierGeo, sharedMaterials.elevatorFrame);
      pier.position.set(px, (transomTopY + 0.15) / 2, coreZ2);
      pier.userData.isElevatorSurface = true;
      elevGroup.add(pier);
    }

    // Horizontal fascia beams across the front and top of the dual-elevator core
    const midFascia = new THREE.Mesh(new THREE.BoxGeometry(coreW + 0.24, 0.24, 0.24), sharedMaterials.elevatorFrame);
    midFascia.position.set(ecx, fasciaY, coreZ2);
    const topFascia = new THREE.Mesh(new THREE.BoxGeometry(coreW + 0.28, 0.22, coreD + 0.24), sharedMaterials.elevatorFrame);
    topFascia.position.set(ecx, transomTopY + 0.11, ecz);
    elevGroup.add(backWall, leftCoreWall, rightCoreWall, centerDividerWall, midFascia, topFascia);

    // Central call-button panel mounted on the center pier between the two elevators
    const callPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.36, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.5 })
    );
    callPlate.position.set(ecx, 1.18, coreZ2 + 0.12);
    elevGroup.add(callPlate);

    // Build Left Elevator (index 0) and Right Elevator (index 1) side by side
    const bayCenters = [
      { key: 'left', x: ecx - coreW / 4, label: 'Left Elevator' },
      { key: 'right', x: ecx + coreW / 4, label: 'Right Elevator' },
    ];
    for (const bay of bayCenters) {
      const bayGroup = new THREE.Group();
      bayGroup.name = `elevator-unit-${floorDef.code}-${bay.key}`;
      bayGroup.userData = {
        isElevatorUnit: true,
        elevatorSide: bay.key,
        floorCode: floorDef.code,
      };

      const doorW = 1.38;
      const leafW = (doorW - 0.05) / 2;

      // Purple metallic door surround frame
      const jambL = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH, 0.2), sharedMaterials.elevatorFrame);
      jambL.position.set(bay.x - doorW / 2 - 0.05, doorH / 2, coreZ2 + 0.02);
      const jambR = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorH, 0.2), sharedMaterials.elevatorFrame);
      jambR.position.set(bay.x + doorW / 2 + 0.05, doorH / 2, coreZ2 + 0.02);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.12, 0.2), sharedMaterials.elevatorFrame);
      lintel.position.set(bay.x, doorH + 0.06, coreZ2 + 0.02);

      // Pair of sliding purple elevator door leaves per elevator (4 door leaves total across the 2 elevators)
      const leafL = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.08), sharedMaterials.elevatorDoor);
      leafL.position.set(bay.x - leafW / 2 - 0.015, (doorH - 0.04) / 2, coreZ2 + 0.02);
      leafL.userData.isElevatorDoor = true;
      leafL.userData.elevatorSide = bay.key;

      const leafR = new THREE.Mesh(new THREE.BoxGeometry(leafW, doorH - 0.04, 0.08), sharedMaterials.elevatorDoor);
      leafR.position.set(bay.x + leafW / 2 + 0.015, (doorH - 0.04) / 2, coreZ2 + 0.02);
      leafR.userData.isElevatorDoor = true;
      leafR.userData.elevatorSide = bay.key;

      // Digital overhead floor display above each elevator door (cyan glow as in s1.png)
      const indicatorBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.14, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
      );
      indicatorBox.position.set(bay.x, fasciaY, coreZ2 + 0.11);
      const indicatorScreen = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.07, 0.09),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.85 })
      );
      indicatorScreen.position.copy(indicatorBox.position);

      // Upper glass transom window above each elevator door (y = 2.54..3.58)
      const transomH = transomTopY - fasciaY - 0.14;
      const transomY = fasciaY + 0.12 + transomH / 2;
      const transomGlass = new THREE.Mesh(
        new THREE.BoxGeometry(coreW / 2 - 0.24, transomH, 0.06),
        sharedMaterials.elevatorWall
      );
      transomGlass.position.set(bay.x, transomY, coreZ2);

      // Internal elevator cab frame visible inside each shaft
      const cabChamber = new THREE.Mesh(
        new THREE.BoxGeometry(coreW / 2 - 0.36, doorH - 0.15, coreD - 0.36),
        new THREE.MeshStandardMaterial({
          color: 0x581c87,
          emissive: 0x3b0764,
          emissiveIntensity: 0.25,
          roughness: 0.45,
          metalness: 0.3,
        })
      );
      cabChamber.position.set(bay.x, (doorH - 0.15) / 2 + 0.08, ecz);

      bayGroup.add(jambL, jambR, lintel, leafL, leafR, indicatorBox, indicatorScreen, transomGlass, cabChamber);
      elevGroup.add(bayGroup);
    }

    const elevSprite = createLabelSprite('Elevators (2)', fullFloorName, '#7c3aed');
    elevSprite.position.set(ecx, 3.95, coreZ2 + 0.25);
    elevSprite.scale.set(3.8, 1.18, 1);
    labelSprites.push(elevSprite);
    elevGroup.add(elevSprite);

    // Helper to build a solid attached stair flight with treads, risers, stringer beams, and glass balustrade
    const buildAttachedFlight = (pStart, pEnd, treadCount, width, axis) => {
      const flightGroup = new THREE.Group();
      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const dz = pEnd.z - pStart.z;
      const horizLen = Math.hypot(dx, dz);
      const totalLen = Math.hypot(horizLen, dy);

      for (let i = 0; i < treadCount; i++) {
        const t = (i + 0.5) / treadCount;
        const tx = pStart.x + dx * t;
        const ty = pStart.y + dy * t;
        const tz = pStart.z + dz * t;
        const stepDepth = horizLen / treadCount;
        const stepHeight = Math.abs(dy) / treadCount;

        const treadGeo = axis === 'Z'
          ? new THREE.BoxGeometry(width - 0.08, 0.07, stepDepth + 0.04)
          : new THREE.BoxGeometry(stepDepth + 0.04, 0.07, width - 0.08);
        const tread = new THREE.Mesh(treadGeo, treadTopMat);
        tread.position.set(tx, ty, tz);

        const riserGeo = axis === 'Z'
          ? new THREE.BoxGeometry(width - 0.1, stepHeight, stepDepth * 0.85)
          : new THREE.BoxGeometry(stepDepth * 0.85, stepHeight, width - 0.1);
        const riser = new THREE.Mesh(riserGeo, sharedMaterials.stairStep);
        riser.position.set(tx, ty - stepHeight * 0.45, tz);

        flightGroup.add(tread, riser);
      }

      // Structural sloped stringer carrier beam + top handrail
      const midX = (pStart.x + pEnd.x) / 2;
      const midY = (pStart.y + pEnd.y) / 2;
      const midZ = (pStart.z + pEnd.z) / 2;

      if (axis === 'Z') {
        const pitch = Math.atan2(dy, dz);
        const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, totalLen), stringerMat);
        stringer.position.set(midX, midY - 0.16, midZ);
        stringer.rotation.x = -pitch;

        const railOffset = midX > ecx ? width / 2 - 0.06 : -(width / 2 - 0.06);
        const handrail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, totalLen), topRailWoodMat);
        handrail.position.set(midX + railOffset, midY + 0.92, midZ);
        handrail.rotation.x = -pitch;

        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.78, totalLen * 0.95), railGlassMat);
        glassPanel.position.set(midX + railOffset, midY + 0.48, midZ);
        glassPanel.rotation.x = -pitch;

        flightGroup.add(stringer, handrail, glassPanel);
      } else {
        const pitch = Math.atan2(dy, dx);
        const stringer = new THREE.Mesh(new THREE.BoxGeometry(totalLen, 0.22, 0.14), stringerMat);
        stringer.position.set(midX, midY - 0.16, midZ);
        stringer.rotation.z = pitch;

        const handrail = new THREE.Mesh(new THREE.BoxGeometry(totalLen, 0.08, 0.08), topRailWoodMat);
        handrail.position.set(midX, midY + 0.92, midZ - (width / 2 - 0.06));
        handrail.rotation.z = pitch;

        const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(totalLen * 0.95, 0.78, 0.04), railGlassMat);
        glassPanel.position.set(midX, midY + 0.48, midZ - (width / 2 - 0.06));
        glassPanel.rotation.z = pitch;

        flightGroup.add(stringer, handrail, glassPanel);
      }

      return flightGroup;
    };

    // Helper to build a horizontal balustrade guardrail segment
    const buildGuardrail = (x1, z1, x2, z2, yBase) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rg = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(len, 0.82, 0.05), railGlassMat);
      glass.position.set((x1 + x2) / 2, yBase + 0.45, (z1 + z2) / 2);
      glass.rotation.y = -Math.atan2(z2 - z1, x2 - x1);

      const topBar = new THREE.Mesh(new THREE.BoxGeometry(len + 0.06, 0.08, 0.09), topRailWoodMat);
      topBar.position.set((x1 + x2) / 2, yBase + 0.9, (z1 + z2) / 2);
      topBar.rotation.y = glass.rotation.y;
      rg.add(glass, topBar);
      return rg;
    };

    // 5c. RIGHT-HAND STAIRCASE: UP (connects current floor L to next floor L + 1 above)
    const rightStairGroup = new THREE.Group();
    rightStairGroup.name = `staircase-${floorDef.code}-east`;
    const hasUpConnection = floorDef.levelIndex < 9;
    const nextFloorDef = FLOOR_DEFINITIONS.find(f => f.levelIndex === floorDef.levelIndex + 1);
    rightStairGroup.userData = {
      isStaircase: true,
      stairSide: 'right',
      stairDirection: 'up',
      fromFloor: floorDef.code,
      toFloor: nextFloorDef ? nextFloorDef.code : null,
      connectedToCore: true,
    };

    // Lower landing attached flush to current floor and right wall of elevator core
    const rightLowerLanding = new THREE.Mesh(
      new THREE.BoxGeometry(stairW, 0.16, 1.15),
      landingDeckMat
    );
    rightLowerLanding.position.set(rightStairX, 0.08, coreZ2 + 0.1);
    rightStairGroup.add(rightLowerLanding);

    if (hasUpConnection) {
      const midY = coreH * 0.52;
      // Flight 1: ascends along the right wall of the elevator core from front-right lower landing to rear-right turn landing
      const upFlight1 = buildAttachedFlight(
        new THREE.Vector3(rightStairX, 0.14, coreZ2 - 0.35),
        new THREE.Vector3(rightStairX, midY, coreZ1 + 0.05),
        9,
        stairW,
        'Z'
      );
      rightStairGroup.add(upFlight1);

      // Mid-level turn landing physically attached to the back-right of the elevator core
      const rearRightLanding = new THREE.Mesh(
        new THREE.BoxGeometry(coreW / 2 + stairW, 0.16, rearDeckD),
        landingDeckMat
      );
      rearRightLanding.position.set(ecx + (coreW / 2 + stairW) / 2, midY - 0.04, coreZ1 - rearDeckD / 2);
      rightStairGroup.add(rearRightLanding);
      rightStairGroup.add(buildGuardrail(outerRightX, coreZ1, outerRightX, backDeckZ, midY));
      rightStairGroup.add(buildGuardrail(ecx, backDeckZ, outerRightX, backDeckZ, midY));

      // Flight 2: ascends across the rear wall of the elevator core to the upper landing attached to the next floor (y = coreH)
      const upFlight2 = buildAttachedFlight(
        new THREE.Vector3(ecx, midY + 0.06, coreZ1 - rearDeckD / 2),
        new THREE.Vector3(coreX1, coreH, coreZ1 - rearDeckD / 2),
        7,
        rearDeckD,
        'X'
      );
      rightStairGroup.add(upFlight2);

      // Upper landing connecting flush at y = coreH (next floor elevation)
      const upperAttachmentLanding = new THREE.Mesh(
        new THREE.BoxGeometry(stairW, 0.16, rearDeckD + 0.6),
        landingDeckMat
      );
      upperAttachmentLanding.position.set(leftStairX, coreH - 0.06, coreZ1 - rearDeckD / 2 + 0.3);
      rightStairGroup.add(upperAttachmentLanding);

      const upSprite = createLabelSprite('Stairs UP', `To ${formatFloorLabel(nextFloorDef.code)}`, '#0284c7');
      upSprite.position.set(rightStairX, 2.25, coreZ2 + 0.25);
      upSprite.scale.set(2.8, 0.88, 1);
      labelSprites.push(upSprite);
      rightStairGroup.add(upSprite);
    } else {
      // Top floor (Floor 9): safety guardrail around top right landing deck (no flight above Floor 9)
      rightStairGroup.add(buildGuardrail(outerRightX, coreZ2 + 0.5, outerRightX, coreZ1, 0.12));
      rightStairGroup.add(buildGuardrail(coreX2, coreZ1, outerRightX, coreZ1, 0.12));
    }
    elevGroup.add(rightStairGroup);

    // 5d. LEFT-HAND STAIRCASE: DOWN (connects current floor L to lower floor L - 1 below)
    const leftStairGroup = new THREE.Group();
    leftStairGroup.name = `staircase-${floorDef.code}-west`;
    const hasDownConnection = floorDef.levelIndex > -2;
    const prevFloorDef = FLOOR_DEFINITIONS.find(f => f.levelIndex === floorDef.levelIndex - 1);
    leftStairGroup.userData = {
      isStaircase: true,
      stairSide: 'left',
      stairDirection: 'down',
      fromFloor: floorDef.code,
      toFloor: prevFloorDef ? prevFloorDef.code : null,
      connectedToCore: true,
    };

    // Upper landing attached flush to current floor and left wall of elevator core
    const leftUpperLanding = new THREE.Mesh(
      new THREE.BoxGeometry(stairW, 0.16, 1.15),
      landingDeckMat
    );
    leftUpperLanding.position.set(leftStairX, 0.08, coreZ2 + 0.1);
    leftStairGroup.add(leftUpperLanding);

    if (hasDownConnection) {
      const midDownY = -coreH * 0.48;
      // Flight 1: descends along the left wall of the elevator core from front-left upper landing to rear-left turn landing
      const downFlight1 = buildAttachedFlight(
        new THREE.Vector3(leftStairX, 0.04, coreZ2 - 0.35),
        new THREE.Vector3(leftStairX, midDownY, coreZ1 + 0.05),
        9,
        stairW,
        'Z'
      );
      leftStairGroup.add(downFlight1);

      // Mid-level turn landing attached to the back-left of the elevator core
      const rearLeftLanding = new THREE.Mesh(
        new THREE.BoxGeometry(coreW / 2 + stairW, 0.16, rearDeckD),
        landingDeckMat
      );
      rearLeftLanding.position.set(ecx - (coreW / 2 + stairW) / 2, midDownY - 0.04, coreZ1 - rearDeckD / 2);
      leftStairGroup.add(rearLeftLanding);
      leftStairGroup.add(buildGuardrail(outerLeftX, coreZ1, outerLeftX, backDeckZ, midDownY));
      leftStairGroup.add(buildGuardrail(outerLeftX, backDeckZ, ecx, backDeckZ, midDownY));

      // Flight 2: descends across the rear of the elevator core to the lower landing on the floor below (y = -coreH)
      const downFlight2 = buildAttachedFlight(
        new THREE.Vector3(ecx, midDownY - 0.06, coreZ1 - rearDeckD / 2),
        new THREE.Vector3(coreX2, -coreH, coreZ1 - rearDeckD / 2),
        7,
        rearDeckD,
        'X'
      );
      leftStairGroup.add(downFlight2);

      // Lower landing connecting flush at y = -coreH (floor below elevation)
      const lowerAttachmentLanding = new THREE.Mesh(
        new THREE.BoxGeometry(stairW, 0.16, rearDeckD + 0.6),
        landingDeckMat
      );
      lowerAttachmentLanding.position.set(rightStairX, -coreH + 0.06, coreZ1 - rearDeckD / 2 + 0.3);
      leftStairGroup.add(lowerAttachmentLanding);

      const downSprite = createLabelSprite('Stairs DOWN', `To ${formatFloorLabel(prevFloorDef.code)}`, '#475569');
      downSprite.position.set(leftStairX, 2.25, coreZ2 + 0.25);
      downSprite.scale.set(2.8, 0.88, 1);
      labelSprites.push(downSprite);
      leftStairGroup.add(downSprite);
    } else {
      // Lowest floor (Basement 2): safety guardrail around bottom left landing deck (no flight below Basement 2)
      leftStairGroup.add(buildGuardrail(outerLeftX, coreZ2 + 0.5, outerLeftX, coreZ1, 0.12));
      leftStairGroup.add(buildGuardrail(outerLeftX, coreZ1, coreX1, coreZ1, 0.12));
    }
    elevGroup.add(leftStairGroup);

    group.add(elevGroup);
  }

  // 6. Individual Rooms from ENHANCED_ROOM_DB for this floor
  const floorRooms = ENHANCED_ROOM_DB.filter(rm => rm.floor === floorDef.code);
  for (const rm of floorRooms) {
    const [rx1, rz1, rx2, rz2] = rm.bounds;
    const rw = Math.max(1.2, rx2 - rx1 - 0.28);
    const rd = Math.max(1.2, rz2 - rz1 - 0.28);
    const cx = (rx1 + rx2) / 2;
    const cz = (rz1 + rz2) / 2;

    const baseColor = CATEGORY_COLORS[rm.category] || 0x00a0df;
    const roomPlateGeo = new THREE.BoxGeometry(rw, 0.09, rd);
    const roomPlateMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      transparent: true,
      opacity: rm.verificationStatus === 'under-construction' ? 0.35 : 0.26,
      roughness: 0.65,
    });
    const roomPlate = new THREE.Mesh(roomPlateGeo, roomPlateMat);
    roomPlate.position.set(cx, 0.05, cz);
    roomPlate.userData = {
      isRoomMesh: true,
      roomId: rm.id,
      roomData: rm,
      baseColor,
      baseOpacity: roomPlateMat.opacity,
    };
    group.add(roomPlate);
    roomMeshes.push(roomPlate);

    // Subtle wireframe outline on floor plate
    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(rw, 0.11, rd));
    const edgeMat = new THREE.LineBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.45,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    edgeLines.position.copy(roomPlate.position);
    group.add(edgeLines);

    // Room floating label
    const accentHex = `#${baseColor.toString(16).padStart(6, '0')}`;
    const labelTitle = rm.room && rm.room !== '—' ? `${rm.room}` : rm.name;
    const labelSub = rm.room && rm.room !== '—' && rm.name !== rm.room ? rm.name : fullFloorName;
    const sprite = createLabelSprite(labelTitle, labelSub, accentHex);
    sprite.position.set(cx, 2.25, cz);
    if (rw < 4.5 || rd < 4.5) {
      sprite.scale.set(3.3, 1.02, 1);
    }
    sprite.userData = { roomId: rm.id };
    group.add(sprite);
    labelSprites.push(sprite);
  }

  // 7. Special construction zone marking for Floor 4
  if (floorGeom.isUnderConstruction) {
    const hazardMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.2,
      roughness: 0.8,
    });
    const zone = new THREE.Mesh(new THREE.BoxGeometry(24, 0.14, 34), hazardMat);
    zone.position.set(0, 0.08, 3);
    group.add(zone);
    const sp = createLabelSprite('FLOOR 4 · PHARMACY', 'Under Construction / Renovation', '#d97706');
    sp.position.set(0, 2.8, 3);
    sp.scale.set(6.5, 2.0, 1);
    labelSprites.push(sp);
    group.add(sp);
  }

  // 8. Exterior Floor Level Badge (West side for clear multistorey identification)
  const badge = createFloorBadgeSprite(floorDef.code);
  badge.position.set(-BUILDING_WIDTH / 2 - 2.6, 1.5, -BUILDING_DEPTH / 2 + 3.0);
  group.add(badge);

  return { group, roomMeshes, labelSprites, exteriorGroup };
}
