// Three.js Scene Manager
// Handles WebGL support detection, renderer lifecycle, lighting, resize, pointer picking,
// and coordinating BuildingGenerator, RoomManager, NavigationGraph, Pathfinder, RouteRenderer, and CameraController.

import * as THREE from '../vendor/three.module.js';
import { BuildingGenerator } from './building-generator.js';
import { RoomManager } from './room-manager.js';
import { NavigationGraph } from './navigation-graph.js';
import { IndoorPathfinder } from './pathfinder.js';
import { RouteRenderer } from './route-renderer.js';
import { CameraController } from './camera-controller.js';

export function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch (_) {
    return false;
  }
}

export class SceneManager {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.basePath = options.basePath || '.';
    this.onRoomSelect = options.onRoomSelect || (() => {});
    this.onRoomHover = options.onRoomHover || (() => {});
    this.onReady = options.onReady || (() => {});
    this.onProgress = options.onProgress || (() => {});

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.building = null;
    this.roomManager = null;
    this.graph = null;
    this.pathfinder = null;
    this.routeRenderer = null;
    this.cameraController = null;

    this.rafId = null;
    this.lastTime = performance.now();
    this.disposed = false;
    this.pointerDownPos = { x: 0, y: 0 };
  }

  async init() {
    if (!checkWebGLSupport()) {
      throw new Error('WebGL is not supported or is disabled in this browser.');
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight - 64;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef4fa);
    this.scene.fog = new THREE.Fog(0xeef4fa, 110, 230);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.2, 450);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();

    this.building = new BuildingGenerator(this.basePath);
    await this.building.buildAllFloors(this.onProgress);
    this.scene.add(this.building.rootGroup);

    this.roomManager = new RoomManager(this.building, this.scene);
    this.graph = new NavigationGraph();
    this.pathfinder = new IndoorPathfinder(this.graph);
    this.routeRenderer = new RouteRenderer(this.building, this.scene);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement, this.building);

    this.bindEvents();
    this.lastTime = performance.now();
    this.animate();
    this.onReady();
  }

  setupLighting() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sun.position.set(42, 78, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 190;
    const d = 55;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xe0f2fe, 0.55);
    fill.position.set(-45, 35, -40);
    this.scene.add(fill);
  }

  bindEvents() {
    this._onResize = () => this.handleResize();
    window.addEventListener('resize', this._onResize);

    const dom = this.renderer.domElement;
    this._onPointerDown = (e) => {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    this._onPointerMove = (e) => {
      const rect = dom.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hit = this.roomManager.pickRoomAt(ndcX, ndcY, this.camera);
      this.roomManager.setHoveredMesh(hit);
      dom.style.cursor = hit ? 'pointer' : 'grab';
      this.onRoomHover(hit ? hit.userData.roomData : null, e);
    };
    this._onPointerUp = (e) => {
      const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
      if (moved > 5) return;
      const rect = dom.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const hit = this.roomManager.pickRoomAt(ndcX, ndcY, this.camera);
      if (hit) {
        this.selectRoom(hit.userData.roomId, false);
        this.onRoomSelect(hit.userData.roomData);
      }
    };

    dom.addEventListener('pointerdown', this._onPointerDown);
    dom.addEventListener('pointermove', this._onPointerMove);
    dom.addEventListener('pointerup', this._onPointerUp);
  }

  handleResize() {
    if (!this.renderer || !this.camera || !this.container) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight - 64;
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  setViewMode(mode, floorCode) {
    this.building.applyViewMode(mode, floorCode || this.building.activeFloorCode);
    this.roomManager.refreshSelectionPosition();
    this.routeRenderer.refreshPositions();
  }

  focusFloor(floorCode, viewMode = 'isolated', topDown = false) {
    this.building.applyViewMode(viewMode, floorCode);
    this.building.moveElevatorCabToFloor(floorCode);
    this.roomManager.refreshSelectionPosition();
    this.routeRenderer.refreshPositions();
    this.cameraController.flyToFloor(floorCode, topDown);
  }

  selectRoom(roomId, moveCamera = true) {
    const rm = this.roomManager.selectRoom(roomId);
    if (!rm) return null;
    if (this.building.viewMode === 'building') {
      this.building.applyViewMode('cutaway', rm.floor);
    } else {
      this.building.applyViewMode(this.building.viewMode, rm.floor);
    }
    this.building.moveElevatorCabToFloor(rm.floor);
    this.roomManager.refreshSelectionPosition();
    this.routeRenderer.refreshPositions();
    if (moveCamera) {
      this.cameraController.flyToRoom(rm);
    }
    return rm;
  }

  calculateRoute(startRoomId, destRoomId, mode = 'elevator') {
    const route = this.pathfinder.findRoute(startRoomId, destRoomId, { mode });
    if (!route) return null;
    // Show cutaway up to highest floor in route (or full building) so vertical transition is visible
    const maxLvl = Math.max(route.startRoom.levelIndex, route.destRoom.levelIndex);
    const highestCode = route.startRoom.levelIndex === maxLvl ? route.startRoom.floor : route.destRoom.floor;
    this.building.applyViewMode(route.startRoom.floor === route.destRoom.floor ? 'isolated' : 'cutaway', highestCode);
    this.roomManager.selectRoom(route.destRoom.id);
    this.routeRenderer.renderRoute(route);
    this.cameraController.flyToFloor(route.startRoom.floor, false);
    return route;
  }

  clearRoute() {
    this.routeRenderer.clearRoute();
  }

  animate() {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(() => this.animate());
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.roomManager.update(dt);
    this.routeRenderer.update(dt);
    this.cameraController.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this.renderer && this.renderer.domElement) {
      const dom = this.renderer.domElement;
      dom.removeEventListener('pointerdown', this._onPointerDown);
      dom.removeEventListener('pointermove', this._onPointerMove);
      dom.removeEventListener('pointerup', this._onPointerUp);
    }
    if (this.cameraController) this.cameraController.dispose();
    if (this.building) this.building.dispose();
    if (this.renderer) this.renderer.dispose();
  }
}
