#!/usr/bin/env python3
"""
Extracts architectural wall segments, door openings, room/elevator/washroom polygons,
staircase markers, and text labels from all 11 SVG floor plans in `floors/`,
normalizing every floor into a unified Three.js world coordinate system:
  X in [-16.0, +16.0] (32 meters width)
  Z in [-27.0, +27.0] (54 meters depth, North = -27, South = +27)

Generates `js/data/svg-geometry-cache.js` as a static ES module so that both
HTTP(S) deployments and `file://` local usage work without CORS failures.
"""

import json
import math
import os
import re
import xml.etree.ElementTree as ET

FLOOR_SVGS = [
    ("B2", "Basement 2", -2, "floors/basement-2.svg"),
    ("B1", "Basement 1", -1, "floors/basement-1.svg"),
    ("G",  "Ground Floor", 0, "floors/ground-floor.svg"),
    ("1",  "Floor 1", 1, "floors/floor-1-map.svg"),
    ("2",  "Floor 2", 2, "floors/floor-2-map.svg"),
    ("3",  "Floor 3", 3, "floors/floor-3-map.svg"),
    ("5",  "Floor 5", 5, "floors/floor-5-map.svg"),
    ("6",  "Floor 6", 6, "floors/floor-6-map.svg"),
    ("7",  "Floor 7", 7, "floors/floor-7-map.svg"),
    ("8",  "Floor 8", 8, "floors/floor-8-map.svg"),
    ("9",  "Floor 9", 9, "floors/floor-9-map.svg"),
]

WORLD_HALF_W = 16.0
WORLD_HALF_D = 27.0


