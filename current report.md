# Victoria University 3D Indoor Navigator — Current Report

- **Repository:** `d:\Projects\victoria-university-navigator` (Remote: `https://github.com/jeiso-n/victoria-university-navigator.git`)
- **Active Branch:** `main` (synchronized with `feat/3d-indoor-navigator`)
- **Last Updated:** 2026-11-25
- **Objective:** Transform Victoria University Navigator into a unified 2D + 3D indoor navigation product covering all 12 levels (`B2` through `9`) of Market Plaza Tower, Kampala, Uganda, with procedural Three.js building geometry derived from the existing SVG floor plans, shared room database, dual-elevator + directional staircase circulation core, multi-floor A* pathfinding, turn-by-turn directions, and seamless 2D/3D mode switching.

---

## 1. Repository & Architectural Audit

### 1.1 Available Floor Plans & Coordinate Normalization
All 11 SVG floor plans in `floors/` were parsed with nested SVG affine transformations (`matrix(...)` / `translate(...)`) by `scripts/extract_svg_data.py` and normalized into a shared Three.js world coordinate system (`X ∈ [-16, +16]` m, `Z ∈ [-27, +27]` m, `32m × 54m`, `4.2m` floor-to-floor height):

| Floor | Display Label | HTML Page | SVG Floor Plan | Walls (Clean) | Doors (`#06c`) | Elevator & Stair Core | Notes |
|---|---|---|---|---:|---:|---|---|
| **B2** | Basement 2 | `floors/floor-b2.html` | `floors/basement-2.svg` | 28 | 13 | Dual Purple Elevators + Right UP Staircase | B201–B205, Mechanical lab, Music room, Changing room; B206/B210 estimated |
| **B1** | Basement 1 | `floors/floor-b1.html` | `floors/basement-1.svg` | 20 | 13 | Dual Purple Elevators + Right UP / Left DOWN Stairs | B101, B103–B107, B110–B112, `B118` (SVG typo for B108); B102/B109 estimated |
| **G** | Ground Floor | `floors/floor-g.html` | `floors/ground-floor.svg` | 20 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Main Entrance foyer, Reception (open lobby `[-1.8, -18.5, 3.6, -11.0]`), G01–G06, Pharmacy, Stationery, Toilets |
| **1** | Floor 1 | `floors/floor-1.html` | `floors/floor-1-map.svg` | 35 | 32 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Toilets |
| **2** | Floor 2 | `floors/floor-2.html` | `floors/floor-2-map.svg` | 39 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, 210, Toilets |
| **3** | Floor 3 | `floors/floor-3.html` | `floors/floor-3-map.svg` | 19 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | Floor 4 | `floors/floor-4.html` | *None* | 4 | 0 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Department of Pharmacy under active renovation (rendered as explicit construction shell) |
| **5** | Floor 5 | `floors/floor-5.html` | `floors/floor-5-map.svg` | 29 | 10 | Dual Purple Elevators + Right UP / Left DOWN Stairs | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Toilets |
| **6** | Floor 6 | `floors/floor-6.html` | `floors/floor-6-map.svg` | 29 | 15 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant |
| **7** | Floor 7 | `floors/floor-7.html` | `floors/floor-7-map.svg` | 43 | 14 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar |
| **8** | Floor 8 | `floors/floor-8.html` | `floors/floor-8-map.svg` | 55 | 16 | Dual Purple Elevators + Right UP / Left DOWN Stairs | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Toilets |
| **9** | Floor 9 | `floors/floor-9.html` | `floors/floor-9-map.svg` | 25 | 11 | Dual Purple Elevators + Left DOWN Staircase | Cafeteria (901), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society |

### 1.2 Room Verification Summary (`AUDIT_SUMMARY`)
- **Completed floors:** `12` (`Basement 2` through `Floor 9`)
- **Floors with SVG plans:** `11` (`B2`–`3`, `5`–`9`)
- **Total rooms/facilities mapped:** `129`
- **Rooms with SVG-verified 3D positions (`verified-svg`):** `116`
- **Rooms estimated from written directions (`estimated-from-directions`):** `11`
- **Rooms requiring physical verification (`requires-physical-verification`):** `1` (`room-210`)
- **Rooms under renovation (`under-construction`):** `1` (`floor-4-pharmacy`)

---

## 2. Visual Corrections & Implementation Correction Prompt 2 Changes

1. **Rebuilt Dual-Elevator Core & Physically Attached Directional Staircases (`pic3.png`, `s1.png`–`s4.png`):**
   - Rebuilt Section 5 of `buildFloorGroup` in `js/3d/floor-generator.js` on all 12 levels (`B2`–`9`) into an integrated central circulation core with a unified deck platform, structural corner columns, and **two side-by-side purple elevators** (`elevator-unit-${code}-left` and `elevator-unit-${code}-right`), each featuring parted double doors, surround portal frames, overhead digital floor indicators, upper glass transoms, internal elevator cabs, and a central call button panel.
   - Filtered out `#06c` SVG door strokes overlapping the elevator core region (`elevBoxForDoors ± 2.2m`) in `js/3d/floor-generator.js` so no stray blue/grey door leaf renders in front of the elevators.
   - Replaced the old detached staircase flights with **physically attached wrap-around directional staircases** modeled with individual treads, risers, sloped side stringers, intermediate turn landings, structural columns, glass balustrade panels, and handrails:
     - **Right-hand staircase (`staircase-${code}-east`, `UP`):** Connects the current floor's right-hand lower landing (`Basement 2` through `Floor 8`) up to the next floor above (`y = +4.2m`); `Floor 9` terminates with a top safety balustrade.
     - **Left-hand staircase (`staircase-${code}-west`, `DOWN`):** Connects the current floor's left-hand upper landing (`Basement 1` through `Floor 9`) down to the floor immediately below (`y = -4.2m`); `Basement 2` terminates with a bottom safety balustrade.
   - Updated `NavigationGraph` (`js/3d/navigation-graph.js`) with `addDirectedEdge`, dual elevator nodes (`elev-left-${code}`, `elev-right-${code}`), and strictly directed staircase edges (`stairs-east-${fA} -> stairs-east-${fB}` for `UP` on the right; `stairs-west-${fB} -> stairs-west-${fA}` for `DOWN` on the left).
