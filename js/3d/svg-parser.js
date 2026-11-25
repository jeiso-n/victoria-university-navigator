// Live SVG parser + fallback to pre-extracted SVG_GEOMETRY_CACHE.
// Parses floors/*.svg via DOMParser when running on HTTP(S), normalizing
// all <line>, <polygon>, and <text> elements through cumulative affine matrices
// into building coordinates X in [-16, +16], Z in [-27, +27].

import { SVG_GEOMETRY_CACHE } from '../data/svg-geometry-cache.js';
import { BUILDING_WIDTH, BUILDING_DEPTH } from '../data/building-data.js';

const HALF_W = BUILDING_WIDTH / 2;
const HALF_D = BUILDING_DEPTH / 2;

function parseTransform(tStr) {
  if (!tStr) return [1, 0, 0, 1, 0, 0];
  const s = tStr.trim();
  const mMat = s.match(/^matrix\(([^)]+)\)/);
  if (mMat) {
    const vals = mMat[1].trim().split(/[\s,]+/).map(Number);
    if (vals.length === 6 && vals.every(Number.isFinite)) return vals;
  }
  const mTrans = s.match(/^translate\(([^)]+)\)/);
  if (mTrans) {
    const vals = mTrans[1].trim().split(/[\s,]+/).map(Number);
    return [1, 0, 0, 1, vals[0] || 0, vals[1] || 0];
  }
  return [1, 0, 0, 1, 0, 0];
}

