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

    // Animated elevator cab inside shaft
    this.elevatorCab = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.8, 3.0),
      new THREE.MeshStandardMaterial({
        color: 0x7c3aed,
        emissive: 0x4c1d95,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.4,
      })
    );
    this.elevatorCab.position.set(0, 1.5, -22.5);
    this.verticalCoreGroup.add(this.elevatorCab);

    // Dual Staircase Flights connecting consecutive levels (West x = -6.2, East x = +6.2, z = -22.0)
    const stairMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6, metalness: 0.25 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x0f2242, roughness: 0.4, metalness: 0.5 });

    for (let lvl = -2; lvl < 9; lvl++) {
      const yBase = lvl * FLOOR_HEIGHT;
      for (const sideX of [-6.4, 6.4]) {
        const flight = new THREE.Group();
        flight.position.set(sideX, yBase, -19.5);
        const steps = 10;
        const stepH = FLOOR_HEIGHT / steps;
        const stepD = 3.2 / steps;
        for (let s = 0; s < steps; s++) {
          const stepMesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.8, stepH * 0.65, stepD),
            stairMat
          );
          stepMesh.position.set(0, s * stepH + stepH * 0.3, -s * stepD);
          flight.add(stepMesh);
        }
        // Handrail beam
        const railLen = Math.hypot(FLOOR_HEIGHT, 3.2);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, railLen), railMat);
        rail.position.set(0.85, FLOOR_HEIGHT / 2 + 0.75, -1.6);
        rail.rotation.x = Math.atan2(FLOOR_HEIGHT, 3.2);
        flight.add(rail);
        this.verticalCoreGroup.add(flight);
      }
    }
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

    // Front approach walkway leading to Main Entrance (South side Z = +27..+40)
    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.06, 14),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.85 })
    );
    walkway.position.set(6.0, -0.28, BUILDING_DEPTH / 2 + 7);
    this.walkwayMesh = walkway;
    this.groundPlazaGroup.add(walkway);
  }

  getFloorY(floorCode) {
    const entry = this.floors.get(floorCode);
    if (!entry) return 0;
    return entry.group.position.y;
  }

  applyViewMode(mode, activeFloorCode = this.activeFloorCode) {
    this.viewMode = mode;
    this.activeFloorCode = activeFloorCode;
    const activeEntry = this.floors.get(activeFloorCode);
    const activeLevel = activeEntry ? activeEntry.def.levelIndex : 0;

    const spacing = mode === 'exploded' ? 8.2 : FLOOR_HEIGHT;

    for (const [code, entry] of this.floors.entries()) {
      const lvl = entry.def.levelIndex;
      entry.group.position.y = lvl * spacing;

      if (mode === 'isolated') {
        entry.group.visible = code === activeFloorCode;
        entry.exteriorGroup.visible = this.showExteriorGlass;
      } else if (mode === 'cutaway') {
        entry.group.visible = lvl <= activeLevel;
        entry.exteriorGroup.visible = this.showExteriorGlass && lvl === activeLevel;
      } else {
        // 'building' or 'exploded'
        entry.group.visible = true;
        entry.exteriorGroup.visible = this.showExteriorGlass;
      }

      // Show floating room labels clearly on active floor (or all in exploded/isolated)
      const showLabels =
        mode === 'isolated' ||
        mode === 'exploded' ||
        code === activeFloorCode;
      for (const sp of entry.labelSprites) {
        sp.visible = showLabels;
      }
    }

    // Hide the Ground context slab whenever isolating any floor (especially Basement 1 & Basement 2)
    // or when cutting away down to a basement level
    if (this.groundPlazaGroup) {
      if (mode === 'isolated' || mode === 'exploded') {
        this.groundPlazaGroup.visible = false;
      } else if (mode === 'cutaway') {
        this.groundPlazaGroup.visible = activeLevel >= 0;
      } else {
        this.groundPlazaGroup.visible = true;
      }
    }

    // Vertical shaft visibility & scaling
    if (mode === 'exploded') {
      this.verticalCoreGroup.visible = true;
      this.verticalCoreGroup.scale.y = spacing / FLOOR_HEIGHT;
    } else if (mode === 'isolated') {
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
