// Procedural Three.js Floor Generator
// Builds accurate 3D architectural floors directly from normalized SVG geometry
// and ENHANCED_ROOM_DB metadata (slabs, walls with doorway cutouts, doors,
// room zones, washrooms, elevators, staircases, and floating room labels).

import * as THREE from '../vendor/three.module.js';
import {
  BUILDING_WIDTH,
  BUILDING_DEPTH,
  SLAB_THICKNESS,
  WALL_HEIGHT,
  ENHANCED_ROOM_DB,
} from '../data/building-data.js';

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
  elevatorFloor: new THREE.MeshStandardMaterial({ color: 0xc084fc, roughness: 0.5, metalness: 0.2 }),
  stairStep: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6, metalness: 0.2 }),
  stairRail: new THREE.MeshStandardMaterial({ color: 0x0f2242, roughness: 0.4, metalness: 0.6 }),
  constructionStripe: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.65 }),
};

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
  canvas.width = 180;
  canvas.height = 84;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = floorCode === 'G' ? '#059669' : floorCode.startsWith('B') ? '#475569' : '#1b365d';
  roundRect(ctx, 4, 4, 172, 76, 16);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(floorCode === 'G' ? 'G' : `FL ${floorCode}`, 90, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(4.2, 1.95, 1);
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
  for (const d of doors) {
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

  // 5. Elevator Landing Zone
  if (floorGeom.elevator) {
    const [ex1, ez1, ex2, ez2] = floorGeom.elevator;
    const ew = Math.max(1.5, ex2 - ex1);
    const ed = Math.max(1.5, ez2 - ez1);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.08, ed), sharedMaterials.elevatorFloor);
    pad.position.set((ex1 + ex2) / 2, 0.04, (ez1 + ez2) / 2);
    group.add(pad);
    const sp = createLabelSprite('ELEVATORS', `Floor ${floorDef.code}`, '#7c3aed');
    sp.position.set((ex1 + ex2) / 2, 2.75, (ez1 + ez2) / 2);
    sp.scale.set(3.4, 1.05, 1);
    labelSprites.push(sp);
    group.add(sp);
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
    const labelSub = rm.room && rm.room !== '—' && rm.name !== rm.room ? rm.name : `Floor ${rm.floor}`;
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
