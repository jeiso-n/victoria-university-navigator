// 3D Route Renderer
// Renders walkable path tubes along corridors, vertical transitions through elevator/stairs,
// start/destination markers, and active step highlight chevron.

import * as THREE from '../vendor/three.module.js';

export class RouteRenderer {
  constructor(buildingGenerator, scene) {
    this.building = buildingGenerator;
    this.scene = scene;
    this.routeGroup = new THREE.Group();
    this.routeGroup.name = 'indoor-route-group';
    this.scene.add(this.routeGroup);

    this.currentRoute = null;
    this.stepMarker = null;
    this.pulseTime = 0;
  }

  renderRoute(route) {
    this.clearRoute();
    if (!route || !route.path || route.path.length < 2) return;
    this.currentRoute = route;

    // Build 3D points grouped by continuous polyline
    const pts = route.path.map(node => {
      const y = this.building.getFloorY(node.floor) + 0.42;
      return new THREE.Vector3(node.x, y, node.z);
    });

    // Smooth curve with small corner bevels where points are distinct
    const deduped = [];
    for (const p of pts) {
      if (!deduped.length || deduped[deduped.length - 1].distanceTo(p) > 0.12) {
        deduped.push(p);
      }
    }

    if (deduped.length < 2) return;

    // Render floor-by-floor and vertical segments distinctly
    for (let i = 0; i < route.path.length - 1; i++) {
      const a = route.path[i];
      const b = route.path[i + 1];
      const ya = this.building.getFloorY(a.floor) + 0.42;
      const yb = this.building.getFloorY(b.floor) + 0.42;
      const va = new THREE.Vector3(a.x, ya, a.z);
      const vb = new THREE.Vector3(b.x, yb, b.z);
      if (va.distanceTo(vb) < 0.08) continue;

      const isVertical = a.floor !== b.floor;
      const color = isVertical ? 0x7c3aed : 0x00a0df;
      const radius = isVertical ? 0.22 : 0.24;

      const curve = new THREE.LineCurve3(va, vb);
      const tubeGeo = new THREE.TubeGeometry(curve, 6, radius, 10, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.25,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.routeGroup.add(tubeMesh);
    }

    // Waypoint spheres at turns & level landings
    const wpGeo = new THREE.SphereGeometry(0.32, 14, 14);
    const wpMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00a0df,
      emissiveIntensity: 0.45,
    });
    for (let i = 1; i < deduped.length - 1; i++) {
      const sp = new THREE.Mesh(wpGeo, wpMat);
      sp.position.copy(deduped[i]);
      this.routeGroup.add(sp);
    }

    // Start Marker (Green pillar + ring)
    const startPt = deduped[0];
    const startPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 1.4, 18),
      new THREE.MeshStandardMaterial({ color: 0x059669, emissive: 0x059669, emissiveIntensity: 0.4 })
    );
    startPin.position.set(startPt.x, startPt.y + 0.5, startPt.z);
    this.routeGroup.add(startPin);

    // Active step cursor marker (orange glowing orb)
    this.stepMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0xff671f, emissive: 0xff671f, emissiveIntensity: 0.7 })
    );
    this.stepMarker.position.copy(startPt);
    this.routeGroup.add(this.stepMarker);
  }

  highlightStep(step) {
    if (!this.stepMarker || !step || !step.node) return;
    const node = step.endNode || step.node;
    const y = this.building.getFloorY(node.floor) + 0.65;
    this.stepMarker.position.set(node.x, y, node.z);
  }

  refreshPositions() {
    if (this.currentRoute) {
      this.renderRoute(this.currentRoute);
    }
  }

  update(dt) {
    this.pulseTime += dt;
    if (this.stepMarker) {
      const s = 1.0 + 0.18 * Math.sin(this.pulseTime * 5.0);
      this.stepMarker.scale.set(s, s, s);
    }
  }

  clearRoute() {
    this.currentRoute = null;
    this.stepMarker = null;
    while (this.routeGroup.children.length > 0) {
      const c = this.routeGroup.children[0];
      this.routeGroup.remove(c);
      c.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
  }
}