def parse_transform(t_str):
    if not t_str:
        return [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    t_str = t_str.strip()
    m = re.match(r"matrix\(([^)]+)\)", t_str)
    if m:
        return [float(x) for x in re.split(r"[\s,]+", m.group(1).strip())]
    m = re.match(r"translate\(([^)]+)\)", t_str)
    if m:
        vals = [float(x) for x in re.split(r"[\s,]+", m.group(1).strip())]
        return [1.0, 0.0, 0.0, 1.0, vals[0], vals[1] if len(vals) > 1 else 0.0]
    return [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]


def mul_mat(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ]


def apply_mat(m, x, y):
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def is_arrow_icon_line(n1, n2, elev_box):
    """Filter out tiny decorative arrow lines drawn inside 'Go up'/'Go Down' icons."""
    dx = abs(n2[0] - n1[0])
    dz = abs(n2[1] - n1[1])
    length = math.hypot(dx, dz)
    is_diag = dx > 0.25 and dz > 0.25 and abs(dx - dz) < length * 0.85
    if length < 2.2 and is_diag:
        return True
    # Tiny vertical arrow stems near elevator
    if length < 2.5 and elev_box:
        ex1, ez1, ex2, ez2 = elev_box
        mx, mz = (n1[0] + n2[0]) / 2, (n1[1] + n2[1]) / 2
        if ex1 - 5.0 <= mx <= ex2 + 5.0 and ez1 - 2.0 <= mz <= ez2 + 6.0 and length < 2.2:
            return True
    return False


def extract_floor(code, name, level_idx, svg_path):
    tree = ET.parse(svg_path)
    root = tree.getroot()
    view_box = root.attrib.get("viewBox", "")

    raw_walls = []
    raw_doors = []
    raw_polys = []
    raw_texts = []

    def walk(el, mat):
        cur_mat = mul_mat(mat, parse_transform(el.attrib.get("transform")))
        tag = el.tag.split("}")[-1]
        if tag == "line":
            p1 = apply_mat(cur_mat, float(el.attrib.get("x1", 0)), float(el.attrib.get("y1", 0)))
            p2 = apply_mat(cur_mat, float(el.attrib.get("x2", 0)), float(el.attrib.get("y2", 0)))
            stroke = el.attrib.get("stroke", "")
            if stroke == "#06c":
                raw_doors.append((p1, p2))
            else:
                raw_walls.append((p1, p2))
        elif tag == "polygon":
            pts = []
            for pair in re.split(r"\s+", el.attrib.get("points", "").strip()):
                if "," in pair:
                    px, py = [float(v) for v in pair.split(",")]
                    pts.append(apply_mat(cur_mat, px, py))
            if pts:
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                fill = el.attrib.get("fill", "")
                raw_polys.append((fill, (min(xs), min(ys), max(xs), max(ys))))
        elif tag == "text":
            content = " ".join("".join(el.itertext()).split())
            tx, ty = 0.0, 0.0
            for child in el:
                if child.tag.split("}")[-1] == "tspan":
                    tx = float(child.attrib.get("x", 0))
                    ty = float(child.attrib.get("y", 0))
                    break
            pos = apply_mat(cur_mat, tx, ty)
            if content:
                raw_texts.append((content, pos))
        for c in el:
            walk(c, cur_mat)

    walk(root, [1.0, 0.0, 0.0, 1.0, 0.0, 0.0])

    xs = [p[0] for seg in raw_walls for p in seg]
    ys = [p[1] for seg in raw_walls for p in seg]
    minx, miny, maxx, maxy = min(xs), min(ys), max(xs), max(ys)
    w, h = maxx - minx, maxy - miny

    def norm_pt(pt):
        nx = ((pt[0] - minx) / w) * (WORLD_HALF_W * 2.0) - WORLD_HALF_W
        nz = ((pt[1] - miny) / h) * (WORLD_HALF_D * 2.0) - WORLD_HALF_D
        return [round(nx, 3), round(nz, 3)]

    elev_boxes = []
    toilet_boxes = []
    room_boxes = []
    seen_boxes = set()

    for fill, (x1, y1, x2, y2) in raw_polys:
        n1 = norm_pt((x1, y1))
        n2 = norm_pt((x2, y2))
        box = [
            round(min(n1[0], n2[0]), 3),
            round(min(n1[1], n2[1]), 3),
            round(max(n1[0], n2[0]), 3),
            round(max(n1[1], n2[1]), 3),
        ]
        key = (fill, tuple(round(v, 1) for v in box))
        if key in seen_boxes:
            continue
        seen_boxes.add(key)
        if "199,125,255" in fill:
            elev_boxes.append(box)
        elif "0,255,16" in fill:
            toilet_boxes.append(box)
        else:
            room_boxes.append(box)

    elev_box = elev_boxes[0] if elev_boxes else None

    walls = []
    seen_walls = set()
    for p1, p2 in raw_walls:
        n1, n2 = norm_pt(p1), norm_pt(p2)
        if math.hypot(n2[0] - n1[0], n2[1] - n1[1]) < 0.25:
            continue
        if is_arrow_icon_line(n1, n2, elev_box):
            continue
        # Canonical ordering for deduplication
        a, b = (n1, n2) if (n1[0], n1[1]) <= (n2[0], n2[1]) else (n2, n1)
        wkey = (round(a[0], 1), round(a[1], 1), round(b[0], 1), round(b[1], 1))
        if wkey in seen_walls:
            continue
        seen_walls.add(wkey)
        walls.append([a[0], a[1], b[0], b[1]])

    doors = []
    for p1, p2 in raw_doors:
        n1, n2 = norm_pt(p1), norm_pt(p2)
        mx = round((n1[0] + n2[0]) / 2.0, 3)
        mz = round((n1[1] + n2[1]) / 2.0, 3)
        length = round(math.hypot(n2[0] - n1[0], n2[1] - n1[1]), 3)
        orient = "V" if abs(n2[0] - n1[0]) < abs(n2[1] - n1[1]) else "H"
        doors.append({
            "x1": n1[0], "z1": n1[1],
            "x2": n2[0], "z2": n2[1],
            "cx": mx, "cz": mz,
            "width": max(length, 1.4),
            "orient": orient,
        })

    labels = []
    for txt, pos in raw_texts:
        np = norm_pt(pos)
        labels.append({"text": txt, "x": np[0], "z": np[1]})

    return {
        "code": code,
        "name": name,
        "levelIndex": level_idx,
        "svgPath": svg_path,
        "viewBox": view_box,
        "rawBounds": [round(minx, 2), round(miny, 2), round(maxx, 2), round(maxy, 2)],
        "worldBounds": [-WORLD_HALF_W, -WORLD_HALF_D, WORLD_HALF_W, WORLD_HALF_D],
        "walls": walls,
        "doors": doors,
        "elevator": elev_box,
        "toilets": toilet_boxes,
        "roomPolygons": room_boxes,
        "labels": labels,
    }


def main():
    os.makedirs("js/data", exist_ok=True)
    result = {}
    for code, name, lvl, path in FLOOR_SVGS:
        data = extract_floor(code, name, lvl, path)
        result[code] = data
        print(
            f"Floor {code:>2}: walls={len(data['walls']):>2}, doors={len(data['doors']):>2}, "
            f"toilets={len(data['toilets'])}, polys={len(data['roomPolygons']):>2}, "
            f"labels={len(data['labels']):>2}, elev={data['elevator']}"
        )

    out_path = "js/data/svg-geometry-cache.js"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// Auto-generated by scripts/extract_svg_data.py from floors/*.svg\n")
        f.write("// Normalized to building world coordinates: X in [-16, 16], Z in [-27, 27]\n")
        f.write("export const SVG_GEOMETRY_CACHE = ")
        json.dump(result, f, indent=2)
        f.write(";\n")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
