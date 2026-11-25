// 3D Route Renderer
// Renders walkable path strips, Need for Speed Underground-inspired sequentially animated
// directional chevron arrows, vertical transition indicators, start/destination markers,
// and active step highlight orb across visible floors.

import * as THREE from '../vendor/three.module.js';
import { formatFloorLabel } from '../data/building-data.js';

function createChevronGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.52);
  shape.lineTo(0.42, -0.22);
  shape.lineTo(0.18, -0.34);
  shape.lineTo(0, -0.02);
  shape.lineTo(-0.18, -0.34);
  shape.lineTo(-0.42, -0.22);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  geo.center();
  return geo;
}

function createTransitionSprite(title, subtitle, accentHex = '#7c3aed') {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(6, 6, 348, 84, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Inter, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 180, 38);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 20px Inter, Segoe UI, sans-serif';
  ctx.fillText(subtitle, 180, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(4.4, 1.18, 1);
  return sp;
}

export class RouteRenderer {
  constructor(buildingGenerator, scene) {
    this.building = buildingGenerator;
    this.scene = scene;
    this.routeGroup = new THREE.Group();
    this.routeGroup.name = 'indoor-route-group';
    this.scene.add(this.routeGroup);

    this.currentRoute = null;
    this.stepMarker = null;
    this.arrowMeshes = [];
    this.pulseTime = 0;
  }

  renderRoute(route) {
    this.clearRoute();
    if (!route || !route.path || route.path.length < 2) return;
    this.currentRoute = route;

    const deduped = [];
    for (const node of route.path) {
      const y = this.building.getFloorY(node.floor) + 0.34;
      const p = new THREE.Vector3(node.x, y, node.z);
      if (!deduped.length || deduped[deduped.length - 1].distanceTo(p) > 0.12) {
        deduped.push(p);
      }
    }
    if (deduped.length < 2) return;

    const baseChevronGeo = createChevronGeometry();
    const flatChevronGeo = baseChevronGeo.clone();
    flatChevronGeo.rotateX(Math.PI / 2); // Tip points +Z cleanly on XZ plane

    let seqIdx = 0;

    // 1. Render path tubes & sequential directional arrows along each segment
    for (let i = 0; i < route.path.length - 1; i++) {
      const a = route.path[i];
      const b = route.path[i + 1];
      const ya = this.building.getFloorY(a.floor) + 0.28;
      const yb = this.building.getFloorY(b.floor) + 0.28;
      const va = new THREE.Vector3(a.x, ya, a.z);
      const vb = new THREE.Vector3(b.x, yb, b.z);
      const segLen = va.distanceTo(vb);
      if (segLen < 0.08) continue;

      const isVertical = a.floor !== b.floor;
      const edge = route.edges?.[i];
      const isElevator = edge?.kind === 'elevator';
      const baseColor = isVertical ? (isElevator ? 0xa855f7 : 0x38bdf8) : 0x0ea5e9;
      const arrowColor = isVertical ? (isElevator ? 0xd8b4fe : 0x38bdf8) : 0x00f5d4;

      const segFloors = isVertical ? [a.floor, b.floor] : [a.floor];

      // Subtle glowing guide track under the arrows
      const curve = new THREE.LineCurve3(va, vb);
      const tubeGeo = new THREE.TubeGeometry(curve, 6, 0.14, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: baseColor,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        transparent: true,
        opacity: 0.72,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.userData.floors = segFloors;
      this.routeGroup.add(tubeMesh);

      // Animated directional chevron arrows spaced along the segment
      const spacing = isVertical ? 1.1 : 1.35;
      const count = Math.max(1, Math.floor(segLen / spacing));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const pos = new THREE.Vector3().lerpVectors(va, vb, t);
        const mat = new THREE.MeshStandardMaterial({
          color: arrowColor,
          emissive: arrowColor,
          emissiveIntensity: 0.85,
          roughness: 0.2,
          transparent: true,
          opacity: 0.92,
        });
        const arrow = new THREE.Mesh(isVertical ? baseChevronGeo : flatChevronGeo, mat);
        arrow.position.copy(pos);

        if (isVertical) {
          arrow.position.y = pos.y;
          arrow.position.z = pos.z + 0.45;
          if (yb < ya) arrow.rotation.z = Math.PI; // point DOWN
        } else {
          arrow.position.y += 0.14;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          arrow.rotation.y = Math.atan2(dx, dz);
        }

        arrow.userData = {
          isNavArrow: true,
          seqIndex: seqIdx++,
          floors: segFloors,
          baseColor: arrowColor,
        };
        this.routeGroup.add(arrow);
        this.arrowMeshes.push(arrow);
      }

      // Add vertical transition badge at floor departure point
      if (isVertical && (i === 0 || route.path[i - 1].floor === a.floor)) {
        // Scan ahead to find destination floor of the vertical shaft run
        let endIdx = i + 1;
        while (endIdx + 1 < route.path.length && route.path[endIdx + 1].floor !== route.path[endIdx].floor) {
          endIdx++;
        }
        const destFloor = route.path[endIdx].floor;
        const dirWord = route.path[endIdx].levelIndex > a.levelIndex ? 'UP ↑' : 'DOWN ↓';
        const badge = createTransitionSprite(
          isElevator ? `🛗 Elevator ${dirWord}` : `🪜 Stairs ${dirWord}`,
          `To ${formatFloorLabel(destFloor)}`,
          isElevator ? '#9333ea' : '#0284c7'
        );
        badge.position.set(a.x, ya + 2.35, a.z);
        badge.userData.floors = [a.floor];
        this.routeGroup.add(badge);
      }
    }

    // 2. Waypoint nodes at turns
    const wpGeo = new THREE.SphereGeometry(0.24, 12, 12);
    const wpMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00f5d4,
      emissiveIntensity: 0.5,
    });
    for (let i = 1; i < route.path.length - 1; i++) {
      const node = route.path[i];
      const sp = new THREE.Mesh(wpGeo, wpMat);
      sp.position.set(node.x, this.building.getFloorY(node.floor) + 0.32, node.z);
      sp.userData.floors = [node.floor];
      this.routeGroup.add(sp);
    }

    // 3. Start Marker (Green beacon)
    const startNode = route.path[0];
    const startPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.35, 18),
      new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.5 })
    );
    startPin.position.set(startNode.x, this.building.getFloorY(startNode.floor) + 0.72, startNode.z);
    startPin.userData.floors = [startNode.floor];
    this.routeGroup.add(startPin);

    // 4. Active step cursor marker (orange glowing orb)
    this.stepMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 18, 18),
      new THREE.MeshStandardMaterial({ color: 0xff671f, emissive: 0xff671f, emissiveIntensity: 0.75 })
    );
    this.stepMarker.position.set(startNode.x, this.building.getFloorY(startNode.floor) + 0.65, startNode.z);
    this.stepMarker.userData.floors = [startNode.floor];
    this.routeGroup.add(this.stepMarker);

    this.updateVisibility();
  }

  updateVisibility() {
    for (const child of this.routeGroup.children) {
      const fls = child.userData?.floors;
      if (!fls || !fls.length) {
        child.visible = true;
        continue;
      }
      child.visible = fls.some(f => Boolean(this.building.floors.get(f)?.group.visible));
    }
  }

  highlightStep(step) {
    if (!this.stepMarker || !step || !step.node) return;
    const node = step.endNode || step.node;
    const y = this.building.getFloorY(node.floor) + 0.65;
    this.stepMarker.position.set(node.x, y, node.z);
    this.stepMarker.userData.floors = [node.floor];
    this.updateVisibility();
  }

  refreshPositions() {
    if (this.currentRoute) {
      this.renderRoute(this.currentRoute);
    }
  }

  update(dt) {
    this.pulseTime += dt;
    // Sequential forward wave along Need for Speed Underground arrows (gentle speed, smooth pulse)
    for (const arrow of this.arrowMeshes) {
      if (!arrow.visible) continue;
      const phase = this.pulseTime * 5.2 - arrow.userData.seqIndex * 0.55;
      const wave = Math.pow(0.5 + 0.5 * Math.sin(phase), 2);
      arrow.material.emissiveIntensity = 0.28 + wave * 1.15;
      arrow.material.opacity = 0.42 + wave * 0.58;
      const s = 0.92 + wave * 0.24;
      arrow.scale.set(s, s, s);
    }

    if (this.stepMarker) {
      const s = 1.0 + 0.18 * Math.sin(this.pulseTime * 5.0);
      this.stepMarker.scale.set(s, s, s);
    }
  }

  clearRoute() {
    this.currentRoute = null;
    this.stepMarker = null;
    this.arrowMeshes = [];
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
