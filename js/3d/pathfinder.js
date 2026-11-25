// A* Indoor Pathfinder & Turn-by-Turn Instruction Generator
// Computes shortest accessible paths across all 12 levels using the NavigationGraph.

import { FLOOR_MAP, findRoomByIdOrAlias } from '../data/building-data.js';

export class IndoorPathfinder {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Finds shortest route from startRoomId to destRoomId.
   * @param {string} startRoomId
   * @param {string} destRoomId
   * @param {{ mode?: 'elevator'|'stairs'|'fastest' }} options
   */
  findRoute(startRoomId, destRoomId, options = {}) {
    const mode = options.mode || 'elevator';
    const startRoom = findRoomByIdOrAlias(startRoomId);
    const destRoom = findRoomByIdOrAlias(destRoomId);
    if (!startRoom || !destRoom) return null;

    const startNodeId = `room:${startRoom.id}`;
    const goalNodeId = `room:${destRoom.id}`;
    if (!this.graph.nodes.has(startNodeId) || !this.graph.nodes.has(goalNodeId)) {
      return null;
    }

    if (startRoom.id === destRoom.id) {
      const node = this.graph.nodes.get(startNodeId);
      return {
        startRoom,
        destRoom,
        mode,
        path: [node],
        edges: [],
        distanceMeters: 0,
        estimatedSeconds: 0,
        floorsVisited: [startRoom.floor],
        steps: [{
          stepNumber: 1,
          floor: startRoom.floor,
          kind: 'arrive',
          instruction: `You are already at ${destRoom.name}.`,
          node,
        }],
      };
    }

    const goalNode = this.graph.nodes.get(goalNodeId);
    const open = new Set([startNodeId]);
    const cameFrom = new Map();
    const cameEdge = new Map();
    const gScore = new Map([[startNodeId, 0]]);
    const fScore = new Map([[startNodeId, this.heuristic(this.graph.nodes.get(startNodeId), goalNode)]]);

    while (open.size > 0) {
      let current = null;
      let bestF = Infinity;
      for (const id of open) {
        const f = fScore.get(id) ?? Infinity;
        if (f < bestF) {
          bestF = f;
          current = id;
        }
      }

      if (current === goalNodeId) {
        return this.reconstructResult(startRoom, destRoom, mode, cameFrom, cameEdge, goalNodeId);
      }

      open.delete(current);
      const neighbors = this.graph.adj.get(current) || [];
      for (const edge of neighbors) {
        // Respect vertical mode preferences
        if (mode === 'elevator' && edge.kind === 'stairs') continue;
        if (mode === 'stairs' && edge.kind === 'elevator') continue;

        // Do not transit through unrelated room interiors
        const nextNode = this.graph.nodes.get(edge.to);
        if (nextNode.type === 'room' && edge.to !== goalNodeId && edge.to !== startNodeId) continue;

        const penalty = edge.kind === 'enter' && edge.to !== goalNodeId && current !== startNodeId ? 1000 : 0;
        const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight + penalty;

        if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
          cameFrom.set(edge.to, current);
          cameEdge.set(edge.to, edge);
          gScore.set(edge.to, tentativeG);
          fScore.set(edge.to, tentativeG + this.heuristic(nextNode, goalNode));
          open.add(edge.to);
        }
      }
    }

