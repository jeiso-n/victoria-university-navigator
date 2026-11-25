# Victoria University 3D Indoor Navigator — Current Report

- **Repository:** `d:\Projects\victoria-university-navigator` (Remote: `https://github.com/jeiso-n/victoria-university-navigator.git`)
- **Active Branch:** `main` (synchronized with `feat/3d-indoor-navigator`)
- **Last Updated:** 2026-11-26
- **Objective:** Transform Victoria University Navigator into a unified 2D + 3D indoor navigation product covering all 12 levels (`B2` through `9`) of Market Plaza Tower, Kampala, Uganda, with procedural Three.js building geometry derived from the existing SVG floor plans, shared room/restroom database, dual-elevator + directional staircase circulation core, multi-floor A* pathfinding, turn-by-turn directions, and seamless 2D/3D mode switching.

---

## 1. Repository & Architectural Audit

### 1.1 Available Floor Plans & Coordinate Normalization
All 11 SVG floor plans in `floors/` were parsed with nested SVG affine transformations (`matrix(...)` / `translate(...)`) by `scripts/extract_svg_data.py` and normalized into a shared Three.js world coordinate system (`X ∈ [-16, +16]` m, `Z ∈ [-27, +27]` m, `32m × 54m`, `4.2m` floor-to-floor height):

| Floor | Display Label | HTML Page | SVG Floor Plan | Walls (Clean) | Doors (`#06c`) | Elevator & Stair Core | Notes |
|---|---|---|---|---:|---:|---|---|
| **B2** | Basement 2 | `floors/floor-b2.html` | `floors/basement-2.svg` | 28 | 13 | Dual Purple Elevators + Right UP Staircase | B201–B205, Mechanical lab, Music room, Changing room; B206/B210 estimated |
| **B1** | Basement 1 | `floors/floor-b1.html` | `floors/basement-1.svg` | 20 | 13 | Dual Purple Elevators + Right UP / Left DOWN Stairs | B101, B103–B107, B110–B112, `B118` (SVG typo for B108); B102/B109 estimated |
| **G** | Ground Floor | `floors/floor-g.html` | `floors/ground-floor.svg` | 20 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | `Main Entrance` between Marketing Office & Ground Floor Pharmacy (`[-10, 22, -6, 27]`, door `[-8, 24.5]`), South-East `Exit` (`[3.5, 22, 8.5, 27]`, door `[6, 24.5]`), Reception (`[-1.8, -18.5, 3.6, -11.0]`), G01–G06, Pharmacy, Stationery, Restrooms |
| **1** | Floor 1 | `floors/floor-1.html` | `floors/floor-1-map.svg` | 35 | 32 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Restrooms |
| **2** | Floor 2 | `floors/floor-2.html` | `floors/floor-2-map.svg` | 39 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, 210, Restrooms |
| **3** | Floor 3 | `floors/floor-3.html` | `floors/floor-3-map.svg` | 19 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | Floor 4 | `floors/floor-4.html` | *None* | 4 | 0 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Department of Pharmacy under active renovation (rendered as explicit construction shell) |
| **5** | Floor 5 | `floors/floor-5.html` | `floors/floor-5-map.svg` | 29 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Restrooms |
| **6** | Floor 6 | `floors/floor-6.html` | `floors/floor-6-map.svg` | 29 | 15 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant, Restrooms |
| **7** | Floor 7 | `floors/floor-7.html` | `floors/floor-7-map.svg` | 43 | 14 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar, Restrooms |
| **8** | Floor 8 | `floors/floor-8.html` | `floors/floor-8-map.svg` | 55 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Restrooms |
| **9** | Floor 9 | `floors/floor-9.html` | `floors/floor-9-map.svg` | 25 | 11 | Dual Purple Elevators + Left DOWN Staircase | L-shaped Cafeteria (901: `[-16, -27, -10, -9.72]` + `[-16, -9.72, 5.88, -1.08]`, door `[-10, -21.53]`), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society, Restrooms |

### 1.2 Room & Facility Verification Summary (`AUDIT_SUMMARY`)
- **Completed floors:** `12` (`Basement 2` through `Floor 9`)
- **Floors with SVG plans:** `11` (`B2`–`3`, `5`–`9`)
- **Total rooms/facilities mapped:** `138` (including `Main Entrance`, `Exit`, and `8` SVG-verified `Restroom` facilities across `G`, `1`, `2`, `5`, `6`, `7`, `8`, `9`)
- **Rooms/facilities with SVG-verified 3D positions (`verified-svg`):** `126`
- **Rooms estimated from written directions (`estimated-from-directions`):** `10`
- **Rooms requiring physical verification (`requires-physical-verification`):** `1` (`room-210`)
- **Rooms under renovation (`under-construction`):** `1` (`floor-4-pharmacy`)

