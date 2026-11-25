// Procedural Three.js Building Generator
// Assembles all 12 levels (B2 -> 9) into one connected Market Plaza Tower
// with continuous elevator shaft, dual staircases, and view-mode management.

import * as THREE from '../vendor/three.module.js';
import {
  FLOOR_DEFINITIONS,
  FLOOR_HEIGHT,
  BUILDING_WIDTH,
  BUILDING_DEPTH,
} from '../data/building-data.js';
import { loadFloorGeometry } from './svg-parser.js';
import { buildFloorGroup, applyFloorTheme } from './floor-generator.js';

export class BuildingGenerator {
  constructor(basePath = '.') {
    this.basePath = basePath;
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'victoria-university-tower';

    this.floors = new Map();       // code -> { def, geom, group, roomMeshes, labelSprites, exteriorGroup }
    this.allRoomMeshes = [];
    this.roomMeshById = new Map();
    this.verticalCoreGroup = new THREE.Group();
    this.verticalCoreGroup.name = 'vertical-cores';
    this.rootGroup.add(this.verticalCoreGroup);
    this.groundPlazaGroup = new THREE.Group();
    this.groundPlazaGroup.name = 'ground-context-plaza';
    this.rootGroup.add(this.groundPlazaGroup);
    this.plazaMesh = null;
    this.walkwayMesh = null;

    this.viewMode = 'building';    // 'building' | 'isolated' | 'cutaway' | 'exploded'
    this.activeFloorCode = 'G';
    this.showExteriorGlass = true;
  }

  async buildAllFloors(onProgress) {
    const total = FLOOR_DEFINITIONS.length;
    for (let i = 0; i < total; i++) {
      const def = FLOOR_DEFINITIONS[i];
      const geom = await loadFloorGeometry(def, this.basePath);
      const built = buildFloorGroup(def, geom);

      built.group.position.y = def.levelIndex * FLOOR_HEIGHT;
      this.rootGroup.add(built.group);

      this.floors.set(def.code, {
        def,
        geom,
        ...built,
      });

      for (const mesh of built.roomMeshes) {
        this.allRoomMeshes.push(mesh);
        this.roomMeshById.set(mesh.userData.roomId, mesh);
      }

      if (onProgress) onProgress((i + 1) / total, def);
    }

    this.buildVerticalShaftsAndStairs();
    this.buildGroundContextPlaza();
    this.applyViewMode(this.viewMode, this.activeFloorCode);
    return this.rootGroup;
  }