    return null;
  }

  heuristic(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dy = (b.levelIndex - a.levelIndex) * 4.2;
    return Math.hypot(dx, dy, dz);
  }

  reconstructResult(startRoom, destRoom, mode, cameFrom, cameEdge, goalNodeId) {
    const path = [];
    const edges = [];
    let cur = goalNodeId;
    while (cur) {
      path.unshift(this.graph.nodes.get(cur));
      if (cameEdge.has(cur)) edges.unshift(cameEdge.get(cur));
      cur = cameFrom.get(cur);
    }

    let distanceMeters = 0;
    const floorsVisited = [];
    for (let i = 0; i < path.length; i++) {
      const f = path[i].floor;
      if (floorsVisited[floorsVisited.length - 1] !== f) floorsVisited.push(f);
      if (i > 0) {
        const prev = path[i - 1];
        const curr = path[i];
        if (prev.floor === curr.floor) {
          distanceMeters += Math.hypot(curr.x - prev.x, curr.z - prev.z);
        } else {
          distanceMeters += 4.2;
        }
      }
    }

    const steps = this.buildTurnByTurnInstructions(startRoom, destRoom, path, edges);
    const estimatedSeconds = Math.max(15, Math.round(distanceMeters / 1.25));

    return {
      startRoom,
      destRoom,
      mode,
      path,
      edges,
      distanceMeters: Number(distanceMeters.toFixed(1)),
      estimatedSeconds,
      floorsVisited,
      steps,
    };
  }

  buildTurnByTurnInstructions(startRoom, destRoom, path, edges) {
    const steps = [];
    let stepNum = 1;

    steps.push({
      stepNumber: stepNum++,
      floor: startRoom.floor,
      kind: 'start',
      instruction: `Start at ${startRoom.name} (${FLOOR_MAP[startRoom.floor]?.name || `Floor ${startRoom.floor}`}).`,
      node: path[0],
    });

    let i = 0;
    while (i < edges.length) {
      const edge = edges[i];
      const fromNode = path[i];
      const toNode = path[i + 1];

      // Group consecutive vertical transitions (elevator or stairs) into one clean instruction
      if (edge.kind === 'elevator' || edge.kind === 'stairs') {
        const transKind = edge.kind;
        const startFloor = fromNode.floor;
        let j = i;
        while (j < edges.length && edges[j].kind === transKind) {
          j++;
        }
        const exitNode = path[j];
        const endFloor = exitNode.floor;
        const endFloorName = FLOOR_MAP[endFloor]?.name || `Floor ${endFloor}`;
        const direction = exitNode.levelIndex > fromNode.levelIndex ? 'up' : 'down';

        steps.push({
          stepNumber: stepNum++,
          floor: startFloor,
          toFloor: endFloor,
          kind: transKind,
          instruction: transKind === 'elevator'
            ? `Take the elevator ${direction} from Floor ${startFloor} to ${endFloorName}.`
            : `Take the staircase ${direction} from Floor ${startFloor} to ${endFloorName}.`,
          node: fromNode,
          endNode: exitNode,
        });
        i = j;
        continue;
      }

      // Compute turn direction when walking across corridor nodes
      if (edge.kind === 'walk') {
        const dist = Math.hypot(toNode.x - fromNode.x, toNode.z - fromNode.z);
        if (dist >= 0.8) {
          let turnPhrase = 'Walk along';
          if (i > 0 && edges[i - 1].kind === 'walk') {
            const prevNode = path[i - 1];
            const v1x = fromNode.x - prevNode.x;
            const v1z = fromNode.z - prevNode.z;
            const v2x = toNode.x - fromNode.x;
            const v2z = toNode.z - fromNode.z;
            const cross = v1x * v2z - v1z * v2x;
            const dot = v1x * v2x + v1z * v2z;
            const angle = Math.atan2(cross, dot) * (180 / Math.PI);
            if (angle > 35) turnPhrase = 'Turn right toward';
            else if (angle < -35) turnPhrase = 'Turn left toward';
            else turnPhrase = 'Continue straight along';
          } else if (i > 0 && (edges[i - 1].kind === 'elevator' || edges[i - 1].kind === 'stairs')) {
            const exitType = edges[i - 1].kind === 'elevator' ? 'elevator' : 'stairs';
            // Facing +Z when exiting north elevator/stairs
            const v2x = toNode.x - fromNode.x;
            const v2z = toNode.z - fromNode.z;
            if (Math.abs(v2x) > Math.abs(v2z) * 1.1) {
              turnPhrase = v2x < 0 ? `Exit the ${exitType} and turn right toward` : `Exit the ${exitType} and turn left toward`;
            } else {
              turnPhrase = `Exit the ${exitType} and head toward`;
            }
          }

          steps.push({
            stepNumber: stepNum++,
            floor: toNode.floor,
            kind: 'walk',
            instruction: `${turnPhrase} ${toNode.label} (~${Math.round(dist)}m).`,
            node: fromNode,
            endNode: toNode,
          });
        }
      } else if (edge.kind === 'enter' && i === edges.length - 1) {
        steps.push({
          stepNumber: stepNum++,
          floor: destRoom.floor,
          kind: 'arrive',
          instruction: `Enter ${destRoom.name}${destRoom.room && destRoom.room !== '—' ? ` (Room ${destRoom.room})` : ''}.`,
          node: toNode,
        });
      }

      i++;
    }

    if (destRoom.verificationStatus && destRoom.verificationStatus !== 'verified-svg') {
      steps.push({
        stepNumber: stepNum++,
        floor: destRoom.floor,
        kind: 'notice',
        instruction: `Note (${destRoom.verificationStatus.replace(/-/g, ' ')}): ${destRoom.verificationNote || 'Confirm exact door location on site.'}`,
        node: path[path.length - 1],
      });
    }

    return steps;
  }
}
