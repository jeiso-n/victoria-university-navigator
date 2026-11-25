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
    this.controls.maxDistance = 155;
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
    const target = new THREE.Vector3(0, 14, 0);
    const pos = new THREE.Vector3(48, 42, 62);
    this.transitionTo(pos, target, 0.85, instant);
  }

  flyToFloor(floorCode, topDown = false) {
    const y = this.building.getFloorY(floorCode);
    const target = new THREE.Vector3(0, y + 0.8, 0);
    const pos = topDown
      ? new THREE.Vector3(0, y + 44, 0.01)
      : new THREE.Vector3(21, y + 20, 27);
    this.transitionTo(pos, target, 0.75);
  }

  flyToRoom(roomData, topDown = false) {
    if (!roomData) return;
    const y = this.building.getFloorY(roomData.floor);
    const [cx, cz] = roomData.center;
    const target = new THREE.Vector3(cx, y + 1.0, cz);
    const pos = topDown
      ? new THREE.Vector3(cx, y + 26, cz + 0.01)
      : new THREE.Vector3(cx + 15, y + 14, cz + 18);
    this.transitionTo(pos, target, 0.75);
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
