# Victoria University 3D Indoor Navigator — Current Report

- **Repository:** `d:\Projects\victoria-university-navigator` (Remote: `https://github.com/jeiso-n/victoria-university-navigator.git`)
- **Active Branch:** `feat/3d-indoor-navigator`
- **Last Updated:** 2026-11-25
- **Objective:** Transform Victoria University Navigator into a unified 2D + 3D indoor navigation product covering all 12 levels (`B2` through `9`) of Market Plaza Tower, Kampala, Uganda, with procedural Three.js building geometry derived from the existing SVG floor plans, shared room database, real multi-floor A* pathfinding, turn-by-turn directions, and seamless 2D/3D mode switching.

---

## 1. Phase 1 Repository Audit Summary

### 1.1 Available Floor Plans & Coordinate Systems
All 11 available SVG floor plans in `floors/` (mirrored in `floor plan SVG_s/`) were inspected and parsed with full affine matrix transformation (`matrix(...)` / `translate(...)`) and normalized into a unified building footprint (`X ∈ [-16, +16]` m, `Z ∈ [-27, +27]` m, `32m × 54m`):

| Floor | HTML Page | SVG Floor Plan | Raw ViewBox | Transformed Wall BBox | Walls | Doors (`#06c`) | Elevator Core | Notes |
|---|---|---|---|---|---:|---:|---|---|
| **B2** | `floors/floor-b2.html` | `floors/basement-2.svg` | `-160 -440 480 660` | `[-120,-400]..[280,180]` | 33 | 13 | North-Center | Labels: B201–B205, Mechanical lab, Music room, Changing/Custome room |
| **B1** | `floors/floor-b1.svg` | `floors/basement-1.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` (via `matrix(-1 0 0 -1 0 20)`) | 25 | 13 | North-Center | Labels: B101, B103–B107, B110–B112, `B118` (typo for B108) |
| **G** | `floors/floor-g.html` | `floors/ground-floor.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 26 | 10 | North-Center | Main Entrance, Reception, G01–G06, Pharmacy, Stationary, MensToilets |
| **1** | `floors/floor-1.html` | `floors/floor-1-map.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 39 | 32 | North-Center | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Mens/Ladies Toilets |
| **2** | `floors/floor-2.html` | `floors/floor-2-map.svg` | `-260 -300 540 580` | `[-220,-260.3]..[240,240]` | 45 | 16 | North-Center | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, Toilets |
| **3** | `floors/floor-3.html` | `floors/floor-3-map.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 27 | 16 | North-Center | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | `floors/floor-4.html` | *None* | — | — | 0 | 0 | North-Center (Core) | Department of Pharmacy under active renovation/outfitting |
| **5** | `floors/floor-5.html` | `floors/floor-5-map.svg` | `0 0 1920 1920` | `[335.8,77.5]..[1516.3,1842.5]` (90° rotated) | 34 | 10 | North-Center | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Toilets, Stairs |
| **6** | `floors/floor-6.html` | `floors/floor-6-map.svg` | `-240 -320 480 680` | `[-200,-280]..[200,320]` | 34 | 15 | North-Center | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant |
| **7** | `floors/floor-7.html` | `floors/floor-7-map.svg` | `-140 -420 560 740` | `[-100,-380]..[380,280]` | 48 | 14 | North-Center | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar, Stairs |
| **8** | `floors/floor-8.html` | `floors/floor-8-map.svg` | `-220 -320 440 660` | `[-180,-280]..[180,300]` | 61 | 16 | North-Center | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Toilets, Stairs |
| **9** | `floors/floor-9.html` | `floors/floor-9-map.svg` | `-200 -280 400 580` | `[-160,-240]..[160,260]` | 29 | 11 | North-Center | Cafeteria (901), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society, Program Admins |

### 1.2 Audit Discrepancies & Items Requiring Physical Verification
1. **Missing Floor 6 rooms in original `ROOM_DB`:** `room-601` through `room-606` existed in `directions.html`, `floors/floor-6.html`, and `floors/floor-6-map.svg`, but were omitted from `ROOM_DB` in `js/script.js`. Fixed in both `js/script.js` and `js/data/building-data.js`.
2. **ID & Anchor inconsistencies in original files:**
   - `ict-lab-1` vs `ICT-Lab-1` vs `room-202` (Floor 2)
   - `boardroom-1..3` listed under Floor 1 in `directions.html` and `ROOM_DB` (also aliased to `207..209` in `ROOM_DB` and `floor-2.html`, while `floor-1-map.svg` explicitly labels `B.Room1`, `B.r2`, `B.r3` and `floor-2-map.svg` labels `207`, `208`).
3. **Unlabelled SVG rooms / locations requiring physical verification:**
   - **B2:** `B206` and `B210` (both share identical directional prose in `directions.html`; mapped to south middle/west cells with `estimated-from-directions`).
   - **B1:** `B102` (unlabelled NW corner cell), `B108` (labeled `B118` in SVG), `B109` (middle-block unlabelled cell), `B112` (present in SVG & dropdown, no photo card in `directions.html`).
   - **G:** `Main Entrance` physical street-facing door position inferred at south lobby (`z = +24.5`) leading north past `Stationary`/`Pharmacy` toward `Reception` (`z = -18`).
   - **Floor 2:** `210 Storage Room` (listed in `ROOM_DB` and `floor-2.html`, no label in SVG or card in `directions.html`; flagged `requires-physical-verification`).
   - **Floor 4:** Entire floor under renovation (`under-construction`, no SVG).
   - **Floor 7:** `7-02` (`Multi studio` cell), `7-05`, `7-06` (SVG shows duplicate `7-03 moot court` labels on west and `7-08` on east while `Law school board &staff` is on west).
   - **Floor 9:** `904` (IT Room), `909` (Meeting Room 1), `910` (Meeting Room 2) mapped to partitioned SVG cells using written directions (`estimated-from-directions`).
   - **Vertical shafts:** Elevators exist at North-Center on every SVG (`B2`–`9`). Staircases (`Go up` / `Go Down`) flank the elevator on `B2`, `G`, `2`, `3`, `5`, `6`, `7`, `8`, `9` (`B1` and `1` do not draw explicit stair arrows on SVG, and `7` & `8` also label south `Stairs`).

---

## 2. Architecture & Status

- **Phase 1 (Complete):** SVG extraction pipeline (`scripts/extract_svg_data.py`), pre-normalized cache (`js/data/svg-geometry-cache.js`), unified data source (`js/data/building-data.js`), `ROOM_DB` fixes in `js/script.js`, and audit report.
- **Phase 2–7 (In Progress):**
  - Vendor Three.js & OrbitControls (`js/vendor/`)
  - Procedural 12-floor building & SVG-to-Three.js engine (`js/3d/`)
  - Multi-floor indoor navigation graph, A* pathfinder, wall-collision validator, route renderer
  - 2D/3D toggle UI, camera controls, mobile layout, automated & Playwright tests.

---

## 3. Verification & Git Status

- **Verified:** `python scripts/extract_svg_data.py` parsed all 11 SVG floor plans cleanly and generated `js/data/svg-geometry-cache.js`.
- **Branch:** `feat/3d-indoor-navigator` (checkpoint in progress).