  buildVerticalShaftsAndStairs() {
    const minY = -2 * FLOOR_HEIGHT;
    const maxY = 10 * FLOOR_HEIGHT;
    const totalH = maxY - minY;
    const centerY = (minY + maxY) / 2;

    // Continuous translucent elevator shaft at North-Center (x: [-3.5, 3.5], z: [-24.5, -20.5])
    const shaftGeo = new THREE.BoxGeometry(5.6, totalH, 3.8);
    const shaftMat = new THREE.MeshPhysicalMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.14,
      roughness: 0.2,
      depthWrite: false,
    });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.position.set(0, centerY, -22.5);
    this.verticalCoreGroup.add(shaftMesh);

    const shaftWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(shaftGeo),
      new THREE.LineBasicMaterial({ color: 0x9333ea, transparent: true, opacity: 0.55 })
    );
    shaftWire.position.copy(shaftMesh.position);
    this.verticalCoreGroup.add(shaftWire);

    // Animated dual elevator cabs inside central shaft (Left cab & Right cab side by side)
    this.elevatorCab = new THREE.Group();
    const cabMat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      emissive: 0x4c1d95,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.4,
    });
    const cabLeft = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.6, 2.2), cabMat);
    cabLeft.position.set(-1.0, 0, 0);
    const cabRight = new THREE.Mesh(new THREE.BoxGeometry(1.75, 2.6, 2.2), cabMat);
    cabRight.position.set(1.0, 0, 0);
    this.elevatorCab.add(cabLeft, cabRight);
    this.elevatorCab.position.set(0, 1.45, -22.5);
    this.verticalCoreGroup.add(this.elevatorCab);
  }

  buildGroundContextPlaza() {
    // Ground plane at Y = -0.32 representing Jinja Road / Market Plaza surround
    const plazaGeo = new THREE.PlaneGeometry(110, 120);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.92,
      metalness: 0.02,
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, -0.32, 0);
    plaza.receiveShadow = true;
    this.plazaMesh = plaza;
    this.groundPlazaGroup.add(plaza);

    // Front approach walkway leading to Main Entrance (between Marketing Office & Pharmacy at X = -8.0, Z = +27..+38)
    const walkwayMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 });
    const mainWalkway = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.06, 11),
      walkwayMat
    );
    mainWalkway.position.set(-8.0, -0.28, BUILDING_DEPTH / 2 + 5.5);
    this.walkwayMesh = mainWalkway;
    this.groundPlazaGroup.add(mainWalkway);

    // South-East walkway leading from Exit (X = +6.0, Z = +27..+38)
    const exitWalkway = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.06, 11),
      walkwayMat
    );
    exitWalkway.position.set(6.0, -0.28, BUILDING_DEPTH / 2 + 5.5);
    this.groundPlazaGroup.add(exitWalkway);
  }

  getFloorY(floorCode) {
    const entry = this.floors.get(floorCode);
    if (!entry) return 0;
    return entry.group.position.y;
  }

  applyViewMode(mode, activeFloorCode = this.activeFloorCode) {
    const normalizedMode = mode === 'cutaway' ? 'isolated' : mode;
    this.viewMode = normalizedMode;
    this.activeFloorCode = activeFloorCode;

    const spacing = normalizedMode === 'exploded' ? 8.2 : FLOOR_HEIGHT;

    for (const [code, entry] of this.floors.entries()) {
      const lvl = entry.def.levelIndex;
      entry.group.position.y = lvl * spacing;

      if (normalizedMode === 'isolated') {
        entry.group.visible = code === activeFloorCode;
        entry.exteriorGroup.visible = this.showExteriorGlass;
      } else {
        // 'building' or 'exploded'
        entry.group.visible = true;
        entry.exteriorGroup.visible = this.showExteriorGlass;
      }

      // Show floating room labels clearly on active floor (or all in exploded/isolated)
      const showLabels =
        normalizedMode === 'isolated' ||
        normalizedMode === 'exploded' ||
        code === activeFloorCode;
      for (const sp of entry.labelSprites) {
        sp.visible = showLabels;
      }
    }

    // Hide the Ground context slab whenever isolating any floor (especially Basement 1 & Basement 2)
    if (this.groundPlazaGroup) {
      this.groundPlazaGroup.visible = normalizedMode === 'building';
    }

    // Vertical shaft visibility & scaling
    if (normalizedMode === 'exploded') {
      this.verticalCoreGroup.visible = true;
      this.verticalCoreGroup.scale.y = spacing / FLOOR_HEIGHT;
    } else if (normalizedMode === 'isolated') {
      this.verticalCoreGroup.visible = false;
    } else {
      this.verticalCoreGroup.visible = true;
      this.verticalCoreGroup.scale.y = 1;
    }
  }

  setTheme(isDark) {
    applyFloorTheme(isDark);
    if (this.plazaMesh) {
      this.plazaMesh.material.color.setHex(isDark ? 0x0f172a : 0xe2e8f0);
    }
    if (this.walkwayMesh) {
      this.walkwayMesh.material.color.setHex(isDark ? 0x1e293b : 0xcbd5e1);
    }
  }

  setExteriorGlassVisible(visible) {
    this.showExteriorGlass = visible;
    this.applyViewMode(this.viewMode, this.activeFloorCode);
  }

  moveElevatorCabToFloor(floorCode) {
    if (!this.elevatorCab) return;
    const y = this.getFloorY(floorCode);
    this.elevatorCab.position.y = y + 1.45;
  }

  dispose() {
    this.rootGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
