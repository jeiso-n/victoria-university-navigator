# Victoria University 3D Indoor Navigator — Current Report

- **Repository:** `d:\Projects\victoria-university-navigator` (Remote: `https://github.com/jeiso-n/victoria-university-navigator.git`)
- **Active Branch:** `feat/3d-indoor-navigator`
- **Last Updated:** 2026-11-25
- **Objective:** Transform Victoria University Navigator into a unified 2D + 3D indoor navigation product covering all 12 levels (`B2` through `9`) of Market Plaza Tower, Kampala, Uganda, with procedural Three.js building geometry derived from the existing SVG floor plans, shared room database, multi-floor A* pathfinding, turn-by-turn directions, and seamless 2D/3D mode switching.

---

## 1. Repository & Architectural Audit

### 1.1 Available Floor Plans & Coordinate Normalization
All 11 SVG floor plans in `floors/` were parsed with nested SVG affine transformations (`matrix(...)` / `translate(...)`) by `scripts/extract_svg_data.py` and normalized into a shared Three.js world coordinate system (`X ∈ [-16, +16]` m, `Z ∈ [-27, +27]` m, `32m × 54m`, `4.2m` floor-to-floor height):

| Floor | HTML Page | SVG Floor Plan | Raw ViewBox | Transformed Wall BBox | Walls | Doors (`#06c`) | Elevator Core | Notes |
|---|---|---|---|---|---:|---:|---|---|
| **B2** | `floors/floor-b2.html` | `floors/basement-2.svg` | `-160 -440 480 660` | `[-120,-400]..[280,180]` | 33 | 13 | North-Center | B201–B205, Mechanical lab, Music room, Changing room; B206/B210 estimated |
| **B1** | `floors/floor-b1.html` | `floors/basement-1.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` (`matrix(-1 0 0 -1 0 20)`) | 25 | 13 | North-Center | B101, B103–B107, B110–B112, `B118` (SVG typo for B108); B102/B109 estimated |
| **G** | `floors/floor-g.html` | `floors/ground-floor.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 26 | 10 | North-Center | Main Entrance foyer, Reception, G01–G06, Pharmacy, Stationary, Toilets |
| **1** | `floors/floor-1.html` | `floors/floor-1-map.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 39 | 32 | North-Center | 101–127 (incl. 126), Boardrooms 1–3 (`B.Room1`, `B.r2`, `B.r3`), Toilets |
| **2** | `floors/floor-2.html` | `floors/floor-2-map.svg` | `-260 -300 540 580` | `[-220,-260.3]..[240,240]` | 45 | 16 | North-Center | Cosmetics lab (201), ICT Lab 1 & 2, H.O.D Sci & Tech, 203–208, 210, Toilets |
| **3** | `floors/floor-3.html` | `floors/floor-3-map.svg` | `-200 -300 400 620` | `[-160,-260]..[160,280]` | 27 | 16 | North-Center | 301–308, Art Room, Anatomy Lab, Skills Lab, Nutrition Lab |
| **4** | `floors/floor-4.html` | *None* | — | — | 0 | 0 | North-Center (Core) | Department of Pharmacy under active renovation (rendered as explicit construction shell) |
| **5** | `floors/floor-5.html` | `floors/floor-5-map.svg` | `0 0 1920 1920` | `[335.8,77.5]..[1516.3,1842.5]` (90° rotated) | 34 | 10 | North-Center | Science Room 1 (501), Science Room 2 (502), Engineering & Graphics (503), Toilets |
| **6** | `floors/floor-6.html` | `floors/floor-6-map.svg` | `-240 -320 480 680` | `[-200,-280]..[200,320]` | 34 | 15 | North-Center | 6-01..6-06, Guild Office, Computer Lab 1, Server Room, Dean Institute, Exec. Assistant |
| **7** | `floors/floor-7.html` | `floors/floor-7-map.svg` | `-140 -420 560 740` | `[-100,-380]..[380,280]` | 48 | 14 | North-Center | 7-01, Multi studio, Moot Court, 7-04, 7-08, Law Boardroom, Dean/Assoc Dean/Registrar |
| **8** | `floors/floor-8.html` | `floors/floor-8-map.svg` | `-220 -320 440 660` | `[-180,-280]..[180,300]` | 61 | 16 | North-Center | 8-01..8-08, 8-10, Vice Chancellor Coordination, Quality Assurance, Toilets |
| **9** | `floors/floor-9.html` | `floors/floor-9-map.svg` | `-200 -280 400 580` | `[-160,-240]..[160,260]` | 29 | 11 | North-Center | Cafeteria (901), Library (902), Computer Lab 2 (903), Silent Rooms 1–2, Law Society |

