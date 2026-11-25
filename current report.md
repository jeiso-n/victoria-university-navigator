# Victoria University 3D Indoor Navigator — Current Report

- **Repository:** `d:\Projects\victoria-university-navigator` (Remote: `https://github.com/jeiso-n/victoria-university-navigator.git`)
- **Active Branch:** `feat/3d-indoor-navigator`
- **Last Updated:** 2026-11-25
- **Objective:** Transform Victoria University Navigator into a unified 2D + 3D indoor navigation product covering all 12 levels (`B2` through `9`) of Market Plaza Tower, Kampala, Uganda, with procedural Three.js building geometry derived from the existing SVG floor plans, shared room database, multi-floor A* pathfinding, turn-by-turn directions, and seamless 2D/3D mode switching.

---

## 1. Repository & Architectural Audit

### 1.1 Available Floor Plans & Coordinate Normalization
All 11 SVG floor plans in `floors/` were parsed with nested SVG affine transformations (`matrix(...)` / `translate(...)`) by `scripts/extract_svg_data.py` and normalized into a shared Three.js world coordinate system (`X ∈ [-16, +16]` m, `Z ∈ [-27, +27]` m, `32m × 54m`, `4.2m` floor-to-floor height):

| Floor | Display Label | HTML Page | SVG Floor Plan | Walls (Clean) | Doors (`#06c`) | Elevator Core | Notes |
|---|---|---|---|---:|---:|---|---|
| **B2** | Basement 2 | `floors/floor-b2.html` | `floors/basement-2.svg` | 28 | 13 | North-Center (Purple) | B201–B205, Mechanical lab, Music room, Changing room; B206/B210 estimated |
| **B1** | Basement 1 | `floors/floor-b1.html` | `floors/basement-1.svg` | 20 | 13 | North-Center (Purple) | B101, B103–B107, B110–B112, `B118` (SVG typo for B108); B102/B109 estimated |
| **G** | Ground Floor | `floors/floor-g.html` | `floors/ground-floor.svg` | 20 | 10 | North-Center (Purple) | Main Entrance foyer, Reception (open lobby `[-1.8, -18.5, 3.6, -11.0]`), G01–G06, Pharmacy, Stationery, Toilets |
| **1** | Floor 1 | `floors/floor-1.html` | `floors/floor-1-map.svg` | 35 | 32 | North-Center (Purple) | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Toilets |
| **2** | Floor 2 | `floors/floor-2.html` | `floors/floor-2-map.svg` | 39 | 16 | North-Center (Purple) | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, 210, Toilets |
| **3** | Floor 3 | `floors/floor-3.html` | `floors/floor-3-map.svg` | 19 | 16 | North-Center (Purple) | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | Floor 4 | `floors/floor-4.html` | *None* | 4 | 0 | North-Center (Purple) | Department of Pharmacy under active renovation (rendered as explicit construction shell) |
| **5** | Floor 5 | `floors/floor-5.html` | `floors/floor-5-map.svg` | 29 | 10 | North-Center (Purple) | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Toilets |
| **6** | Floor 6 | `floors/floor-6.html` | `floors/floor-6-map.svg` | 29 | 15 | North-Center (Purple) | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant |
| **7** | Floor 7 | `floors/floor-7.html` | `floors/floor-7-map.svg` | 43 | 14 | North-Center (Purple) | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar |
| **8** | Floor 8 | `floors/floor-8.html` | `floors/floor-8-map.svg` | 55 | 16 | North-Center (Purple) | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Toilets |
| **9** | Floor 9 | `floors/floor-9.html` | `floors/floor-9-map.svg` | 25 | 11 | North-Center (Purple) | Cafeteria (901), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society |

### 1.2 Room Verification Summary (`AUDIT_SUMMARY`)
- **Completed floors:** `12` (`Basement 2` through `Floor 9`)
- **Floors with SVG plans:** `11` (`B2`–`3`, `5`–`9`)
- **Total rooms/facilities mapped:** `129`
- **Rooms with SVG-verified 3D positions (`verified-svg`):** `116`
- **Rooms estimated from written directions (`estimated-from-directions`):** `11`
- **Rooms requiring physical verification (`requires-physical-verification`):** `1` (`room-210`)
- **Rooms under renovation (`under-construction`):** `1` (`floor-4-pharmacy`)

---

## 2. Critical Visual Corrections & Addendum Changes Applied

1. **Ground Floor Reception & Core Obstruction Fix (`pic1.png`):**
   - Relocated `reception` in `js/data/building-data.js` from `[4.0, -21.0, 10.0, -11.0]` to the open lobby (`bounds: [-1.8, -18.5, 3.6, -11.0]`, `door: [-1.8, -14.75]`).
   - Added `NORTH_CORE_CLEAR_ZONES` / `isNorthCoreCirculationObstacle` to both `scripts/extract_svg_data.py` and `js/3d/svg-parser.js` and regenerated `js/data/svg-geometry-cache.js`, removing the spurious vertical arrow walls (`[-6.706, -25.285, -6.706, -21.026]` and `[2.694, -25.285, 2.694, -21.026]`) and obstructive elevator/stair enclosure walls from both Three.js geometry and A* collision checks.
   - Re-aligned `FLOOR_CORRIDOR_LAYOUTS['G']` node `c-ne` to `(-1.8, -14.75)` in `js/3d/navigation-graph.js`.
