// 3D Room Manager: raycasting, hover feedback, destination selection,
// glowing outline box, and animated destination beacon pin.

import * as THREE from '../vendor/three.module.js';

export class RoomManager {
  constructor(buildingGenerator, scene) {
    this.building = buildingGenerator;
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.hoveredMesh = null;
    this.selectedRoomId = null;
    this.selectedMesh = null;

    this.highlightGroup = new THREE.Group();
    this.highlightGroup.name = 'room-highlight-group';
    this.scene.add(this.highlightGroup);

    this.clockTime = 0;
  }

  getInteractableMeshes() {
    return this.building.allRoomMeshes.filter(mesh => {
      let cur = mesh;
      while (cur) {
        if (!cur.visible) return false;
        cur = cur.parent;
      }
      return true;
    });
  }

  pickRoomAt(ndcX, ndcY, camera) {
    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, camera);
    const candidates = this.getInteractableMeshes();
    const hits = this.raycaster.intersectObjects(candidates, false);
    if (hits.length > 0) {
      return hits[0].object;
    }
    return null;
  }

  setHoveredMesh(mesh) {
    if (this.hoveredMesh === mesh) return;
    if (this.hoveredMesh && (!this.selectedMesh || this.hoveredMesh.userData.roomId !== this.selectedRoomId)) {
      const oldCompanions = this.hoveredMesh.userData.companionMeshes || [this.hoveredMesh];
      for (const m of oldCompanions) {
        m.material.opacity = m.userData.baseOpacity;
        m.material.emissive.setHex(0x000000);
      }
    }
    this.hoveredMesh = mesh;
    if (mesh && mesh.userData.roomId !== this.selectedRoomId) {
      const companions = mesh.userData.companionMeshes || [mesh];
      for (const m of companions) {
        m.material.opacity = 0.55;
        m.material.emissive.setHex(0x00a0df);
        m.material.emissiveIntensity = 0.35;
      }
    }
  }

  selectRoom(roomId) {
    this.clearSelection();
    if (!roomId) return null;

    const mesh = this.building.roomMeshById.get(roomId);
    if (!mesh) return null;

    this.selectedRoomId = roomId;
    this.selectedMesh = mesh;
    const rm = mesh.userData.roomData;

    const companions = mesh.userData.companionMeshes || [mesh];
    for (const m of companions) {
      m.material.opacity = 0.72;
      m.material.emissive.setHex(0x00a0df);
      m.material.emissiveIntensity = 0.55;
    }

    this.createHighlightVisuals(rm);
    return rm;
  }

  clearSelection() {
    if (this.selectedMesh) {
      const companions = this.selectedMesh.userData.companionMeshes || [this.selectedMesh];
      for (const m of companions) {
        m.material.opacity = m.userData.baseOpacity;
        m.material.emissive.setHex(0x000000);
        m.material.emissiveIntensity = 0;
      }
    }
    this.selectedRoomId = null;
    this.selectedMesh = null;
    this.clearGroup(this.highlightGroup);
    this.highlightGroup.visible = false;
  }

  createHighlightVisuals(rm) {
    this.clearGroup(this.highlightGroup);
    const y = this.building.getFloorY(rm.floor);
    const boxes = Array.isArray(rm.subBounds) && rm.subBounds.length > 0 ? rm.subBounds : [rm.bounds];

    for (const [x1, z1, x2, z2] of boxes) {
      const w = Math.max(1.4, x2 - x1 - 0.15);
      const d = Math.max(1.4, z2 - z1 - 0.15);
      const bCx = (x1 + x2) / 2;
      const bCz = (z1 + z2) / 2;

      // Glowing outline box
      const boxGeo = new THREE.BoxGeometry(w, 2.8, d);
      const edgeGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x00a0df, linewidth: 2 });
      const outline = new THREE.LineSegments(edgeGeo, edgeMat);
      outline.position.set(bCx, y + 1.4, bCz);
      this.highlightGroup.add(outline);
    }

    const [pinX, pinZ] = rm.pinPos || rm.center;

    // Pulsing floor ring
    const ringGeo = new THREE.RingGeometry(0.9, 1.35, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff671f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pinX, y + 0.14, pinZ);
    ring.userData.isPulseRing = true;
    this.highlightGroup.add(ring);

    // Floating 3D beacon pin
    const pinGroup = new THREE.Group();
    pinGroup.position.set(pinX, y + 3.2, pinZ);
    pinGroup.userData.isBeaconPin = true;
    pinGroup.userData.baseY = y + 3.2;

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.25, 16),
      new THREE.MeshStandardMaterial({ color: 0xff671f, emissive: 0xff671f, emissiveIntensity: 0.45 })
    );
    cone.rotation.x = Math.PI;
    cone.position.y = -0.3;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xff671f, emissive: 0xff671f, emissiveIntensity: 0.5 })
    );
    head.position.y = 0.5;

    pinGroup.add(cone, head);
    this.highlightGroup.add(pinGroup);
    this.updatePinVisibility(rm.floor);
  }

  updatePinVisibility(floorCode) {
    if (!this.selectedRoomId) {
      this.highlightGroup.visible = false;
      return;
    }
    const entry = this.building.floors.get(floorCode);
    this.highlightGroup.visible = entry ? Boolean(entry.group.visible) : true;
  }

  refreshSelectionPosition() {
    if (!this.selectedMesh) return;
    const rm = this.selectedMesh.userData.roomData;
    this.createHighlightVisuals(rm);
  }

  update(dt) {
    this.clockTime += dt;
    for (const child of this.highlightGroup.children) {
      if (child.userData.isBeaconPin) {
        child.position.y = child.userData.baseY + Math.sin(this.clockTime * 3.2) * 0.25;
        child.rotation.y += dt * 1.4;
      } else if (child.userData.isPulseRing) {
        const s = 1.0 + 0.2 * Math.sin(this.clockTime * 4.0);
        child.scale.set(s, s, 1);
      }
    }
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const c = group.children[0];
      group.remove(c);
      c.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
  }
}