### 1.2 Room Verification Summary (`AUDIT_SUMMARY`)
- **Completed floors:** `12` (`B2`, `B1`, `G`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`)
- **Floors with SVG plans:** `11` (`B2`–`3`, `5`–`9`)
- **Total rooms/facilities mapped:** `129`
- **Rooms with SVG-verified 3D positions (`verified-svg`):** `116`
- **Rooms estimated from written directions (`estimated-from-directions`):** `11`
- **Rooms requiring physical verification (`requires-physical-verification`):** `1`
- **Rooms under renovation (`under-construction`):** `1`

| Room ID | Room | Name | Floor | Status | Reason / Verification Needed |
|---|---|---|---|---|---|
| `room-b206` | `B206` | Free Study Room | `B2` | `estimated-from-directions` | Unlabelled SVG cell near door D8 `(-11.2, 24.22)`; matched from written directions |
| `room-b210` | `B210` | Free Study Room | `B2` | `estimated-from-directions` | Unlabelled south middle-block cell adjacent to B204/B206 |
| `room-b102` | `B102` | Study Room | `B1` | `estimated-from-directions` | Unlabelled NW corner cell near door D5 `(-10.0, -19.0)` |
| `room-b109` | `B109` | Study Room | `B1` | `estimated-from-directions` | Middle-block cell past Principal's Office near door D10 `(4.0, 0.84)` |
| `main-entrance` | `Entrance` | Main Entrance (Market Plaza) | `G` | `estimated-from-directions` | South Ground Floor lobby foyer (`z = +24.5`) leading north toward Reception |
| `room-210` | `210` | Storage Room | `2` | `requires-physical-verification` | Mapped to SW cell (door D4 `(-13.22, 25.59)`); `floor-2-map.svg` lacks `"210"` label (`"202"` printed twice) |
| `floor-4-pharmacy` | `Floor 4` | Department of Pharmacy | `4` | `under-construction` | Entire level undergoing renovation/lab outfitting; no SVG plan exists |
| `room-702` | `7-02` | Film / Sound Studio | `7` | `estimated-from-directions` | Matches `"Multi studio"` partition adjacent to 7-01 per directions prose |
| `room-705` | `7-05` | Study Room 7-05 | `7` | `estimated-from-directions` | East/central partition inferred alongside 7-04 |
| `room-706` | `7-06` | Study Room 7-06 | `7` | `estimated-from-directions` | South-east cell labeled `"7-08"` in SVG while Law School Board Room `7-08` is on west |
| `room-904` | `904` | IT Room | `9` | `estimated-from-directions` | Enclosed NE Library cell (doors D6/D7) adjacent to Editing Suite / Lab 2 |
| `room-909` | `909` | Meeting Room 1 | `9` | `estimated-from-directions` | Partitioned SE block (`door D0 (8.0, 5.21)`) per Floor 9 directions |
| `room-910` | `910` | Meeting Room 2 | `9` | `estimated-from-directions` | South end of east block adjacent to Meeting Room 1 |

---

## 2. Implemented Modules & Features

1. **Shared Data & 2D Parity:**
   - Updated `js/script.js` `ROOM_DB` to add previously missing Floor 6 rooms (`room-601`–`room-606`), `room-b112`, `main-entrance`, `floor-4-pharmacy`, `ict-lab-2`, and aliases (`ICT-Lab-1`, `room-202`, `b118`).
   - Created `js/data/svg-geometry-cache.js` and `js/data/building-data.js` (`FLOOR_DEFINITIONS`, `ENHANCED_ROOM_DB`, `AUDIT_SUMMARY`, `findRoomByIdOrAlias`, `searchRooms`).
2. **Procedural Three.js 3D Building (`js/3d/` + `js/vendor/`):**
   - Bundled Three.js `r170` (`js/vendor/three.module.js`, `js/vendor/OrbitControls.js`) for zero-CDN, GitHub-Pages-ready static hosting.
   - Built `svg-parser.js`, `floor-generator.js`, and `building-generator.js` to construct all 12 levels with exterior glass walls, interior partition walls split at `#06c` doors, doorways/frames, central Elevator Shaft (`B2`–`9`), West & East Staircases (`B2`–`9`), room slabs/labels, Ground Entrance canopy, and Floor 4 construction deck.
   - Supported building views: `Full Building`, `Isolate Floor`, `Cutaway`, `Exploded`, `Top-Down`, `Perspective`, and smooth cubic-eased camera fly-to (`camera-controller.js`).
3. **Interactive Picking, Multi-Floor A\* Pathfinding & UI (`room-manager.js`, `navigation-graph.js`, `pathfinder.js`, `route-renderer.js`, `scene-manager.js`, `navigation-ui.js`, `css/style.css`):**
   - Raycast room hover tooltip & click selection with emissive glow, bounding wireframe, pulsing floor ring, and animated beacon pin.
   - Multi-floor A* pathfinder across corridors, elevator shaft (`B2`–`9`), and dual staircases (`B2`–`9`), generating geometric turn-by-turn steps and explicit Floor 4 construction / unverified-location warnings.
   - Header `[ 2D MAP ] [ 3D MAP ]` toggle across all 18 HTML pages (`index.html`, `directions.html`, `facilities.html`, `new-student-guide.html`, `about.html`, `floors/index.html`, `floors/floor-*.html`), card/floor 3D launch buttons, responsive mobile drawer, and WebGL-disabled fallback view.

---

## 3. Phase 7 Verification Evidence

### 3.1 Automated Data, Search, Graph & Wall-Collision Suite (`node tests/verify-navigator.mjs`)
- **Result:** `12 passed`, `0 failed` (exit code `0`)
- Verified:
  - All 12 levels (`B2..9`) defined in `FLOOR_DEFINITIONS` and all 11 SVG floor caches populated in `SVG_GEOMETRY_CACHE`.
  - Every `js/script.js` `ROOM_DB` entry exists in `ENHANCED_ROOM_DB` with valid normalized 3D bounding boxes.
  - Search & alias resolution across room codes, room names, department names, typos (`Editting Suite`), and hyphenated Floor 6 codes (`6-01`).
  - Zero unexpected solid-wall crossings across all corridor spine edges and across all `116` `verified-svg` room doorway/entry edges.
  - Reachability of all `128` destination rooms from `main-entrance` in both `elevator` and `stairs` modes.
  - Route validation:
    - Same-floor route: `main-entrance` (G) → `student-support-office` (`G02`, Floor G)
    - Cross-floor Elevator route: `main-entrance` (G) → `room-305` (Floor 3) via Elevator
    - Cross-floor Stairs route: `dance` (`B202`, Floor B2) → `room-902` (Library, Floor 9) via Staircases
    - Renovation notice route: `main-entrance` (G) → `floor-4-pharmacy` (Floor 4)

### 3.2 Headless Chrome WebGL E2E Verification (`node tests/verify-browser-e2e.mjs`)
- **Result:** `7 passed`, `0 failed` (exit code `0`)
- Verified in real Chromium (`--headless=new --enable-webgl --use-angle=swiftshader`):
  - **Desktop (`1280×800`) `index.html`:** Zero console/page/HTTP 404 errors; 2D `#globalSearch` works; `3D MAP` toggle initializes all `12` floors and `129` room meshes with non-blank WebGL canvas.
  - **View Modes & Floor Rail:** Switched cleanly across `isolated`, `cutaway`, `exploded`, `building`, `Top-Down`, `Reset View`, Floor `3` pill, and `ALL` pill.
  - **3D Search & Multi-Floor Routing:** Searched `"305"`, selected `room-305`, computed Elevator route (`G -> 1 -> 2 -> 3`, `>= 4` steps, rendered 3D route group & bottom walkthrough bar), switched to Stairs mode, advanced step index, and switched back cleanly to `2D MAP`.
  - **Mobile (`390×844`) `directions.html` & `floors/floor-3.html`:** Tested `.card-3d-link` deep launch to Room 305, mobile `#vu3d-mobile-panel-toggle` drawer, and Floor 3 `.floor-3d-cta` (`Explore in 3D`) landing on isolated Floor 3 (also caught and fixed a `mountToggle` DOM `insertBefore` bug caused by an unclosed `<nav>` in existing `floor-3.html` markup).
  - **Graceful WebGL Fallback:** Verified `.vu3d-webgl-fallback` and `Return to 2D Map` CTA work with zero uncaught exceptions when WebGL contexts return `null`.

---

## 4. Known Limitations & On-Site Follow-Ups

1. **Physical Campus Walkthrough Recommended:** Confirm physical doors and signage for `room-210` (`requires-physical-verification`), the `11` estimated rooms lacking room-number labels in source SVGs, and whether Basement 1 (`B1`) and Floor 1 (`1`) share identical staircase access points with the rest of the shaft core (`B1` and `1` SVGs omit directional stair arrows next to the elevator).
2. **Floor 4 (Pharmacy):** Replace the under-renovation shell once an official Floor 4 floor-plan SVG is completed.
3. **`B1` SVG Typo:** `floors/floor-b1.svg` prints `"B118"` where `directions.html` lists `B108`; both strings are searchable via aliases.