2. **Basement 2 & Basement 1 Visibility Fix (`pic2.png`):**
   - Grouped the outdoor ground plane and entrance walkway into `groundPlazaGroup` in `js/3d/building-generator.js` and hid it whenever `mode === 'isolated'`, `mode === 'exploded'`, or `mode === 'cutaway'` with `activeLevel < 0`.
   - Hid `verticalCoreGroup` during `isolated` and `cutaway` modes so floating upper stair flights do not protrude above isolated/cut floors, while tuning `CameraController.flyToFloor` (`js/3d/camera-controller.js`) for centered framing.
3. **Persistent Destination Pin Across Floor Changes:**
   - Updated `RoomManager` (`js/3d/room-manager.js`) and `NavigatorController` (`js/3d/navigation-ui.js`) so changing floors or view modes preserves `selectedRoomId` and anchors the 3D beacon pin to the destination's exact world coordinates, toggling `highlightGroup.visible` with destination floor visibility and displaying a `"📍 Pinned on <Floor>"` quick-jump banner in the sidebar and pin badge on the right floor rail.
4. **Need for Speed Underground-Inspired Animated Directional Arrows:**
   - Enhanced `RouteRenderer` (`js/3d/route-renderer.js`) to generate sequential 3D extruded chevron arrows along walkable path segments and vertical elevator/stair transitions (`emissiveIntensity`, `opacity`, and `scale` animated as a smooth forward-propagating wave), auto-filtering by visible floor and displaying vertical transition badges (`Elevators ↑` / `Stairs ↑`).
5. **Distinctive Purple Elevator Cores & Accessible Staircases:**
   - Upgraded `buildFloorGroup` (`js/3d/floor-generator.js`) on all 12 levels with dedicated purple elevator cores (purple platform, glowing trim, translucent purple shaft walls, parted double purple elevator doors, and `🛗 Elevators` label) flanked by accessible per-floor West and East staircases with open corridor approaches.
6. **Complete Light & Dark Mode:**
   - Added persistent theme state (`vu_theme_v1` in `localStorage`) with header `#vu-theme-toggle` and 3D topbar `#vu3d-theme-toggle`, complete dark palette rules in `css/style.css`, and synchronized Three.js scene background, fog, floor slabs, walls, and ground plaza in `SceneManager.setTheme` (`js/3d/scene-manager.js`), `BuildingGenerator.setTheme`, and `applyFloorTheme`.
7. **Full Human-Readable Floor Labels Everywhere:**
   - Added `FLOOR_DISPLAY_LABELS` and `formatFloorLabel()` in `js/data/building-data.js` and applied full names (`Basement 2`, `Basement 1`, `Ground Floor`, `Floor 1`–`Floor 9`) across 2D search (`js/script.js`), 3D search, right floor rail, floor stepper (`↓ Down` / `↑ Up`), bottom bar, route instructions (`js/3d/pathfinder.js`), and 3D badges/tooltips.

---

## 3. Verification Results (Run After Final Edit)

### 3.1 Node Architecture, Audit, Search & Wall-Collision Suite (`node tests/verify-navigator.mjs`)
- **Result:** `14 passed`, `0 failed` (exit code `0`)
  - All 12 levels & 11 SVG geometry caches valid (`FLOOR_DEFINITIONS`, `SVG_GEOMETRY_CACHE`).
  - Complete `ROOM_DB` ↔ `ENHANCED_ROOM_DB` parity (129 mapped rooms).
  - Ground Floor Reception relocated to open lobby (`[-1.8, -18.5, 3.6, -11.0]`) and red-circled walls verified absent.
  - Full human-readable floor labels verified across all 12 levels and generated directions.
  - **0 wall crossings** on corridor spines and across all `116` `verified-svg` room doorway/entry edges.
  - 100% reachability of all 128 destinations from `main-entrance` via both Elevator and Stairs, plus Floor 4 renovation notice.

### 3.2 Headless Chrome WebGL E2E Suite (`node tests/verify-browser-e2e.mjs`)
- **Result:** `8 passed`, `0 failed` (exit code `0`) in headless Chromium (`--headless=new --enable-webgl --use-angle=swiftshader`):
  - Zero console errors, zero uncaught exceptions, zero HTTP 404 errors across desktop (`1280×800`) and mobile (`390×844`) viewports.
  - Ground Floor Reception relocation, 12 purple elevator cores, Basement 2 & Basement 1 isolation with `groundPlazaGroup.visible === false`, and Isolate Floor across all 12 levels (`B2`–`9`) verified live in WebGL.
  - Persistent destination pin on `room-305`, cross-floor `"Pinned on Floor 3"` banner when viewing Basement 1, pin restoration upon returning to Floor 3, NFS-style animated chevron wave updates, vertical mode switching (`elevator`/`stairs`), Dark Mode + Light Mode persistence (`localStorage`), full floor label checks, `2D MAP` switch-back, mobile drawers/CTAs, and graceful WebGL-disabled fallback all verified cleanly.

---

## 4. Known Limitations & Next Steps

1. **Physical Campus Walkthrough Recommended:** Confirm physical doors and signage for `room-210` (`requires-physical-verification`), the `11` estimated rooms lacking room-number labels in source SVGs, and on-site Floor 4 once renovation finishes and a Floor 4 SVG is authored.
2. **Deployment:** Branch `feat/3d-indoor-navigator` pushed to `origin` and fast-forward/merged into `main` to trigger GitHub Pages deployment (`.github/workflows/deploy-pages.yml`). Theme toggle displays plain text (`Dark` / `Light`) without emojis.
