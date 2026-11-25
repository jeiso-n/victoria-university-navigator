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
| **G** | Ground Floor | `floors/floor-g.html` | `floors/ground-floor.svg` | 20 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Left-side `Main Entrance` near Marketing Office (`[-16, -18, -11, -11.5]`), South-East `Exit` (`[3.5, 22, 8.5, 27]`), Reception (`[-1.8, -18.5, 3.6, -11.0]`), G01–G06, Pharmacy, Stationery, Restrooms |
| **1** | Floor 1 | `floors/floor-1.html` | `floors/floor-1-map.svg` | 35 | 32 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Restrooms |
| **2** | Floor 2 | `floors/floor-2.html` | `floors/floor-2-map.svg` | 39 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, 210, Restrooms |
| **3** | Floor 3 | `floors/floor-3.html` | `floors/floor-3-map.svg` | 19 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | Floor 4 | `floors/floor-4.html` | *None* | 4 | 0 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Department of Pharmacy under active renovation (rendered as explicit construction shell) |
| **5** | Floor 5 | `floors/floor-5.html` | `floors/floor-5-map.svg` | 29 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Restrooms |
| **6** | Floor 6 | `floors/floor-6.html` | `floors/floor-6-map.svg` | 29 | 15 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant, Restrooms |
| **7** | Floor 7 | `floors/floor-7.html` | `floors/floor-7-map.svg` | 43 | 14 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar, Restrooms |
| **8** | Floor 8 | `floors/floor-8.html` | `floors/floor-8-map.svg` | 55 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Restrooms |
| **9** | Floor 9 | `floors/floor-9.html` | `floors/floor-9-map.svg` | 25 | 11 | Dual Purple Elevators + Left DOWN Staircase | Cafeteria (901), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society, Restrooms |

### 1.2 Room & Facility Verification Summary (`AUDIT_SUMMARY`)
- **Completed floors:** `12` (`Basement 2` through `Floor 9`)
- **Floors with SVG plans:** `11` (`B2`–`3`, `5`–`9`)
- **Total rooms/facilities mapped:** `138` (including `Main Entrance`, `Exit`, and `8` SVG-verified `Restroom` facilities across `G`, `1`, `2`, `5`, `6`, `7`, `8`, `9`)
- **Rooms/facilities with SVG-verified 3D positions (`verified-svg`):** `126`
- **Rooms estimated from written directions (`estimated-from-directions`):** `10`
- **Rooms requiring physical verification (`requires-physical-verification`):** `1` (`room-210`)
- **Rooms under renovation (`under-construction`):** `1` (`floor-4-pharmacy`)

---

## 2. Implementation Correction Prompt 3 & Previous Visual Corrections

1. **Ground Floor Main Entrance & Exit Correction (`js/data/building-data.js`, `js/script.js`, `js/3d/floor-generator.js`, `js/3d/building-generator.js`, `js/3d/navigation-graph.js`):**
   - Replaced the old South-East entrance designation (`bounds: [3.5, 22.0, 8.5, 27.0]`, `door: [6.0, 24.5]`) with **`Exit`** (`id: 'ground-exit'`, 3D portal `ground-exit-portal` at `(6.0, 0, 27.0)` labeled `Exit`, connected to corridor node `c-s0`).
   - Created the new Ground Floor **`Main Entrance`** (`id: 'main-entrance'`, `bounds: [-16.0, -18.0, -11.0, -11.5]`, `door: [-11.0, -14.75]`) on the **Left (West) side of the floor near the Marketing Office**, matching the open West entrance bay (`Z ∈ [-21, -9]`) in `floors/ground-floor.svg`.
   - Modeled the physical 3D entrance doorway cutout (`cx: -16.0, cz: -14.75`), 3D canopy + green welcome mat + `Main Entrance` label sprite (`main-entrance-portal` at `(-16.0, 0, -14.75)`), exterior West approach walkway, and walkable corridor node `c-ent (-8.0, -14.75)` connected to Marketing Office (`c-w1 -> c-w2`), Student Support / Elevators (`c-nw`), and Reception (`c-ne`).
2. **Restroom / Toilet / Washroom Search & 3D Pinning (`js/data/building-data.js`, `js/script.js`, `js/3d/floor-generator.js`, `js/3d/navigation-graph.js`, `js/3d/navigation-ui.js`):**
   - Integrated all `8` SVG-verified restroom facilities (`restroom-g`, `restroom-1`, `restroom-2`, `restroom-5`, `restroom-6`, `restroom-7`, `restroom-8`, `restroom-9`) from the green SVG toilet polygons and labels (`MensToilets`, `ladiesToilets`, `Toilets`, `WASH`, `Rest rooms`, `MEN Toilets`, `LadiesToilets`, `Womens Toilets`) into `ENHANCED_ROOM_DB` and `ROOM_DB`.
   - Supported search queries for `Restroom`, `Restrooms`, `Toilet`, `Toilets`, `Washroom`, and `Washrooms`, returning each facility with its full floor name (`Ground Floor`, `Floor 1`, `Floor 2`, `Floor 5`, `Floor 6`, `Floor 7`, `Floor 8`, `Floor 9`), `🚻 Restrooms` 3D label and green floor plate, persistent destination pin, and cross-floor animated route arrows.
