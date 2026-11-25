// Multi-Floor Indoor Navigation Graph for Victoria University Market Plaza Tower.
// Uses actual SVG corridor geometry, doorway positions, elevator landings, and staircases
// across all 12 levels (B2 -> 9), with wall-collision validation so edges do not cross solid walls.

import { FLOOR_DEFINITIONS, ENHANCED_ROOM_DB, formatFloorLabel } from '../data/building-data.js';
import { SVG_GEOMETRY_CACHE } from '../data/svg-geometry-cache.js';

// Walkable corridor spine definitions per floor derived directly from each floor's SVG wall layout.
// Every corridor node is strictly inside open corridor space (outside room boxes & walls).
export const FLOOR_CORRIDOR_LAYOUTS = {
  B2: {
    elev: [0.8, -16.2],
    stairsWest: [-6.0, -16.2],
    stairsEast: [6.4, -16.2],
    nodes: [
      { id: 'c-nw', x: -8.0, z: -16.2, label: 'West corridor junction' },
      { id: 'c-ne', x:  8.8, z: -16.2, label: 'East corridor junction' },
      { id: 'c-w1', x: -8.0, z: -23.8, label: 'North-West corridor' },
      { id: 'c-w2', x: -8.0, z: -11.0, label: 'West corridor (near Mechanical Lab)' },
      { id: 'c-w3', x: -8.0, z:  -5.8, label: 'West corridor (near B201)' },
      { id: 'c-w4', x: -8.0, z:  12.3, label: 'West corridor (near B205)' },
      { id: 'c-w5', x: -8.0, z:  24.2, label: 'South-West corridor (near B206)' },
      { id: 'c-e1', x:  8.8, z: -23.7, label: 'North-East corridor (near B202)' },
      { id: 'c-e2', x:  8.8, z: -11.6, label: 'East corridor (near Mechanical Lab)' },
      { id: 'c-e3', x:  8.8, z:  -6.4, label: 'East corridor (near B203)' },
      { id: 'c-e4', x:  8.8, z:  12.3, label: 'East corridor (near B204)' },
      { id: 'c-e5', x:  8.8, z:  24.2, label: 'South-East corridor (near Music Room)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-nw', 'c-w2'], ['c-w2', 'c-w3'], ['c-w3', 'c-w4'], ['c-w4', 'c-w5'],
      ['c-ne', 'c-e1'], ['c-ne', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-e4'], ['c-e4', 'c-e5'],
    ],
  },
  B1: {
    elev: [1.0, -19.2],
    stairsWest: [-5.6, -19.2],
    stairsEast: [5.2, -19.2],
    nodes: [
      { id: 'c-nw', x: -7.2, z: -19.2, label: 'West corridor junction' },
      { id: 'c-ne', x:  7.2, z: -19.2, label: 'East corridor junction' },
      { id: 'c-w0', x: -7.2, z: -23.0, label: 'North-West corner (B101)' },
      { id: 'c-w1', x: -7.2, z: -15.6, label: 'West corridor (near B102)' },
      { id: 'c-w2', x: -7.2, z:  -9.0, label: 'West corridor (near B103)' },
      { id: 'c-w3', x: -7.2, z:   5.9, label: 'West corridor (near B104)' },
      { id: 'c-e1', x:  7.2, z: -15.7, label: 'East corridor (near B107)' },
      { id: 'c-e2', x:  7.2, z:  -9.6, label: 'East corridor (near B106)' },
      { id: 'c-e3', x:  7.2, z:  -7.7, label: 'East corridor (near B108)' },
      { id: 'c-e4', x:  7.2, z:   0.8, label: 'East corridor (near B109/B111)' },
      { id: 'c-e5', x:  7.2, z:  10.2, label: 'East corridor (near B110)' },
      { id: 'c-e6', x:  7.2, z:  12.7, label: 'East corridor (near B112)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'],
      ['c-nw', 'c-w0'], ['c-nw', 'c-w1'], ['c-w1', 'c-w2'], ['c-w2', 'c-w3'],
      ['c-ne', 'c-e1'], ['c-e1', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-e4'], ['c-e4', 'c-e5'], ['c-e5', 'c-e6'],
    ],
  },
  G: {
    elev: [-2.0, -19.2],
    stairsWest: [-6.8, -19.2],
    stairsEast: [2.7, -19.2],
    nodes: [
      { id: 'c-nw', x: -8.0, z: -19.2, label: 'North-West lobby' },
      { id: 'c-ne', x: -1.8, z: -14.75, label: 'Reception lobby' },
      { id: 'c-c1', x: -2.0, z:  -9.0, label: 'Central lobby (near Trophy Case)' },
      { id: 'c-w1', x: -8.0, z:  -9.0, label: 'West corridor junction' },
      { id: 'c-w2', x: -8.0, z:   3.3, label: 'West corridor (near Marketing)' },
      { id: 'c-w3', x: -8.0, z:  24.5, label: 'South-West corridor' },
      { id: 'c-e0', x:  3.0, z:  -9.5, label: 'South of Reception' },
      { id: 'c-e1', x:  6.0, z:  -9.5, label: 'East corridor (near VU Law Clinic)' },
      { id: 'c-e2', x:  6.0, z:  11.7, label: 'East corridor (near Stationery)' },
      { id: 'c-e3', x:  6.0, z:  14.4, label: 'East corridor (near Art Gallery)' },
      { id: 'c-e4', x:  6.0, z:  21.2, label: 'South-East lobby (near Pharmacy)' },
      { id: 'c-s0', x:  6.0, z:  24.5, label: 'Main Entrance foyer' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'], ['elev', 'c-c1'],
      ['c-nw', 'c-w1'], ['c-c1', 'c-w1'], ['c-c1', 'c-ne'], ['c-ne', 'c-e0'], ['c-e0', 'c-e1'],
      ['c-w1', 'c-w2'], ['c-w2', 'c-w3'],
      ['c-e1', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-e4'], ['c-e4', 'c-s0'],
    ],
  },
  '1': {
    elev: [-3.0, -19.2],
    stairsWest: [-7.0, -19.2],
    stairsEast: [1.5, -19.2],
    nodes: [
      { id: 'c-nw', x: -7.0, z: -19.2, label: 'West corridor junction' },
      { id: 'c-ne', x:  7.0, z: -19.2, label: 'East corridor junction' },
      { id: 'c-w1', x: -7.0, z: -15.8, label: 'West corridor (101/102)' },
      { id: 'c-w2', x: -7.0, z: -10.5, label: 'West corridor (103/104)' },
      { id: 'c-w3', x: -7.0, z:  -4.6, label: 'West corridor (105/106)' },
      { id: 'c-w4', x: -7.0, z:   1.8, label: 'West corridor (107/108)' },
      { id: 'c-w5', x: -7.0, z:   7.8, label: 'West corridor (109/110)' },
      { id: 'c-w6', x: -7.0, z:  13.2, label: 'West corridor (111/112)' },
      { id: 'c-w7', x: -7.0, z:  19.0, label: 'West corridor (113)' },
      { id: 'c-w8', x: -7.0, z:  23.8, label: 'South-West corridor (114 / Boardroom 2)' },
      { id: 'c-e1', x:  7.0, z: -15.9, label: 'East corridor (117)' },
      { id: 'c-e2', x:  7.0, z: -12.5, label: 'East corridor (116)' },
      { id: 'c-e3', x:  7.0, z:  -9.9, label: 'East corridor (119)' },
      { id: 'c-e4', x:  7.0, z:  -4.2, label: 'East corridor (118/121)' },
      { id: 'c-e5', x:  7.0, z:   2.6, label: 'East corridor (120/123)' },
      { id: 'c-e6', x:  7.0, z:   9.8, label: 'East corridor (122/125)' },
      { id: 'c-e7', x:  7.0, z:  14.3, label: 'East corridor (127)' },
      { id: 'c-e8', x:  7.0, z:  19.0, label: 'East corridor (124)' },
      { id: 'c-e9', x:  7.0, z:  23.4, label: 'South-East corridor (126 / Boardroom 3)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-w1', 'c-w2'], ['c-w2', 'c-w3'], ['c-w3', 'c-w4'],
      ['c-w4', 'c-w5'], ['c-w5', 'c-w6'], ['c-w6', 'c-w7'], ['c-w7', 'c-w8'],
      ['c-ne', 'c-e1'], ['c-e1', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-e4'],
      ['c-e4', 'c-e5'], ['c-e5', 'c-e6'], ['c-e6', 'c-e7'], ['c-e7', 'c-e8'], ['c-e8', 'c-e9'],
    ],
  },
  '2': {
    elev: [-0.7, -16.2],
    stairsWest: [-6.0, -16.2],
    stairsEast: [5.1, -16.2],
    nodes: [
      { id: 'c-nw', x: -8.4, z: -16.2, label: 'West corridor junction' },
      { id: 'c-ne', x:  7.2, z: -16.2, label: 'East corridor junction' },
      { id: 'c-w1', x: -8.4, z: -12.6, label: 'West corridor (near Room 201)' },
      { id: 'c-w2', x: -8.4, z:  -9.1, label: 'West corridor (near ICT Lab 1)' },
      { id: 'c-w3', x: -8.4, z:  23.0, label: 'South-West corridor (near Storage 210)' },
      { id: 'c-e1', x:  7.2, z: -12.6, label: 'East corridor (near 204)' },
      { id: 'c-e2', x:  7.2, z:  -3.1, label: 'East corridor (near 205 / ICT Lab 2)' },
      { id: 'c-e3', x:  7.2, z:   2.8, label: 'East corridor (near 206)' },
      { id: 'c-s',  x:  7.2, z:  24.0, label: 'South-East corridor' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-w1', 'c-w2'], ['c-w2', 'c-w3'],
      ['c-ne', 'c-e1'], ['c-e1', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-s'],
    ],
  },
  '3': {
    elev: [0.0, -19.0],
    stairsWest: [-6.4, -19.0],
    stairsEast: [4.2, -19.0],
    nodes: [
      { id: 'c-nw', x: -8.0, z: -19.0, label: 'West corridor junction' },
      { id: 'c-ne', x:  8.0, z: -19.0, label: 'East corridor junction' },
      { id: 'c-w1', x: -8.0, z: -14.6, label: 'West corridor (302 / 303)' },
      { id: 'c-w2', x: -8.0, z:  11.0, label: 'West corridor (304)' },
      { id: 'c-w3', x: -8.0, z:  14.1, label: 'West corridor (Skills Lab)' },
      { id: 'c-w4', x: -8.0, z:  22.1, label: 'South-West corridor (305)' },
      { id: 'c-e1', x:  8.0, z: -14.3, label: 'East corridor (307 / 308)' },
      { id: 'c-e2', x:  8.0, z:  -6.6, label: 'East corridor (Art Room / Anatomy Lab)' },
      { id: 'c-e3', x:  8.0, z:  14.1, label: 'East corridor (Nutrition Lab)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-w1', 'c-w2'], ['c-w2', 'c-w3'], ['c-w3', 'c-w4'],
      ['c-ne', 'c-e1'], ['c-e1', 'c-e2'], ['c-e2', 'c-e3'],
    ],
  },
  '4': {
    elev: [0.0, -18.0],
    stairsWest: [-6.0, -18.0],
    stairsEast: [6.0, -18.0],
    nodes: [
      { id: 'c-mid', x: 0.0, z: -14.0, label: 'Floor 4 Central Landing (Under Renovation)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'], ['elev', 'c-mid'],
    ],
  },
  '5': {
    elev: [0.8, -18.5],
    stairsWest: [-6.5, -18.5],
    stairsEast: [6.5, -18.5],
    nodes: [
      { id: 'c-c1', x:  1.2, z: -18.5, label: 'Central corridor (north)' },
      { id: 'c-c2', x:  1.2, z: -10.3, label: 'Central corridor (near Lab 2)' },
      { id: 'c-c3', x:  1.2, z:  -4.8, label: 'Central corridor (near Lab 1)' },
      { id: 'c-c4', x:  1.2, z:  -0.1, label: 'Central corridor (near Engineering & Graphics)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'], ['elev', 'c-c1'],
      ['c-c1', 'c-c2'], ['c-c2', 'c-c3'], ['c-c3', 'c-c4'],
    ],
  },
  '6': {
    elev: [0.0, -19.8],
    stairsWest: [-5.6, -19.8],
    stairsEast: [3.2, -19.8],
    nodes: [
      { id: 'c-nw', x: -3.0, z: -19.8, label: 'West corridor junction' },
      { id: 'c-ne', x:  2.2, z: -19.8, label: 'East corridor junction' },
      { id: 'c-w1', x: -3.0, z: -14.8, label: 'West corridor (6-01)' },
      { id: 'c-w2', x: -3.0, z:  -4.2, label: 'West corridor (6-03)' },
      { id: 'c-w3', x: -3.0, z:   8.7, label: 'West corridor (6-05)' },
      { id: 'c-w4', x: -3.0, z:  21.5, label: 'South-West corridor (Dean Institute)' },
      { id: 'c-w5', x: -8.0, z:  21.5, label: 'South-West lobby (Dean / Executive)' },
      { id: 'c-w6', x: -8.0, z:  25.85, label: 'Executive Assistant doorway lobby' },
      { id: 'c-e1', x:  2.2, z: -14.8, label: 'East corridor (Guild Office)' },
      { id: 'c-e2', x:  2.2, z:  -8.7, label: 'East corridor (6-02)' },
      { id: 'c-e3', x:  2.2, z:  -0.3, label: 'East corridor (6-04)' },
      { id: 'c-e4', x:  2.2, z:  19.9, label: 'South-East corridor (6-06)' },
      { id: 'c-s1', x: -3.0, z:  21.5, label: 'South junction' },
      { id: 'c-s2', x:  2.2, z:  22.5, label: 'South-East junction' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-nw'], ['stairsEast', 'c-ne'], ['c-nw', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-w1', 'c-w2'], ['c-w2', 'c-w3'], ['c-w3', 'c-w4'], ['c-w4', 'c-w5'], ['c-w5', 'c-w6'],
      ['c-ne', 'c-e1'], ['c-e1', 'c-e2'], ['c-e2', 'c-e3'], ['c-e3', 'c-e4'], ['c-e4', 'c-s2'],
      ['c-w4', 'c-s2'],
    ],
  },
  '7': {
    elev: [0.0, -18.8],
    stairsWest: [-6.4, -18.8],
    stairsEast: [4.0, -18.8],
    nodes: [
      { id: 'c-nw', x: -1.0, z: -18.8, label: 'North-West corridor' },
      { id: 'c-ne', x:  1.5, z: -18.8, label: 'North-East corridor' },
      { id: 'c-w1', x: -1.0, z: -15.0, label: 'Central corridor (Multi Studio / HOD Film)' },
      { id: 'c-w2', x: -1.0, z:  -6.1, label: 'Central corridor (Moot Court / 7-04)' },
      { id: 'c-w3', x: -1.0, z:   1.2, label: 'Central corridor (7-05)' },
      { id: 'c-w4', x: -1.0, z:   8.2, label: 'Central corridor (Law Boardroom)' },
      { id: 'c-w5', x: -1.0, z:  13.4, label: 'Central corridor (7-06)' },
      { id: 'c-s',  x: -1.0, z:  17.5, label: 'South Law Wing junction' },
      { id: 'c-sw', x: -9.0, z:  17.5, label: 'South-West corridor (Registrar / Assoc. Dean)' },
      { id: 'c-se', x:  9.0, z:  17.5, label: 'South-East corridor (Office of Dean)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['elev', 'c-nw'], ['elev', 'c-ne'], ['c-nw', 'c-ne'],
      ['c-nw', 'c-w1'], ['c-ne', 'c-w1'],
      ['c-w1', 'c-w2'], ['c-w2', 'c-w3'], ['c-w3', 'c-w4'], ['c-w4', 'c-w5'], ['c-w5', 'c-s'],
      ['c-s', 'c-sw'], ['c-s', 'c-se'],
    ],
  },
  '8': {
    elev: [-0.9, -19.2],
    stairsWest: [-7.0, -19.2],
    stairsEast: [3.1, -19.2],
    nodes: [
      { id: 'c-c0', x:  0.9, z: -19.2, label: 'North corridor' },
      { id: 'c-c1', x:  0.9, z: -14.4, label: 'Central corridor (8-01 / 8-02)' },
      { id: 'c-c2', x:  0.9, z: -11.6, label: 'Central corridor (8-03)' },
      { id: 'c-c3', x:  0.9, z:  -6.0, label: 'Central corridor (8-04)' },
      { id: 'c-c4', x:  0.9, z:   4.4, label: 'Central corridor (8-05 / 8-06)' },
      { id: 'c-c5', x:  0.9, z:   8.8, label: 'Central corridor (8-07 / 8-08)' },
      { id: 'c-s',  x:  0.9, z:  19.2, label: 'South corridor junction' },
      { id: 'c-sw', x: -6.8, z:  19.2, label: 'South-West corridor (QA / VC Office)' },
      { id: 'c-se', x:  8.2, z:  19.2, label: 'South-East corridor (8-10)' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'], ['elev', 'c-c0'],
      ['c-c0', 'c-c1'], ['c-c1', 'c-c2'], ['c-c2', 'c-c3'],
      ['c-c3', 'c-c4'], ['c-c4', 'c-c5'], ['c-c5', 'c-s'],
      ['c-s', 'c-sw'], ['c-s', 'c-se'],
    ],
  },
  '9': {
    elev: [1.0, -21.2],
    stairsWest: [-6.2, -21.2],
    stairsEast: [6.8, -21.2],
    nodes: [
      { id: 'c-w0', x: -7.5, z: -21.2, label: 'West corridor (near Elevator)' },
      { id: 'c-c1', x:  7.0, z: -19.0, label: 'Main Floor 9 corridor (Law Society)' },
      { id: 'c-c2', x:  7.0, z:  -5.0, label: 'Central corridor (Cafeteria / Program Admins)' },
      { id: 'c-c3', x:  7.0, z:   5.2, label: 'Central corridor (Meeting Rooms)' },
      { id: 'c-c4', x:  7.0, z:  21.0, label: 'South corridor (Library entrance)' },
      { id: 'lib-e', x: -1.45, z: 21.0, label: 'Inside Library (South)' },
      { id: 'lib-m', x: -1.45, z: 13.2, label: 'Inside Library (Silent Rooms)' },
      { id: 'lib-n', x: -1.45, z:  8.9, label: 'Inside Library (North)' },
      { id: 'lab-903', x: -1.45, z: 3.24, label: 'Editing Suite / Computer Lab 2' },
    ],
    links: [
      ['elev', 'stairsWest'], ['elev', 'stairsEast'],
      ['stairsWest', 'c-w0'], ['stairsEast', 'c-c1'],
      ['c-c1', 'c-c2'], ['c-c2', 'c-c3'], ['c-c3', 'c-c4'],
      ['c-c4', 'lib-e'], ['lib-e', 'lib-m'], ['lib-m', 'lib-n'], ['lib-n', 'lab-903'],
    ],
  },
};

function ccw(ax, az, bx, bz, cx, cz) {
  return (cz - az) * (bx - ax) > (bz - az) * (cx - ax);
}

export function segmentsStrictlyIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  // Check bounding box overlap first
  if (Math.max(ax, bx) < Math.min(cx, dx) - 0.05 || Math.min(ax, bx) > Math.max(cx, dx) + 0.05) return false;
  if (Math.max(az, bz) < Math.min(cz, dz) - 0.05 || Math.min(az, bz) > Math.max(cz, dz) + 0.05) return false;
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

function pointNearAnyDoor(x, z, doors, tolerance = 1.6) {
  for (const d of doors) {
    if (Math.hypot(x - d.cx, z - d.cz) <= tolerance) return true;
  }
  return false;
}

export function lineWallIntersection(ax, az, bx, bz, walls, doors) {
  for (const [wx1, wz1, wx2, wz2] of walls) {
    if (!segmentsStrictlyIntersect(ax, az, bx, bz, wx1, wz1, wx2, wz2)) continue;
    // Compute intersection point to check if a doorway exists there
    const denom = (ax - bx) * (wz1 - wz2) - (az - bz) * (wx1 - wx2);
    if (Math.abs(denom) < 1e-6) continue;
    const t = ((ax - wx1) * (wz1 - wz2) - (az - wz1) * (wx1 - wx2)) / denom;
    if (t <= 0.02 || t >= 0.98) continue;
    const ix = ax + t * (bx - ax);
    const iz = az + t * (bz - az);
    if (!pointNearAnyDoor(ix, iz, doors, 1.85)) {
      return { x: ix, z: iz, wall: [wx1, wz1, wx2, wz2] };
    }
  }
  return null;
}

export class NavigationGraph {
  constructor() {
    this.nodes = new Map(); // id -> { id, floor, levelIndex, x, z, type, label, roomId? }
    this.adj = new Map();   // id -> Array<{ to, weight, kind, floorChange? }>
    this.wallCrossings = [];
    this.build();
  }

  addNode(node) {
    this.nodes.set(node.id, node);
    if (!this.adj.has(node.id)) this.adj.set(node.id, []);
  }

  addEdge(fromId, toId, weight, kind, extra = {}) {
    if (!this.adj.has(fromId) || !this.adj.has(toId)) return;
    this.adj.get(fromId).push({ to: toId, weight, kind, ...extra });
    this.adj.get(toId).push({ to: fromId, weight, kind, ...extra });
  }

  build() {
    this.nodes.clear();
    this.adj.clear();
    this.wallCrossings = [];

    // 1. Add per-floor corridor spines, elevators, and stairs
    for (const def of FLOOR_DEFINITIONS) {
      const code = def.code;
      const layout = FLOOR_CORRIDOR_LAYOUTS[code];
      if (!layout) continue;

      const elevId = `elev-${code}`;
      const swId = `stairs-west-${code}`;
      const seId = `stairs-east-${code}`;

      const floorDisplay = formatFloorLabel(code);
      this.addNode({ id: elevId, floor: code, levelIndex: def.levelIndex, x: layout.elev[0], z: layout.elev[1], type: 'elevator', label: `${floorDisplay} Elevator` });
      this.addNode({ id: swId, floor: code, levelIndex: def.levelIndex, x: layout.stairsWest[0], z: layout.stairsWest[1], type: 'stairs', label: `${floorDisplay} West Staircase` });
      this.addNode({ id: seId, floor: code, levelIndex: def.levelIndex, x: layout.stairsEast[0], z: layout.stairsEast[1], type: 'stairs', label: `${floorDisplay} East Staircase` });

      const localToGlobal = (localId) => {
        if (localId === 'elev') return elevId;
        if (localId === 'stairsWest') return swId;
        if (localId === 'stairsEast') return seId;
        return `${code}:${localId}`;
      };

      for (const n of layout.nodes) {
        this.addNode({
          id: localToGlobal(n.id),
          floor: code,
          levelIndex: def.levelIndex,
          x: n.x,
          z: n.z,
          type: 'corridor',
          label: n.label,
        });
      }

      const geom = SVG_GEOMETRY_CACHE[code];
      const walls = geom ? geom.walls : [];
      const doors = [...(geom ? geom.doors : [])];
      // Floor 9 SVG closes the end of the corridor [6,16.2]->[8,16.2] at the Library threshold without an explicit #06c stroke
      if (code === '9') {
        doors.push({ cx: 7.0, cz: 16.2, width: 2.0, orient: 'H' });
      }

      for (const [aLocal, bLocal] of layout.links) {
        const aId = localToGlobal(aLocal);
        const bId = localToGlobal(bLocal);
        const a = this.nodes.get(aId);
        const b = this.nodes.get(bId);
        if (!a || !b) continue;
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        const hit = lineWallIntersection(a.x, a.z, b.x, b.z, walls, doors);
        if (hit) {
          this.wallCrossings.push({ floor: code, from: aId, to: bId, hit });
        }
        this.addEdge(aId, bId, dist, 'walk');
      }
    }

    // 2. Connect vertical elevator & staircase edges between consecutive levels (B2 <-> 9)
    for (let i = 0; i < FLOOR_DEFINITIONS.length - 1; i++) {
      const fA = FLOOR_DEFINITIONS[i];
      const fB = FLOOR_DEFINITIONS[i + 1];
      this.addEdge(`elev-${fA.code}`, `elev-${fB.code}`, 4.5, 'elevator');
      this.addEdge(`stairs-west-${fA.code}`, `stairs-west-${fB.code}`, 9.5, 'stairs');
      this.addEdge(`stairs-east-${fA.code}`, `stairs-east-${fB.code}`, 9.5, 'stairs');
    }

    // 3. Add every room's doorway node + interior node, attaching doorway to nearest walkable corridor node
    for (const rm of ENHANCED_ROOM_DB) {
      const code = rm.floor;
      const roomNodeId = `room:${rm.id}`;
      const doorNodeId = `door:${rm.id}`;

      const [rx, rz] = rm.center;
      const [dx, dz] = rm.door;

      this.addNode({
        id: roomNodeId,
        floor: code,
        levelIndex: rm.levelIndex,
        x: rx,
        z: rz,
        type: 'room',
        roomId: rm.id,
        label: `${rm.name}${rm.room && rm.room !== '—' && !rm.name.includes(rm.room) ? ` (${rm.room})` : ''}`,
      });

      this.addNode({
        id: doorNodeId,
        floor: code,
        levelIndex: rm.levelIndex,
        x: dx,
        z: dz,
        type: 'door',
        roomId: rm.id,
        label: `Doorway to ${rm.name}`,
      });

      const doorToRoomDist = Math.hypot(rx - dx, rz - dz);
      this.addEdge(doorNodeId, roomNodeId, Math.max(0.5, doorToRoomDist), 'enter');

      // Find best corridor node on same floor (prioritizing clear line of sight without wall crossings)
      const geom = SVG_GEOMETRY_CACHE[code];
      const walls = geom ? geom.walls : [];
      const doors = [...(geom ? geom.doors : [])];
      // Floor 9 SVG closes the end of the corridor [6,16.2]->[8,16.2] at the Library threshold without an explicit #06c stroke
      if (code === '9') {
        doors.push({ cx: 7.0, cz: 16.2, width: 2.0, orient: 'H' });
      }

      const floorCorridors = [];
      for (const node of this.nodes.values()) {
        if (node.floor === code && (node.type === 'corridor' || node.type === 'elevator')) {
          const d = Math.hypot(node.x - dx, node.z - dz);
          const blocked = lineWallIntersection(node.x, node.z, dx, dz, walls, doors);
          floorCorridors.push({ node, d, blocked: Boolean(blocked) });
        }
      }

      floorCorridors.sort((a, b) => {
        if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
        return a.d - b.d;
      });

      if (floorCorridors.length > 0) {
        const best = floorCorridors[0];
        this.addEdge(best.node.id, doorNodeId, Math.max(0.5, best.d), 'walk');
        // Also connect second-nearest unblocked corridor if close, to allow smooth turns
        if (floorCorridors.length > 1 && !floorCorridors[1].blocked && floorCorridors[1].d < 10.0) {
          this.addEdge(floorCorridors[1].node.id, doorNodeId, floorCorridors[1].d, 'walk');
        }
      }
    }
  }
}