---

## 2. Implementation Correction Prompt 4 & Cumulative Visual Corrections

1. **Exact Ground Floor `Main Entrance` Between Marketing Office and Ground Floor Pharmacy (`js/data/building-data.js`, `js/3d/floor-generator.js`, `js/3d/building-generator.js`, `js/3d/navigation-graph.js`):**
   - Positioned `main-entrance` (`Main Entrance`) strictly **between the Marketing Office (`[-16.0, -9.0, -10.0, 27.0]`) and the Ground Floor Pharmacy (`[-6.0, 19.0, 2.0, 27.0]`)** at `bounds: [-10.0, 22.0, -6.0, 27.0]`, `door: [-8.0, 24.5]`.
   - Split the Ground Floor South exterior wall at `{ cx: -8.0, cz: 27.0, width: 4.0, orient: 'H' }` (`Main Entrance`) and `{ cx: 6.0, cz: 27.0, width: 4.5, orient: 'H' }` (`Exit`), and placed `main-entrance-portal` (canopy, green welcome mat, `Main Entrance` label sprite, and approach walkway) at `(-8.0, 0, 27.0)` while preserving `ground-exit-portal` (`Exit`) at `(6.0, 0, 27.0)`.
   - Connected `main-entrance` directly to the walkable West corridor node `c-w3 (-8.0, 24.5)` leading past Marketing Office (`c-w2`) to Reception (`c-ne`) and the elevators/staircases.
2. **Complete Destination Cancellation & Route Clearing (`js/3d/navigation-ui.js`, `js/3d/scene-manager.js`, `js/3d/room-manager.js`, `js/script.js`, `css/style.css`):**
   - Added `NavigatorController.cancelDestination()` and `SceneManager.clearSelectionAndRoute()`, wired to `#vu3d-btn-cancel-dest` (`✕ Clear Destination` in the selected destination card), `#vu3d-clear-route` (`Cancel Navigation` in the Turn-by-Turn Route header), `#vu3d-bottom-cancel` (`✕ Cancel` in the bottom bar), and `✕ Clear Selection` on highlighted 2D cards (`window.__VU_CLEAR_2D_SELECTION__`).
   - Cancelling clears `selectedRoom`, `currentRoute`, `activeStepIdx`, walkthrough timer, 3D destination beacon pin, pulsing floor ring, glowing room outline box, room mesh emissive highlight, 3D route tubes/arrows/markers, search inputs/dropdowns, `.in-route` and `.has-pinned-dest` floor pill indicators, and restores `#vu3d-selected-card` to the default browsing state while preserving the active floor, camera view, and theme preference.
3. **Floor 9 Cafeteria Complete L-Shaped Area & Entrance Doorway Routing (`cafe.png`) (`js/data/building-data.js`, `js/3d/floor-generator.js`, `js/3d/room-manager.js`, `js/3d/navigation-graph.js`, `js/3d/pathfinder.js`, `js/script.js`):**
   - Modeled the complete L-shaped Cafeteria footprint via `subBounds: [[-16.0, -27.0, -10.0, -9.72], [-16.0, -9.72, 5.88, -1.08]]`, covering the entire green-annotated North-West wing (`[-16, -27, -10, -9.72]`) and main dining hall (`[-16, -9.72, 5.88, -1.08]`) with companion 3D floor meshes and glowing selection outlines while preserving the adjoining open lobby/corridor (`[-10, -23.2, 6, -9.72]`).
   - Set `cafeteria.door` to the actual SVG glass doorway `[-10.0, -21.53]` (`{ cx: -10.0, cz: -21.528, width: 2.016, orient: 'V' }`) and anchored `cafeteria.pinPos` immediately at the entrance threshold `[-10.35, -21.53]`.
   - Updated `NavigationGraph` and `IndoorPathfinder` so routes to the Cafeteria walk West from the Floor 9 elevator/stairs along `c-w0 (-8.2, -21.53)` straight to the glass entrance door `(-10.0, -21.53)` and end with `"Enter through the Cafeteria entrance door (Room 901)."` without crossing walls or terminating in the middle of the cafeteria.
   - Added accent-insensitive search support for `Cafeteria`, `Cafe`, `Café`, and `Canteen` in both 2D and 3D search.