3. **Full Floor Label Positioning (`d2.png`) & `Reset View` Visibility (`js/3d/floor-generator.js`, `js/3d/camera-controller.js`):**
   - Repositioned all 12 full floor labels (`Basement 2`, `Basement 1`, `Ground Floor`, `Floor 1`–`Floor 9`) from the occluded back North-West corner `(-18.6, 1.5, -24.0)` to the foreground South-East zone indicated by the green circle and checkmark in `d2.png` (`(19.2, 1.15, 18.5)`).
   - Configured `createFloorBadgeSprite` (`depthTest: false`, `renderOrder: 22`) and tuned `Reset View` camera presets (`flyToFloor` at `(39, y + 32, 50)` looking at `(0, y + 0.5, 1.5)`; `setBuildingOverview` at `(62, 48, 82)` looking at `(0, 13.5, 0)`; `setExplodedOverview` at `(88, 72, 114)` looking at `(0, 27, 0)`) so all relevant floor labels are 100% visible, unclipped, and unoccluded after clicking `Reset View`.
4. **Dedicated `Map View` Camera Preset Matching `map.png` (`js/3d/camera-controller.js`, `js/3d/navigation-ui.js`):**
   - Implemented `CameraController.setMapView(floorCode)` (`pos = (0, y + 88, 5.0)`, `target = (0, y + 0.5, 1.5)`), reproducing the North-up overhead architectural plan framing and subtle vertical perspective shown in `map.png` while keeping floor labels, destination pins, and animated route arrows clearly visible.
   - Separated `Map View` and `Reset View` actions so `Map View` always applies the `map.png` overhead composition and `Reset View` always restores the default 3D perspective preset without clearing the selected destination or route.
5. **Preserved All Prompt 1 & Prompt 2 Features:**
   - Ground Floor Reception in the open lobby (`[-1.8, -18.5, 3.6, -11.0]`), red-marked North-core walls removed, Basement 1 & Basement 2 isolated without overhead ground plaza, dual side-by-side purple elevators, physically attached directional staircases (`Right = UP`, `Left = DOWN`), removal of `VERTICAL TRAVEL` UI and `Cutaway` mode, zero distance measurements in route steps/summaries, persistent destination pins, NFS animated route arrows, Dark Mode contrast fixes, and plain-text `Dark`/`Light` theme toggle.

---

## 3. Verification Results (Run After Final Edit)

### 3.1 Node Architecture, Audit, Search, Restroom, Entrance/Exit & Wall-Collision Suite (`node tests/verify-navigator.mjs`)
- **Result:** `18 passed`, `0 failed` (exit code `0`)
  - All 12 levels & 11 SVG geometry caches valid (`FLOOR_DEFINITIONS`, `SVG_GEOMETRY_CACHE`).
  - Complete `ROOM_DB` ↔ `ENHANCED_ROOM_DB` parity (`138` mapped rooms and facilities).
  - Ground Floor `Main Entrance` verified on the Left side near Marketing Office (`[-16.0, -18.0, -11.0, -11.5]`, `door: [-11.0, -14.75]`) and old position verified as `Exit` (`ground-exit`, `[3.5, 22.0, 8.5, 27.0]`, `door: [6.0, 24.5]`).
  - Searching `Restroom`, `Restrooms`, `Toilet`, `Toilets`, `Washroom`, and `Washrooms` verified to return all `8` SVG-verified restroom facilities with working routes from `Main Entrance`.
  - Dual elevators (`elev-left-*`, `elev-right-*`) and strictly directional staircases (`Right = UP`, `Left = DOWN`), zero distance suffixes, **0 wall crossings** across all corridor spines and `126` `verified-svg` doorways, and 100% reachability across all 138 entries verified.

### 3.2 Headless Chrome WebGL E2E Suite (`node tests/verify-browser-e2e.mjs`)
- **Result:** `8 passed`, `0 failed` (exit code `0`) in headless Chromium (`--headless=new --enable-webgl --use-angle=swiftshader`):
  - Zero console errors, zero uncaught exceptions, zero HTTP 404 errors across desktop (`1280×800`) and mobile (`390×844`) viewports.
  - Verified live 3D `main-entrance-portal` at `(-16, 0, -14.75)` and `ground-exit-portal` at `(6, 0, 27)`.
  - Verified all 12 full floor badges (`Basement 2`..`Floor 9`) at the `d2.png` South-East foreground position (`(19.2, 1.15, 18.5)`) and confirmed their NDC screen projections are strictly inside the viewport after `Reset View` in both `Isolate Floor` and `Full Building` modes.
  - Verified `Map View` camera preset (`camX = 0, camY = 88, camZ = 5`) matching `map.png` and confirmed `Reset View` independently restores default 3D perspective (`camX = 39, camY = 32, camZ = 50`) while preserving the selected destination pin.
  - Verified 3D sidebar search for `Restroom`, `Toilet`, `Toilets`, and `Washroom` (`8` results each), selecting and pinning `Floor 6 Restrooms (Washrooms)` (`restroom-6`), and rendering cross-floor animated route arrows.

---

## 4. Known Limitations & Next Steps

1. **Physical Campus Walkthrough Recommended:** Confirm physical doors and signage for `room-210` (`requires-physical-verification`), the `10` estimated rooms lacking room-number labels in source SVGs, and on-site Floor 4 once renovation finishes and a Floor 4 SVG is authored.
2. **Deployment:** Branch `main` and `feat/3d-indoor-navigator` synchronized and pushed to `origin` (`https://github.com/jeiso-n/victoria-university-navigator.git`) for GitHub Pages deployment.