2. **Removed Vertical Travel UI Section (`vt.png`), Distance Measurements, & `Cutaway` Mode; Renamed `Top-Down` to `Map View`:**
   - Removed the `VERTICAL TRAVEL: Elevator / Stairs` UI row (`.vu3d-route-mode-row`) from `js/3d/navigation-ui.js` while retaining both elevator and staircase models, graph edges, and `setRouteMode()` routing capability.
   - Removed all distance measurements (`(~5m)`, `(5m)`, `112m`) from turn-by-turn instructions (`js/3d/pathfinder.js`) and route summary headers (`#vu3d-route-stats` in `js/3d/navigation-ui.js`).
   - Removed the `Cutaway` view mode button from `.vu3d-view-controls` and normalized internal view transitions (`js/3d/building-generator.js`, `js/3d/navigation-ui.js`) to `'isolated'`.
   - Renamed `#vu3d-btn-topdown` from `Top-Down` to `Map View`.
3. **Dark Mode Contrast Corrections (`ui1.png`) & Plain-Text Theme Toggle:**
   - Fixed Dark Mode contrast across 2D and 3D views in `css/style.css` without altering page layout or component geometry: styled `#roomAZSelect`, `#roomSelect`, `.select-container`, `.floor-heading`, `.site-nav a.active`, `.vu-mode-btn.active`, `.card-tag span`, and `#globalSearch` with high-contrast dark surfaces (`#162440` / `#1a2b4c`), crisp borders (`#38507e` / `#38bdf8`), and readable light typography (`#f8fafc`).
   - Theme toggle buttons (`#vu-theme-toggle` and `#vu3d-theme-toggle`) use clean plain-text labels (`Dark` / `Light`) persisted via `vu_theme_v1` in `localStorage`.
4. **Preserved Addendum 1 Corrections (`pic1.png`, `pic2.png`):**
   - Ground Floor Reception positioned in the open lobby (`[-1.8, -18.5, 3.6, -11.0]`) with spurious red-circled North-core walls removed from both 3D geometry and A* collision data.
   - Basement 2 and Basement 1 isolate cleanly with `groundPlazaGroup.visible = false` and `verticalCoreGroup.visible = false`.
   - Persistent 3D destination pin across floor switches, Need for Speed Underground animated directional route chevrons, and full human-readable floor names (`Basement 2` through `Floor 9`) everywhere.

---

## 3. Verification Results (Run After Final Edit)

### 3.1 Node Architecture, Audit, Search, Directional Stairs & Wall-Collision Suite (`node tests/verify-navigator.mjs`)
- **Result:** `16 passed`, `0 failed` (exit code `0`)
  - All 12 levels & 11 SVG geometry caches valid (`FLOOR_DEFINITIONS`, `SVG_GEOMETRY_CACHE`).
  - Complete `ROOM_DB` ↔ `ENHANCED_ROOM_DB` parity (129 mapped rooms).
  - Ground Floor Reception relocated to open lobby (`[-1.8, -18.5, 3.6, -11.0]`) and red-circled walls verified absent.
  - Dual elevators (`elev-left-*`, `elev-right-*`) verified on all 12 levels; ascending staircase routes verified to strictly use `stairs-east-*` (`Right = UP`) and descending staircase routes verified to strictly use `stairs-west-*` (`Left = DOWN`).
  - Zero distance measurements (`~Xm` / `(Xm)`) in any generated navigation instruction across both elevator and staircase routes.
  - **0 wall crossings** on corridor spines and across all `116` `verified-svg` room doorway/entry edges.
  - 100% reachability of all 128 destinations from `main-entrance` via both Elevator and Stairs, plus Floor 4 renovation notice.

### 3.2 Headless Chrome WebGL E2E Suite (`node tests/verify-browser-e2e.mjs`)
- **Result:** `8 passed`, `0 failed` (exit code `0`) in headless Chromium (`--headless=new --enable-webgl --use-angle=swiftshader`):
  - Zero console errors, zero uncaught exceptions, zero HTTP 404 errors across desktop (`1280×800`) and mobile (`390×844`) viewports.
  - Verified `Cutaway` button removal, `Map View` button rename and overhead camera toggle, `VERTICAL TRAVEL` UI removal, zero distance suffixes in rendered UI steps, and 12/12 floors containing dual-elevator cores + physically attached directional staircases.
  - Verified Dark Mode computed styles on `directions.html` (`#roomAZSelect`, `#roomSelect`, `.floor-heading`, `.site-nav a.active`) and 3D scene dark theme (`0x0b1325`), persistent destination pin, NFS-style animated route arrows, mobile drawers/CTAs, and WebGL-disabled fallback.

---

## 4. Known Limitations & Next Steps

1. **Physical Campus Walkthrough Recommended:** Confirm physical doors and signage for `room-210` (`requires-physical-verification`), the `11` estimated rooms lacking room-number labels in source SVGs, and on-site Floor 4 once renovation finishes and a Floor 4 SVG is authored.
2. **Deployment:** Branch `main` and `feat/3d-indoor-navigator` synchronized and pushed to `origin` (`https://github.com/jeiso-n/victoria-university-navigator.git`) for GitHub Pages deployment.