4. **Standard `Reset View` Camera Composition Matching `h1.png` Across All 12 Floors (`js/3d/camera-controller.js`, `js/3d/navigation-ui.js`):**
   - Implemented `CameraController.getStandardFloorPose(floorCode)` and `resetFloorView(floorCode)`, dynamically computing the `h1.png` angled isometric overview (`pos = (cx + 35*s, y + 31*s, cz + 44*s)`, `target = (cx, y + 0.5, cz + 0.5)`) from each floor's actual geometry bounds and viewport aspect ratio.
   - Kept `Map View` (`setMapView(floorCode)` matching `map.png`) and `Reset View` (`resetFloorView(floorCode)` matching `h1.png`) as distinct, independent camera presets that preserve active destination pins, routes, and visible full floor labels (`d2.png`).

---

## 3. Verification Results (Run After Final Edit)

### 3.1 Node Architecture, Audit, Search, Cafeteria, Restroom, Entrance/Exit & Wall-Collision Suite (`node tests/verify-navigator.mjs`)
- **Result:** `19 passed`, `0 failed` (exit code `0`)
  - All 12 levels & 11 SVG geometry caches valid (`FLOOR_DEFINITIONS`, `SVG_GEOMETRY_CACHE`).
  - Complete `ROOM_DB` ↔ `ENHANCED_ROOM_DB` parity (`138` mapped rooms and facilities).
  - Ground Floor `Main Entrance` verified between Marketing Office (`xMax = -10.0`) and Ground Floor Pharmacy (`xMin = -6.0`) at `[-10.0, 22.0, -6.0, 27.0]`, `door: [-8.0, 24.5]`, and old entrance verified as `Exit` (`[3.5, 22.0, 8.5, 27.0]`, `door: [6.0, 24.5]`).
  - Floor 9 `Cafeteria` verified with L-shaped `subBounds`, doorway `[-10.0, -21.53]`, pin anchor `[-10.35, -21.53]`, aliases (`Cafeteria`, `Cafe`, `Café`, `Canteen`), and doorway-targeted routes from multiple starting points.
  - Searching `Restroom`, `Restrooms`, `Toilet`, `Toilets`, `Washroom`, and `Washrooms` verified to return all `8` SVG-verified restroom facilities.
  - Dual elevators, strictly directional staircases (`Right = UP`, `Left = DOWN`), zero distance suffixes, **0 wall crossings** across all corridor spines and `126` `verified-svg` doorways, and 100% reachability verified.

### 3.2 Headless Chrome WebGL E2E Suite (`node tests/verify-browser-e2e.mjs`)
- **Result:** `8 passed`, `0 failed` (exit code `0`) in headless Chromium (`--headless=new --enable-webgl --use-angle=swiftshader`):
  - Zero console errors, zero uncaught exceptions, zero HTTP 404 errors across desktop (`1280×800`) and mobile (`390×844`) viewports.
  - Verified live 3D `main-entrance-portal` at `(-8, 0, 27)` (between Marketing Office and Ground Floor Pharmacy) and `ground-exit-portal` at `(6, 0, 27)`.
  - Verified Floor 9 `Cafeteria` search (`Cafeteria`, `Cafe`, `Café`, `Canteen`), 2 companion L-shaped floor meshes, beacon pin anchored at `(-10.35, -21.53)`, route arrows leading to `(-10.0, -21.53)`, and `h1.png` `Reset View` camera composition (`camX = 35, camY = 31, camZ = 44`).
  - Verified complete destination cancellation (`#vu3d-btn-cancel-dest`) clears `selectedRoom`, `currentRoute`, 3D pin, route arrows, and directions panels while preserving `activeFloor` and allowing immediate selection of a new destination without page reload.

---

## 4. Known Limitations & Next Steps

1. **Physical Campus Walkthrough Recommended:** Confirm physical doors and signage for `room-210` (`requires-physical-verification`), the `10` estimated rooms lacking room-number labels in source SVGs, and on-site Floor 4 once renovation finishes and a Floor 4 SVG is authored.
2. **Deployment:** Branch `main` and `feat/3d-indoor-navigator` synchronized and pushed to `origin` (`https://github.com/jeiso-n/victoria-university-navigator.git`) for GitHub Pages deployment.
