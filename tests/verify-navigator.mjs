// Automated verification test suite for Victoria University 3D Indoor Navigator
// Run with: node tests/verify-navigator.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FLOOR_DEFINITIONS,
  FLOOR_MAP,
  ENHANCED_ROOM_DB,
  AUDIT_SUMMARY,
  findRoomByIdOrAlias,
  searchRooms,
} from '../js/data/building-data.js';
import { SVG_GEOMETRY_CACHE } from '../js/data/svg-geometry-cache.js';
import { NavigationGraph, lineWallIntersection } from '../js/3d/navigation-graph.js';
import { IndoorPathfinder } from '../js/3d/pathfinder.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}\n   -> ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('Running Victoria University 3D Indoor Navigator Verification Suite...\n');

// 1. All 12 floors exist and 11 SVG floors have geometry
test('All 12 floors (B2..9) are defined in FLOOR_DEFINITIONS', () => {
  const expected = ['B2', 'B1', 'G', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  assert.deepEqual(FLOOR_DEFINITIONS.map(f => f.code), expected);
});

test('All 11 SVG floors exist in SVG_GEOMETRY_CACHE with normalized walls & doors', () => {
  for (const def of FLOOR_DEFINITIONS) {
    if (!def.hasSvg) continue;
    const g = SVG_GEOMETRY_CACHE[def.code];
    assert.ok(g, `Missing SVG cache for floor ${def.code}`);
    assert.ok(g.walls.length >= 20, `Floor ${def.code} expected >=20 walls, got ${g.walls.length}`);
    assert.ok(g.doors.length >= 10, `Floor ${def.code} expected >=10 doors, got ${g.doors.length}`);
    assert.ok(Array.isArray(g.elevator) && g.elevator.length === 4, `Floor ${def.code} missing elevator box`);
    // Verify normalized coordinate bounds [-16, 16] x [-27, 27]
    for (const [x1, z1, x2, z2] of g.walls) {
      assert.ok(x1 >= -16.1 && x1 <= 16.1 && x2 >= -16.1 && x2 <= 16.1, `Wall X out of bounds on ${def.code}`);
      assert.ok(z1 >= -27.1 && z1 <= 27.1 && z2 >= -27.1 && z2 <= 27.1, `Wall Z out of bounds on ${def.code}`);
    }
  }
});

// 2. Room database consistency across 2D ROOM_DB and 3D ENHANCED_ROOM_DB
test('Every room in 2D js/script.js ROOM_DB exists in ENHANCED_ROOM_DB', () => {
  const scriptContent = fs.readFileSync('js/script.js', 'utf-8');
  const ids = [...scriptContent.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(ids.length >= 120, `Expected >=120 ROOM_DB entries, got ${ids.length}`);
  for (const id of ids) {
    const rm = findRoomByIdOrAlias(id);
    assert.ok(rm, `Room id '${id}' from js/script.js missing in ENHANCED_ROOM_DB`);
    assert.ok(FLOOR_MAP[rm.floor], `Invalid floor '${rm.floor}' on room '${id}'`);
  }
});

test('All mapped rooms have valid 3D bounding boxes inside the building footprint', () => {
  for (const rm of ENHANCED_ROOM_DB) {
    const [x1, z1, x2, z2] = rm.bounds;
    assert.ok(x1 < x2 && z1 < z2, `Degenerate bounds on ${rm.id}`);
    assert.ok(x1 >= -16.1 && x2 <= 16.1 && z1 >= -27.1 && z2 <= 27.1, `Room ${rm.id} outside footprint`);
  }
});

// 3. Search queries & aliases
test('Search returns exact expected rooms for codes, names, and aliases', () => {
  const queries = [
    ['B201', 'room-b201'],
    ['B105', 'registration'],
    ['G02', 'student-support-office'],
    ['101', 'room-101'],
    ['202', 'ict-lab-1'],
    ['305', 'room-305'],
    ['501', 'room-501'],
    ['Boardroom 1', 'boardroom-1'],
    ['ICT Lab 1', 'ict-lab-1'],
    ['Computer Lab 1', 'computer-lab-1'],
    ['Library', 'room-902'],
    ['Cafeteria', 'cafeteria'],
    ['Reception', 'reception'],
    ['Student Support Office', 'student-support-office'],
    ['Editting Suite', 'computer-lab-2'], // typo alias
    ['6-01', 'room-601'],
  ];
  for (const [q, expectedId] of queries) {
    const results = searchRooms(q);
    assert.ok(results.some(r => r.id === expectedId), `Search '${q}' failed to return '${expectedId}'`);
  }
});

// 4. Navigation graph construction & wall-collision check
const graph = new NavigationGraph();
const pathfinder = new IndoorPathfinder(graph);

test('Corridor spine edges have zero unexpected wall crossings', () => {
  assert.equal(
    graph.wallCrossings.length,
    0,
    `Detected wall crossings in corridor graph: ${JSON.stringify(graph.wallCrossings)}`
  );
});

test('Verified SVG room doorway and entry edges have zero unpermitted solid wall crossings', () => {
  const crossings = [];
  for (const rm of ENHANCED_ROOM_DB) {
    if (rm.verificationStatus !== 'verified-svg') continue;
    const geom = SVG_GEOMETRY_CACHE[rm.floor];
    if (!geom) continue;
    const doors = [...geom.doors];
    if (rm.floor === '9') doors.push({ cx: 7.0, cz: 16.2, width: 2.0, orient: 'H' });
    if (rm.floor === 'G') doors.push({ cx: 6.0, cz: 27.0, width: 4.5, orient: 'H' });

    const doorNode = graph.nodes.get(`door:${rm.id}`);
    const roomNode = graph.nodes.get(`room:${rm.id}`);
    assert.ok(doorNode && roomNode, `Missing graph nodes for ${rm.id}`);

    for (const edge of graph.adj.get(doorNode.id) || []) {
      const target = graph.nodes.get(edge.to);
      if (!target || target.floor !== rm.floor) continue;
      const hit = lineWallIntersection(doorNode.x, doorNode.z, target.x, target.z, geom.walls, doors);
      if (hit) {
        crossings.push({ roomId: rm.id, floor: rm.floor, from: doorNode.id, to: target.id, hit });
      }
    }
  }
  assert.equal(
    crossings.length,
    0,
    `Detected solid wall crossings on verified-svg room/door edges: ${JSON.stringify(crossings.slice(0, 10))}`
  );
});

test('Every room in ENHANCED_ROOM_DB is reachable from Main Entrance via Elevator and Stairs', () => {
  for (const rm of ENHANCED_ROOM_DB) {
    if (rm.id === 'main-entrance') continue;
    const elevRoute = pathfinder.findRoute('main-entrance', rm.id, { mode: 'elevator' });
    assert.ok(elevRoute && elevRoute.path.length >= 2, `No elevator route to ${rm.id}`);

    const stairRoute = pathfinder.findRoute('main-entrance', rm.id, { mode: 'stairs' });
    assert.ok(stairRoute && stairRoute.path.length >= 2, `No stair route to ${rm.id}`);
  }
});

// 5. Same-floor and cross-floor route validation
test('Same-floor route (Main Entrance -> G02 Student Support Office) stays on Floor G', () => {
  const r = pathfinder.findRoute('main-entrance', 'student-support-office', { mode: 'elevator' });
  assert.ok(r);
  assert.deepEqual(r.floorsVisited, ['G']);
  assert.ok(r.steps.length >= 3);
});

test('Cross-floor elevator route (Main Entrance -> Room 305) uses elevator from G to 3', () => {
  const r = pathfinder.findRoute('main-entrance', 'room-305', { mode: 'elevator' });
  assert.ok(r);
  assert.equal(r.startRoom.floor, 'G');
  assert.equal(r.destRoom.floor, '3');
  assert.ok(r.edges.some(e => e.kind === 'elevator'), 'Expected elevator edge');
  assert.ok(!r.edges.some(e => e.kind === 'stairs'), 'Did not expect stairs edge in elevator mode');
  assert.ok(r.steps.some(s => s.kind === 'elevator' && s.instruction.includes('Floor 3')));
});

test('Cross-floor staircase route (B202 Dance Studio -> 902 Library) uses stairs from B2 to 9', () => {
  const r = pathfinder.findRoute('dance', 'room-902', { mode: 'stairs' });
  assert.ok(r);
  assert.equal(r.startRoom.floor, 'B2');
  assert.equal(r.destRoom.floor, '9');
  assert.ok(r.edges.some(e => e.kind === 'stairs'), 'Expected stairs edge');
  assert.ok(!r.edges.some(e => e.kind === 'elevator'), 'Did not expect elevator edge in stairs mode');
  assert.ok(r.steps.some(s => s.kind === 'stairs' && s.instruction.includes('Floor 9')));
});

test('Floor 4 (Under Construction) route includes verification/renovation notice', () => {
  const r = pathfinder.findRoute('main-entrance', 'floor-4-pharmacy', { mode: 'elevator' });
  assert.ok(r);
  assert.ok(r.steps.some(s => s.kind === 'notice' && s.instruction.includes('under construction')));
});

console.log(`\nSummary: ${passed} passed. Audit stats: ${JSON.stringify(AUDIT_SUMMARY)}`);
