// Smooth 3D Camera Controller with OrbitControls
// Supports Building Overview, Floor Focus, Top-Down Floor View, Perspective 3D,
// Room Focus, and Route Step Follow without fighting user manual controls.

import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/OrbitControls.js';

export class CameraController {
  constructor(camera, domElement, buildingGenerator) {
    this.camera = camera;
    this.domElement = domElement;
    this.building = buildingGenerator;

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 210;
    this.controls.minDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    this.animating = false;
    this.startPos = new THREE.Vector3();
    this.endPos = new THREE.Vector3();
    this.startTarget = new THREE.Vector3();
    this.endTarget = new THREE.Vector3();
    this.animElapsed = 0;
    this.animDuration = 0.75;

    // Cancel programmatic transition immediately if user grabs camera
    this.controls.addEventListener('start', () => {
      this.animating = false;
    });

    this.setBuildingOverview(true);
  }

  transitionTo(pos, target, duration = 0.75, instant = false) {
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.animating = false;
      return;
    }
    this.startPos.copy(this.camera.position);
    this.startTarget.copy(this.controls.target);
    this.endPos.copy(pos);
    this.endTarget.copy(target);
    this.animElapsed = 0;
    this.animDuration = duration;
    this.animating = true;
  }

  setBuildingOverview(instant = false) {
    const target = new THREE.Vector3(0, 13.5, 0);
    const pos = new THREE.Vector3(62, 48, 82);
    this.transitionTo(pos, target, 0.85, instant);
  }

  setExplodedOverview(instant = false) {
    const target = new THREE.Vector3(0, 27, 0);
    const pos = new THREE.Vector3(88, 72, 114);
    this.transitionTo(pos, target, 0.85, instant);
  }

  setMapView(floorCode, instant = false) {
    const y = this.building.getFloorY(floorCode);
    const target = new THREE.Vector3(0, y + 0.5, 1.5);
    const pos = new THREE.Vector3(0, y + 88, 5.0);
    this.transitionTo(pos, target, 0.75, instant);
  }

  /**
   * Computes the standard h1.png angled/isometric architectural overview for any floor (B2..9),
   * adapting dynamically to the floor's actual geometry bounds and viewport aspect ratio.
   */
  getStandardFloorPose(floorCode) {
    const y = this.building.getFloorY(floorCode);
    const entry = this.building.floors.get(floorCode);
    let minX = -16;
    let maxX = 16;
    let minZ = -27;
    let maxZ = 27;
    if (entry && entry.geom && Array.isArray(entry.geom.worldBounds)) {
      [minX, minZ, maxX, maxZ] = entry.geom.worldBounds;
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const width = Math.max(24, maxX - minX);
    const depth = Math.max(40, maxZ - minZ);
    const geomScale = Math.max(width / 32, depth / 54);
    const aspect = this.camera.aspect || 1.4;
    const aspectScale = aspect < 1.25 ? Math.min(1.38, 1.28 / Math.max(0.7, aspect)) : 1.0;
    const s = geomScale * aspectScale;

    const target = new THREE.Vector3(cx, y + 0.5, cz + 0.5);
    const pos = new THREE.Vector3(
      cx + 35 * s,
      y + 31 * s,
      cz + 44 * s
    );
    return { pos, target };
  }

  resetFloorView(floorCode, instant = false) {
    const { pos, target } = this.getStandardFloorPose(floorCode);
    this.transitionTo(pos, target, 0.75, instant);
  }

  flyToFloor(floorCode, topDown = false) {
    if (topDown) {
      this.setMapView(floorCode);
      return;
    }
    this.resetFloorView(floorCode, false);
  }

  flyToRoom(roomData, topDown = false) {
    if (!roomData) return;
    if (topDown) {
      this.setMapView(roomData.floor);
      return;
    }
    this.resetFloorView(roomData.floor, false);
  }

  focusOnRouteStep(step) {
    if (!step || !step.node) return;
    const node = step.endNode || step.node;
    const y = this.building.getFloorY(node.floor);
    const target = new THREE.Vector3(node.x, y + 0.8, node.z);
    const pos = new THREE.Vector3(node.x + 14, y + 15, node.z + 17);
    this.transitionTo(pos, target, 0.65);
  }

  setTopDown(floorCode) {
    this.flyToFloor(floorCode, true);
  }

  setPerspective(floorCode) {
    this.flyToFloor(floorCode, false);
  }

  update(dt) {
    if (this.animating) {
      this.animElapsed += dt;
      const t = Math.min(1, this.animElapsed / this.animDuration);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(this.startPos, this.endPos, ease);
      this.controls.target.lerpVectors(this.startTarget, this.endTarget, ease);
      if (t >= 1) this.animating = false;
    }
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