function mulMat(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMat(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const NORTH_CORE_CLEAR_ZONES = {
  B2: [-7.2, -27.1, 7.2, -17.4],
  B1: [-4.8, -27.1, 4.5, -20.5],
  G:  [-7.4, -27.1, 3.3, -20.5],
  1:  [-6.5, -27.1, 0.6, -20.5],
  2:  [-5.0, -27.1, 3.6, -18.0],
  3:  [-9.9, -27.1, 9.9, -20.5],
  5:  [-8.6, -27.1, 8.6, -20.2],
  6:  [-4.0, -27.1, 5.8, -21.8],
  7:  [-4.6, -27.1, 6.2, -20.0],
  8:  [-7.5, -27.1, 5.8, -21.0],
  9:  [-5.8, -27.1, 6.3, -22.0],
};

function isNorthCoreCirculationObstacle(n1, n2, elevBox, floorCode) {
  const dx = Math.abs(n2[0] - n1[0]);
  const dz = Math.abs(n2[1] - n1[1]);
  const len = Math.hypot(dx, dz);
  const isDiag = dx > 0.25 && dz > 0.25 && Math.abs(dx - dz) < len * 0.85;
  if (len < 2.2 && isDiag) return true;
  // Preserve exterior North perimeter wall along Z ≈ -27
  if (Math.abs(n1[1] - (-27.0)) < 0.35 && Math.abs(n2[1] - (-27.0)) < 0.35) {
    return false;
  }
  if (len < 2.5 && elevBox) {
    const [ex1, ez1, ex2, ez2] = elevBox;
    const mx = (n1[0] + n2[0]) / 2;
    const mz = (n1[1] + n2[1]) / 2;
    if (ex1 - 5 <= mx && mx <= ex2 + 5 && ez1 - 2 <= mz && mz <= ez2 + 6 && len < 2.2) {
      return true;
    }
  }
  const zone = NORTH_CORE_CLEAR_ZONES[floorCode];
  if (zone) {
    const [zx1, zz1, zx2, zz2] = zone;
    if (
      n1[0] >= zx1 && n1[0] <= zx2 && n2[0] >= zx1 && n2[0] <= zx2 &&
      n1[1] >= zz1 && n1[1] <= zz2 && n2[1] >= zz1 && n2[1] <= zz2
    ) {
      return true;
    }
  }
  if (floorCode === '3' && Math.abs(n1[1] - (-21.0)) < 0.3 && Math.abs(n2[1] - (-21.0)) < 0.3) {
    const minX = Math.min(n1[0], n2[0]);
    const maxX = Math.max(n1[0], n2[0]);
    if ((minX >= -10.05 && maxX <= -5.95) || (minX >= 5.95 && maxX <= 10.05)) {
      return true;
    }
  }
  return false;
}

export function parseSvgXmlToNormalizedGeometry(svgXml, floorDef) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') {
    throw new Error(`Invalid SVG XML for floor ${floorDef.code}`);
  }

  const rawWalls = [];
  const rawDoors = [];
  const rawPolys = [];
  const rawTexts = [];

  function walk(el, mat) {
    const curMat = mulMat(mat, parseTransform(el.getAttribute('transform')));
    const tag = el.localName || el.nodeName;
    if (tag === 'line') {
      const p1 = applyMat(curMat, parseFloat(el.getAttribute('x1') || '0'), parseFloat(el.getAttribute('y1') || '0'));
      const p2 = applyMat(curMat, parseFloat(el.getAttribute('x2') || '0'), parseFloat(el.getAttribute('y2') || '0'));
      const stroke = el.getAttribute('stroke') || '';
      if (stroke === '#06c') {
        rawDoors.push([p1, p2]);
      } else {
        rawWalls.push([p1, p2]);
      }
    } else if (tag === 'polygon') {
      const ptsStr = (el.getAttribute('points') || '').trim();
      const pts = [];
      for (const pair of ptsStr.split(/\s+/)) {
        if (pair.includes(',')) {
          const [px, py] = pair.split(',').map(Number);
          pts.push(applyMat(curMat, px, py));
        }
      }
      if (pts.length) {
        const xs = pts.map(p => p[0]);
        const ys = pts.map(p => p[1]);
        rawPolys.push({
          fill: el.getAttribute('fill') || '',
          box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        });
      }
    } else if (tag === 'text') {
      const content = (el.textContent || '').replace(/\s+/g, ' ').trim();
      let tx = 0;
      let ty = 0;
      for (const child of el.children) {
        if ((child.localName || child.nodeName) === 'tspan') {
          tx = parseFloat(child.getAttribute('x') || '0');
          ty = parseFloat(child.getAttribute('y') || '0');
          break;
        }
      }
      const pos = applyMat(curMat, tx, ty);
      if (content) rawTexts.push({ text: content, pos });
    }
    for (const child of el.children) {
      walk(child, curMat);
    }
  }

  walk(root, [1, 0, 0, 1, 0, 0]);

  const xs = rawWalls.flatMap(s => [s[0][0], s[1][0]]);
  const ys = rawWalls.flatMap(s => [s[0][1], s[1][1]]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  const normPt = ([x, y]) => [
    Number((((x - minX) / w) * (HALF_W * 2) - HALF_W).toFixed(3)),
    Number((((y - minY) / h) * (HALF_D * 2) - HALF_D).toFixed(3)),
  ];

  const elevBoxes = [];
  const toiletBoxes = [];
  const roomPolygons = [];
  const seenBoxes = new Set();

  for (const p of rawPolys) {
    const n1 = normPt([p.box[0], p.box[1]]);
    const n2 = normPt([p.box[2], p.box[3]]);
    const box = [
      Math.min(n1[0], n2[0]),
      Math.min(n1[1], n2[1]),
      Math.max(n1[0], n2[0]),
      Math.max(n1[1], n2[1]),
    ];
    const key = `${p.fill}|${box.map(v => v.toFixed(1)).join(',')}`;
    if (seenBoxes.has(key)) continue;
    seenBoxes.add(key);
    if (p.fill.includes('199,125,255')) elevBoxes.push(box);
    else if (p.fill.includes('0,255,16')) toiletBoxes.push(box);
    else roomPolygons.push(box);
  }

  const elevBox = elevBoxes[0] || null;
  const walls = [];
  const seenWalls = new Set();
  for (const [p1, p2] of rawWalls) {
    const n1 = normPt(p1);
    const n2 = normPt(p2);
    if (Math.hypot(n2[0] - n1[0], n2[1] - n1[1]) < 0.25) continue;
    if (isNorthCoreCirculationObstacle(n1, n2, elevBox, floorDef.code)) continue;
    const [a, b] = n1[0] < n2[0] || (n1[0] === n2[0] && n1[1] <= n2[1]) ? [n1, n2] : [n2, n1];
    const wkey = [a[0], a[1], b[0], b[1]].map(v => v.toFixed(1)).join(',');
    if (seenWalls.has(wkey)) continue;
    seenWalls.add(wkey);
    walls.push([a[0], a[1], b[0], b[1]]);
  }

  const doors = rawDoors.map(([p1, p2]) => {
    const n1 = normPt(p1);
    const n2 = normPt(p2);
    const len = Math.hypot(n2[0] - n1[0], n2[1] - n1[1]);
    return {
      x1: n1[0], z1: n1[1],
      x2: n2[0], z2: n2[1],
      cx: Number(((n1[0] + n2[0]) / 2).toFixed(3)),
      cz: Number(((n1[1] + n2[1]) / 2).toFixed(3)),
      width: Number(Math.max(len, 1.4).toFixed(3)),
      orient: Math.abs(n2[0] - n1[0]) < Math.abs(n2[1] - n1[1]) ? 'V' : 'H',
    };
  });

  const labels = rawTexts.map(({ text, pos }) => {
    const [x, z] = normPt(pos);
    return { text, x, z };
  });

  return {
    code: floorDef.code,
    name: floorDef.name,
    levelIndex: floorDef.levelIndex,
    svgPath: floorDef.svgPath,
    walls,
    doors,
    elevator: elevBox,
    toilets: toiletBoxes,
    roomPolygons,
    labels,
  };
}

/**
 * Loads normalized floor geometry for a floor definition.
 * Uses live SVG fetch + DOMParser when possible, falling back cleanly
 * to the pre-parsed SVG_GEOMETRY_CACHE when offline or on file:// URLs.
 */
export async function loadFloorGeometry(floorDef, basePath = '.') {
  if (!floorDef.hasSvg || !floorDef.svgPath) {
    // Floor 4 (under construction): perimeter shell + elevator/stair core
    return {
      code: floorDef.code,
      name: floorDef.name,
      levelIndex: floorDef.levelIndex,
      svgPath: null,
      isUnderConstruction: true,
      walls: [
        [-HALF_W, -HALF_D, HALF_W, -HALF_D],
        [HALF_W, -HALF_D, HALF_W, HALF_D],
        [-HALF_W, HALF_D, HALF_W, HALF_D],
        [-HALF_W, -HALF_D, -HALF_W, HALF_D],
      ],
      doors: [],
      elevator: [-4.0, -25.0, 4.0, -21.0],
      toilets: [],
      roomPolygons: [],
      labels: [{ text: 'Department of Pharmacy (Under Renovation)', x: 0, z: 2 }],
    };
  }

  // Try live SVG fetch on HTTP/HTTPS, fallback to cache
  if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
    try {
      const cleanBase = basePath.replace(/\/$/, '');
      const res = await fetch(`${cleanBase}/${floorDef.svgPath}`);
      if (res.ok) {
        const xml = await res.text();
        return parseSvgXmlToNormalizedGeometry(xml, floorDef);
      }
    } catch (_) {
      // Fallback to cache below
    }
  }

  return SVG_GEOMETRY_CACHE[floorDef.code] || null;
}
