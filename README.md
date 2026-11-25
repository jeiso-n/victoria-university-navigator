# Victoria University Tower Navigator (2D + 3D Indoor Navigation)

A responsive, static 2D + 3D indoor campus-navigation website for **Victoria University, Market Plaza Tower** in Kampala, Uganda. It unifies the interactive 2D SVG floor plans and written room directory with a procedural **Three.js 3D multistorey building** and **A* indoor pathfinding** across all 12 levels (`B2` through `Floor 9`).

**Live website:** https://jeiso-n.github.io/victoria-university-navigator/

## Key Features

- **Unified 2D / 3D Mode Toggle:** Switch anytime between `2D MAP` and `3D MAP` from the site header, `directions.html` room cards (`🧭 Navigate in 3D`), floor pages (`Explore in 3D`), or homepage CTA while keeping your selected floor, room, and search query in sync.
- **Procedural 12-Storey Three.js Building (`B2`–`9`):** Generates floor slabs, exterior curtain walls, doorway-split interior partitions (`#06c` SVG door openings), room footprints, elevator shaft, dual staircases, Ground Floor entrance canopy, Floor 4 renovation zone, and room labels directly from normalized SVG coordinates (`[-16, +16]m × [-27, +27]m`).
- **Multistorey Exploration Views:**
  - `Full Building` (entire 12-level Market Plaza Tower)
  - `Isolate Floor` (focus single floor `B2`–`9`)
  - `Cutaway` (selected floor highlighted with translucent upper/lower structure)
  - `Exploded` (vertically expanded stack showing floor relationships)
  - `Top-Down` / `Perspective` camera views + smooth fly-to transitions
- **Shared Room Search & Verification Metadata:** Searches 129 mapped rooms, laboratories, offices, and facilities across `ROOM_DB` / `ENHANCED_ROOM_DB` with aliases and typo tolerance, displaying SVG verification badges (`SVG Verified`, `Location Estimated / Verify On-Site`, `Under Renovation`).
- **Real Multi-Floor Indoor Pathfinding (A\*):**
  - Calculates walkable corridor routes avoiding solid walls, attaching doorways to walkable floor spines.
  - Supports both **Elevator** and **Stairs** vertical routing across consecutive levels.
  - Renders 3D elevated route paths, floor waypoint markers, animated step chevron, interactive turn-by-turn directions list, and animated walkthrough (`▶ Follow`, `Prev`, `Next`).
- **Graceful Fallback:** Zero build step; lazy-loads Three.js (`r170` ES modules) only when `3D MAP` is activated, with clean fallback messaging if WebGL is unavailable.

## Controls (3D Mode)

- **Orbit / Rotate:** Left-click + drag (or 1-finger drag on touch devices)
- **Pan:** Right-click + drag (or 2-finger drag)
- **Zoom:** Mouse wheel / pinch
- **Select Room:** Click/tap any room footprint or choose from the search dropdown
- **Floor Navigation:** Click any floor pill (`ALL`, `9` down to `B2`) on the right rail or switch view modes (`Full Building`, `Isolate Floor`, `Cutaway`, `Exploded`, `Top-Down`, `Reset View`)

## Getting Started

### Use the live website

Open [Victoria University Tower Navigator](https://jeiso-n.github.io/victoria-university-navigator/) in a modern browser.

### Run locally

The project is a 100% static website with no npm build step, bundler, database, or backend server required for runtime.

> **Note on ES Modules:** Because the 3D engine uses standard browser `<script type="module">` imports, serve the folder over HTTP when developing or testing locally (modern browsers block ES module imports over `file://`):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in Chrome, Edge, or Firefox.

## Automated Verification

Two standalone Node.js (`v22+` / `v26+`) verification suites are included:

1. **Architecture, SVG Audit, Search & A\* Pathfinding Suite** (checks all 12 floors, 11 SVG geometry caches, `ROOM_DB` parity, corridor & verified doorway wall-collision checks, reachability of all 129 rooms, and Floor 4 notices):
   ```bash
   node tests/verify-navigator.mjs
   ```
2. **Headless Chrome WebGL E2E Suite** (launches an embedded static server + Chrome CDP headless session covering desktop `1280×800`, mobile `390×844`, 3D scene initialization, view modes, search/routing, 2D/3D switching, and WebGL-disabled fallback):
   ```bash
   node tests/verify-browser-e2e.mjs
   ```

To regenerate `js/data/svg-geometry-cache.js` from the SVG floor plans:
```bash
python scripts/extract_svg_data.py
```

## Project Structure

```text
victoria-university-navigator/
├── .github/workflows/deploy-pages.yml  # Static GitHub Pages workflow
├── css/style.css                       # 2D site styling + 3D workspace & mobile drawer UI
├── floors/
│   ├── *.html                          # Individual floor pages (B2–9 + floor index)
│   └── *.svg                           # Reference SVG floor plans (11 mapped floors)
├── js/
│   ├── script.js                       # Canonical 2D ROOM_DB, search, drawer & 2D controls
│   ├── data/
│   │   ├── svg-geometry-cache.js       # Normalized walls, doors, rooms & vertical shafts
│   │   └── building-data.js            # FLOOR_DEFINITIONS, ENHANCED_ROOM_DB (129), AUDIT_SUMMARY
│   ├── 3d/
│   │   ├── svg-parser.js               # Live SVG DOMParser normalizer + cache fallback
│   │   ├── floor-generator.js          # Procedural walls (split at doors), slabs, labels
│   │   ├── building-generator.js       # 12-level tower, elevator shaft, staircases, view modes
│   │   ├── room-manager.js             # Raycast picking, emissive highlights & beacon pin
│   │   ├── navigation-graph.js         # Walkable corridor spines, vertical cores, wall checks
│   │   ├── pathfinder.js               # Multi-floor A* pathfinder + turn-by-turn generator
│   │   ├── route-renderer.js           # 3D path tubes, markers & active step chevron
│   │   ├── camera-controller.js        # OrbitControls + smooth eased floor/room transitions
│   │   ├── scene-manager.js            # WebGL init, lighting, render loop & module wiring
│   │   └── navigation-ui.js            # 2D/3D toggle, search UI, floor rail & route controls
│   └── vendor/
│       ├── three.module.js             # Three.js r170 ES module
│       └── OrbitControls.js            # Three.js OrbitControls (patched relative import)
├── scripts/extract_svg_data.py         # SVG-to-Three.js affine normalization extractor
├── tests/
│   ├── verify-navigator.mjs            # Data, graph, A* & wall-collision verification suite
│   └── verify-browser-e2e.mjs          # Headless Chrome WebGL E2E suite
├── current report.md                   # Audit & Phase 7 verification report
├── campus.blend                        # Blender reference asset (not loaded at runtime)
└── *.html                              # Main 2D entry pages
```

## Deployment

`.github/workflows/deploy-pages.yml` deploys all tracked static site files directly to GitHub Pages (with `.nojekyll` and excluding `campus.blend`, `*.docx`, `.github/*`, and `.git/*`).

## Project Credits

- **Jeison_Muganzi**

## Notes

- Floor 4 (Department of Pharmacy) has no SVG plan in `floors/` because it is under active renovation; the 3D tower renders an explicit renovation shell with a routing notice.
- Rooms whose SVG floor plans lacked explicit room numbers (`11` estimated from written directions and `1` flagged `requires-physical-verification`) are labeled in the UI and tracked in [current report.md](current%20report.md) for physical confirmation on campus.
