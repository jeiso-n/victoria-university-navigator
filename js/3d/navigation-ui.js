// Unified 2D / 3D Indoor Navigation UI Controller
// Lazy-loads the Three.js SceneManager when 3D mode is activated, synchronizes selected
// floor, room, and search state seamlessly between 2D and 3D modes, and provides full
// Google-Maps-style indoor search, floor selector, view-mode switcher, and turn-by-turn routing.

import {
  FLOOR_DEFINITIONS,
  FLOOR_MAP,
  ENHANCED_ROOM_DB,
  AUDIT_SUMMARY,
  findRoomByIdOrAlias,
  searchRooms,
  formatFloorLabel,
} from '../data/building-data.js';

const STORAGE_KEY = 'vu_nav_state_v1';
const THEME_KEY = 'vu_theme_v1';

function detectBasePath() {
  const path = window.location.pathname;
  return path.includes('/floors/') || path.includes('\\floors\\') ? '..' : '.';
}

function detectInitialFloorFromPage() {
  const path = window.location.pathname.toLowerCase();
  const m = path.match(/floor-(b2|b1|g|[1-9])\.html/);
  if (m) return m[1].toUpperCase();
  return null;
}

function readSavedState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function writeSavedState(patch) {
  try {
    const next = { ...readSavedState(), ...patch };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (_) {}
}

class NavigatorController {
  constructor() {
    this.basePath = detectBasePath();
    this.is3DActive = false;
    this.sceneManager = null;
    this.initPromise = null;

    this.activeFloor = detectInitialFloorFromPage() || 'G';
    this.viewMode = 'building';
    this.topDown = false;
    this.selectedRoom = null;
    this.startRoomId = 'main-entrance';
    this.routeMode = 'elevator';
    this.currentRoute = null;
    this.activeStepIdx = 0;
    this.walkthroughTimer = null;
    this.theme = this.readSavedTheme();

    this.overlayEl = null;
    this.applyTheme(this.theme);
    this.mountToggle();
    this.enhance2DPages();
    this.restoreFromUrlOrState();
  }

  readSavedTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  applyTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    const isDark = this.theme === 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    document.body.classList.toggle('dark-mode', isDark);
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch (_) {}

    const label = isDark ? '☀️ Light' : '🌙 Dark';
    const aria = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    [document.getElementById('vu-theme-toggle'), document.getElementById('vu3d-theme-toggle')].forEach(btn => {
      if (!btn) return;
      btn.textContent = label;
      btn.setAttribute('aria-label', aria);
      btn.setAttribute('title', aria);
      btn.classList.toggle('is-dark', isDark);
    });

    if (this.sceneManager) {
      this.sceneManager.setTheme(isDark);
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  mountToggle() {
    const headerInner = document.querySelector('header .header-inner');
    if (!headerInner) return;

    if (!document.getElementById('vu-mode-toggle')) {
      const toggle = document.createElement('div');
      toggle.id = 'vu-mode-toggle';
      toggle.className = 'vu-mode-toggle';
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', 'Switch between 2D Map and 3D Map');
      toggle.innerHTML = `
        <button type="button" class="vu-mode-btn active" data-mode="2d" id="btn-mode-2d">2D MAP</button>
        <button type="button" class="vu-mode-btn" data-mode="3d" id="btn-mode-3d">3D MAP</button>
      `;

      const hamburger = headerInner.querySelector('.nav-hamburger');
      if (hamburger && hamburger.parentNode === headerInner) {
        headerInner.insertBefore(toggle, hamburger);
      } else {
        headerInner.appendChild(toggle);
      }

      toggle.querySelector('#btn-mode-2d').addEventListener('click', () => this.switchTo2D());
      toggle.querySelector('#btn-mode-3d').addEventListener('click', () => this.switchTo3D());
    }

    if (!document.getElementById('vu-theme-toggle')) {
      const themeBtn = document.createElement('button');
      themeBtn.type = 'button';
      themeBtn.id = 'vu-theme-toggle';
      themeBtn.className = 'vu-theme-btn';
      themeBtn.addEventListener('click', () => this.toggleTheme());
      const hamburger = headerInner.querySelector('.nav-hamburger');
      if (hamburger && hamburger.parentNode === headerInner) {
        headerInner.insertBefore(themeBtn, hamburger);
      } else {
        headerInner.appendChild(themeBtn);
      }
      this.applyTheme(this.theme);
    }
  }

  enhance2DPages() {
    // Add "Navigate in 3D" pill to every direction card on directions.html
    document.querySelectorAll('.direction-card[id]').forEach(card => {
      if (card.querySelector('.card-3d-link')) return;
      const room = findRoomByIdOrAlias(card.id);
      if (!room) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-3d-link';
      btn.innerHTML = `<span>🧭</span> Navigate in 3D`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openIn3DWithRoom(room);
      });
      card.appendChild(btn);
    });

    // Add quick 3D launch button inside floor pages next to Map View / Room List toggle
    const floorToggle = document.querySelector('.floor-plan-toggle');
    if (floorToggle && !floorToggle.querySelector('.floor-3d-cta')) {
      const fCode = detectInitialFloorFromPage() || 'G';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toggle-btn floor-3d-cta';
      btn.textContent = 'Explore in 3D';
      btn.addEventListener('click', () => {
        this.activeFloor = fCode;
        this.viewMode = 'isolated';
        this.switchTo3D();
      });
      floorToggle.appendChild(btn);
    }

    // Add quick 3D banner button on homepage floor-selector header
    const fsHeader = document.querySelector('.floor-selector-header');
    if (fsHeader && !fsHeader.querySelector('.home-3d-cta')) {
      const wrap = document.createElement('div');
      wrap.className = 'home-3d-cta-wrap';
      wrap.innerHTML = `
        <button type="button" class="home-3d-cta" id="home-launch-3d">
          <span>🏢</span> Launch Interactive 3D Building &amp; Indoor Navigation
        </button>
      `;
      fsHeader.appendChild(wrap);
      wrap.querySelector('#home-launch-3d').addEventListener('click', () => this.switchTo3D());
    }
  }

  restoreFromUrlOrState() {
    const params = new URLSearchParams(window.location.search);
    const hashRoom = window.location.hash ? findRoomByIdOrAlias(window.location.hash) : null;
    if (hashRoom) {
      this.selectedRoom = hashRoom;
      this.activeFloor = hashRoom.floor;
    }
    const qRoom = params.get('room') ? findRoomByIdOrAlias(params.get('room')) : null;
    if (qRoom) {
      this.selectedRoom = qRoom;
      this.activeFloor = qRoom.floor;
    }
    if (params.get('floor') && FLOOR_MAP[params.get('floor').toUpperCase()]) {
      this.activeFloor = params.get('floor').toUpperCase();
    }
    if (params.get('mode') === '3d') {
      this.switchTo3D();
    }
  }

  openIn3DWithRoom(room) {
    this.selectedRoom = room;
    this.activeFloor = room.floor;
    writeSavedState({ selectedRoomId: room.id, activeFloor: room.floor });
    this.switchTo3D();
  }

  async switchTo3D() {
    if (this.is3DActive) return;
    this.is3DActive = true;
    this.updateToggleButtons();

    // Sync state from 2D search input or hash if user didn't pick one yet
    const globalInput = document.getElementById('globalSearch');
    if (!this.selectedRoom && window.location.hash) {
      const rm = findRoomByIdOrAlias(window.location.hash);
      if (rm) {
        this.selectedRoom = rm;
        this.activeFloor = rm.floor;
      }
    }

    this.ensureOverlayDom();
    this.overlayEl.classList.add('open');
    document.body.classList.add('vu-3d-open');

    if (globalInput && globalInput.value.trim()) {
      const navInput = this.overlayEl.querySelector('#vu3d-search-input');
      if (navInput) {
        navInput.value = globalInput.value.trim();
        this.render3DSearchResults(navInput.value);
      }
    }

    await this.ensureSceneLoaded();

    if (this.sceneManager) {
      this.sceneManager.handleResize();
      if (this.selectedRoom) {
        this.handleSelectRoom(this.selectedRoom, true);
      } else {
        const floorCode = detectInitialFloorFromPage() || this.activeFloor || 'G';
        if (detectInitialFloorFromPage()) {
          this.viewMode = 'isolated';
          this.setFloorAndView(floorCode, 'isolated');
        } else {
          this.setFloorAndView(floorCode, this.viewMode);
        }
      }
    }
  }

  switchTo2D() {
    if (!this.is3DActive) return;
    this.is3DActive = false;
    this.stopWalkthrough();
    this.updateToggleButtons();

    if (this.overlayEl) {
      this.overlayEl.classList.remove('open');
    }
    document.body.classList.remove('vu-3d-open');

    // Sync selected room / search state back to 2D experience
    if (this.selectedRoom) {
      writeSavedState({ selectedRoomId: this.selectedRoom.id, activeFloor: this.selectedRoom.floor });
      const onDirections = window.location.pathname.endsWith('directions.html');
      const onFloorPage = window.location.pathname.includes('/floors/');
      if (onDirections) {
        const cleanAnchor = (this.selectedRoom.anchor || `#${this.selectedRoom.id}`).split('#')[1];
        if (cleanAnchor) window.location.hash = `#${cleanAnchor}`;
      } else if (onFloorPage && this.selectedRoom.floor !== detectInitialFloorFromPage()) {
        const fDef = FLOOR_MAP[this.selectedRoom.floor];
        if (fDef) window.location.href = `${this.basePath}/${fDef.htmlPath}`;
      }
    }
  }

  updateToggleButtons() {
    const b2 = document.getElementById('btn-mode-2d');
    const b3 = document.getElementById('btn-mode-3d');
    if (b2) b2.classList.toggle('active', !this.is3DActive);
    if (b3) b3.classList.toggle('active', this.is3DActive);
  }

  ensureOverlayDom() {
    if (this.overlayEl) return;

    const overlay = document.createElement('section');
    overlay.id = 'vu-3d-overlay';
    overlay.className = 'vu-3d-overlay';
    overlay.setAttribute('aria-label', '3D Indoor Building Navigator');

    const floorButtonsHtml = [...FLOOR_DEFINITIONS].reverse().map(f => `
      <button type="button" class="vu3d-floor-pill ${f.floorClass}" data-floor="${f.code}" title="${f.name}" aria-label="${f.name}">
        <span class="vu3d-floor-code">${f.name}</span>
      </button>
    `).join('');

    const startOptionsHtml = ENHANCED_ROOM_DB
      .filter(r => ['main-entrance', 'reception', 'student-support-office', 'registration', 'room-902', 'cafeteria'].includes(r.id) || r.floor === 'G')
      .map(r => `<option value="${r.id}">${r.name} (${formatFloorLabel(r.floor)})</option>`)
      .join('');

    const allStartOptionsHtml = ENHANCED_ROOM_DB
      .map(r => `<option value="${r.id}">${r.room !== '—' ? r.room + ' · ' : ''}${r.name} (${formatFloorLabel(r.floor)})</option>`)
      .join('');

    overlay.innerHTML = `
      <div class="vu3d-topbar">
        <div class="vu3d-topbar-left">
          <button type="button" class="vu3d-back-2d" id="vu3d-back-2d" title="Return to 2D Map">
            ← 2D View
          </button>
          <div class="vu3d-brand-badge">
            <strong>Market Plaza Tower · 3D</strong>
            <span id="vu3d-active-floor-label">All Floors (Basement 2 – Floor 9)</span>
          </div>
        </div>

        <div class="vu3d-view-controls" role="group" aria-label="3D View Modes">
          <button type="button" class="vu3d-view-btn active" data-view="building">Full Building</button>
          <button type="button" class="vu3d-view-btn" data-view="isolated">Isolate Floor</button>
          <button type="button" class="vu3d-view-btn" data-view="cutaway">Cutaway</button>
          <button type="button" class="vu3d-view-btn" data-view="exploded">Exploded</button>
          <button type="button" class="vu3d-view-btn" id="vu3d-btn-topdown">Top-Down</button>
          <button type="button" class="vu3d-view-btn" id="vu3d-btn-reset">Reset View</button>
          <button type="button" class="vu-theme-btn vu3d-theme-btn" id="vu3d-theme-toggle" aria-label="Toggle Dark Mode">🌙 Dark</button>
        </div>

        <button type="button" class="vu3d-mobile-panel-toggle" id="vu3d-mobile-panel-toggle">
          🔍 Search &amp; Route
        </button>
      </div>

      <div class="vu3d-workspace">
        <aside class="vu3d-left-panel" id="vu3d-left-panel">
          <div class="vu3d-panel-section">
            <label class="vu3d-label" for="vu3d-search-input">Search Destination</label>
            <div class="vu3d-search-box">
              <input type="search" id="vu3d-search-input" placeholder="Room code, name, lab, office…" autocomplete="off" spellcheck="false">
              <button type="button" class="vu3d-clear-search" id="vu3d-clear-search" title="Clear search">&times;</button>
            </div>
            <div class="vu3d-search-results" id="vu3d-search-results"></div>
          </div>

          <div class="vu3d-panel-section vu3d-route-setup">
            <div class="vu3d-route-row">
              <label class="vu3d-label" for="vu3d-start-select">Start Location</label>
              <select id="vu3d-start-select">
                <optgroup label="Common Entrances &amp; Ground Floor">
                  ${startOptionsHtml}
                </optgroup>
                <optgroup label="All Rooms (Basement 2 – Floor 9)">
                  ${allStartOptionsHtml}
                </optgroup>
              </select>
            </div>
            <div class="vu3d-route-mode-row">
              <span class="vu3d-label">Vertical Travel:</span>
              <div class="vu3d-mode-pills">
                <button type="button" class="vu3d-vmode active" data-vmode="elevator">🛗 Elevator</button>
                <button type="button" class="vu3d-vmode" data-vmode="stairs">🪜 Stairs</button>
              </div>
            </div>
          </div>

          <div class="vu3d-selected-card" id="vu3d-selected-card">
            <div class="vu3d-empty-state">
              <p><strong>Click any room</strong> on the 3D floor plan or search above to inspect details and calculate an indoor walking route.</p>
              <p class="vu3d-audit-note">12 floors mapped · ${AUDIT_SUMMARY.totalRoomsMapped} rooms &amp; facilities indexed from SVG blueprints.</p>
            </div>
          </div>

          <div class="vu3d-directions-panel" id="vu3d-directions-panel" hidden>
            <div class="vu3d-directions-header">
              <div>
                <strong>Turn-by-Turn Route</strong>
                <span id="vu3d-route-stats"></span>
              </div>
              <button type="button" class="vu3d-clear-route" id="vu3d-clear-route">Clear</button>
            </div>
            <ol class="vu3d-steps-list" id="vu3d-steps-list"></ol>
          </div>
        </aside>

        <div class="vu3d-canvas-area">
          <div id="vu3d-canvas-mount" class="vu3d-canvas-mount">
            <div class="vu3d-loader" id="vu3d-loader">
              <div class="vu3d-spinner"></div>
              <p id="vu3d-loader-text">Generating 12-storey Victoria University 3D building…</p>
            </div>
          </div>

          <div class="vu3d-hover-tooltip" id="vu3d-hover-tooltip" hidden></div>

          <div class="vu3d-floor-rail" aria-label="Floor Selector">
            <button type="button" class="vu3d-floor-pill vu3d-floor-all active" data-floor="ALL" title="All Floors">All Floors</button>
            ${floorButtonsHtml}
          </div>

          <div class="vu3d-floor-stepper" aria-label="Step Between Floors">
            <button type="button" class="vu3d-step-nav" id="vu3d-prev-floor" title="Previous Floor Below">↓ Down</button>
            <span class="vu3d-current-floor-pill" id="vu3d-current-floor-pill">Ground Floor</span>
            <button type="button" class="vu3d-step-nav" id="vu3d-next-floor" title="Next Floor Above">↑ Up</button>
          </div>

          <div class="vu3d-legend-chip">
            <span><i style="background:#1b365d"></i>Office</span>
            <span><i style="background:#059669"></i>Lab / Medical</span>
            <span><i style="background:#d97706"></i>Study</span>
            <span><i style="background:#00f5d4"></i>Route</span>
            <span><i style="background:#9333ea"></i>Elevator</span>
          </div>

          <div class="vu3d-bottom-bar" id="vu3d-bottom-bar" hidden>
            <button type="button" class="vu3d-step-nav" id="vu3d-prev-step">‹ Prev</button>
            <div class="vu3d-step-active-info">
              <span class="vu3d-step-floor-pill" id="vu3d-step-floor-pill">Ground Floor</span>
              <span class="vu3d-step-text" id="vu3d-step-text">—</span>
            </div>
            <div class="vu3d-bottom-actions">
              <button type="button" class="vu3d-step-nav" id="vu3d-play-route">▶ Follow</button>
              <button type="button" class="vu3d-step-nav" id="vu3d-next-step">Next ›</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.bindOverlayEvents();
    this.applyTheme(this.theme);
  }

  bindOverlayEvents() {
    const el = this.overlayEl;

    el.querySelector('#vu3d-back-2d').addEventListener('click', () => this.switchTo2D());
    el.querySelector('#vu3d-theme-toggle').addEventListener('click', () => this.toggleTheme());
    el.querySelector('#vu3d-prev-floor').addEventListener('click', () => this.stepFloor(-1));
    el.querySelector('#vu3d-next-floor').addEventListener('click', () => this.stepFloor(1));

    el.querySelector('#vu3d-mobile-panel-toggle').addEventListener('click', () => {
      el.querySelector('#vu3d-left-panel').classList.toggle('mobile-open');
    });

    // View mode buttons
    el.querySelectorAll('.vu3d-view-btn[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.topDown = false;
        this.viewMode = btn.dataset.view;
        this.setFloorAndView(this.activeFloor, this.viewMode);
      });
    });

    el.querySelector('#vu3d-btn-topdown').addEventListener('click', () => {
      if (!this.sceneManager) return;
      this.topDown = !this.topDown;
      if (this.topDown && this.viewMode === 'building') {
        this.viewMode = 'isolated';
        this.setFloorAndView(this.activeFloor, 'isolated');
      }
      this.sceneManager.cameraController.flyToFloor(this.activeFloor, this.topDown);
      el.querySelector('#vu3d-btn-topdown').classList.toggle('active', this.topDown);
    });

    el.querySelector('#vu3d-btn-reset').addEventListener('click', () => {
      if (!this.sceneManager) return;
      this.topDown = false;
      el.querySelector('#vu3d-btn-topdown').classList.remove('active');
      if (this.viewMode === 'building' || this.viewMode === 'exploded') {
        this.sceneManager.cameraController.setBuildingOverview();
      } else {
        this.sceneManager.cameraController.flyToFloor(this.activeFloor, false);
      }
    });

    // Right floor rail
    el.querySelectorAll('.vu3d-floor-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const fc = btn.dataset.floor;
        if (fc === 'ALL') {
          this.viewMode = 'building';
          this.topDown = false;
          this.setFloorAndView(this.activeFloor, 'building');
          if (this.sceneManager) this.sceneManager.cameraController.setBuildingOverview();
        } else {
          this.activeFloor = fc;
          if (this.viewMode === 'building') this.viewMode = 'isolated';
          this.setFloorAndView(fc, this.viewMode);
        }
      });
    });

    // Search input
    const searchInput = el.querySelector('#vu3d-search-input');
    const clearBtn = el.querySelector('#vu3d-clear-search');
    searchInput.addEventListener('input', () => {
      this.render3DSearchResults(searchInput.value);
    });
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      this.render3DSearchResults('');
    });

    // Start room & vertical mode
    const startSel = el.querySelector('#vu3d-start-select');
    startSel.value = this.startRoomId;
    startSel.addEventListener('change', () => {
      this.startRoomId = startSel.value;
      if (this.selectedRoom && this.currentRoute) {
        this.startNavigationTo(this.selectedRoom);
      }
    });

    el.querySelectorAll('.vu3d-vmode').forEach(btn => {
      btn.addEventListener('click', () => {
        this.routeMode = btn.dataset.vmode;
        el.querySelectorAll('.vu3d-vmode').forEach(b => b.classList.toggle('active', b === btn));
        if (this.selectedRoom && this.currentRoute) {
          this.startNavigationTo(this.selectedRoom);
        }
      });
    });

    el.querySelector('#vu3d-clear-route').addEventListener('click', () => this.clearRoute());
    el.querySelector('#vu3d-prev-step').addEventListener('click', () => this.goToStep(this.activeStepIdx - 1));
    el.querySelector('#vu3d-next-step').addEventListener('click', () => this.goToStep(this.activeStepIdx + 1));
    el.querySelector('#vu3d-play-route').addEventListener('click', () => this.toggleWalkthrough());
  }

  async ensureSceneLoaded() {
    if (this.sceneManager) return;
    if (this.initPromise) return this.initPromise;

    const mount = this.overlayEl.querySelector('#vu3d-canvas-mount');
    const loader = this.overlayEl.querySelector('#vu3d-loader');
    const loaderText = this.overlayEl.querySelector('#vu3d-loader-text');

    this.initPromise = (async () => {
      try {
        const { SceneManager } = await import('./scene-manager.js');
        const mgr = new SceneManager(mount, {
          basePath: this.basePath,
          isDark: this.theme === 'dark',
          onProgress: (pct, def) => {
            if (loaderText) {
              loaderText.textContent = `Building ${def.name} (${Math.round(pct * 100)}%)…`;
            }
          },
          onRoomSelect: (rm) => this.handleSelectRoom(rm, false),
          onRoomHover: (rm, evt) => this.handleHoverRoom(rm, evt),
          onReady: () => {
            if (loader) loader.remove();
          },
        });
        await mgr.init();
        this.sceneManager = mgr;
      } catch (err) {
        console.error('3D initialization error:', err);
        mount.innerHTML = `
          <div class="vu3d-webgl-fallback">
            <h3>3D View Unavailable</h3>
            <p>${err.message || 'WebGL graphics acceleration could not be initialized on this device.'}</p>
            <p>All floor plans, room directories, and walking directions remain available in 2D Map View.</p>
            <button type="button" class="primary-action" id="vu3d-fallback-2d">Return to 2D Map</button>
          </div>
        `;
        const fb = mount.querySelector('#vu3d-fallback-2d');
        if (fb) fb.addEventListener('click', () => this.switchTo2D());
      }
    })();

    return this.initPromise;
  }

  stepFloor(delta) {
    const idx = FLOOR_DEFINITIONS.findIndex(f => f.code === this.activeFloor);
    const curIdx = idx >= 0 ? idx : 2;
    const nextIdx = Math.max(0, Math.min(FLOOR_DEFINITIONS.length - 1, curIdx + delta));
    const nextCode = FLOOR_DEFINITIONS[nextIdx].code;
    this.activeFloor = nextCode;
    if (this.viewMode === 'building') this.viewMode = 'isolated';
    this.setFloorAndView(nextCode, this.viewMode);
  }

  setFloorAndView(floorCode, viewMode) {
    this.activeFloor = floorCode;
    this.viewMode = viewMode;
    const el = this.overlayEl;
    if (!el) return;

    el.querySelectorAll('.vu3d-view-btn[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === viewMode);
    });
    el.querySelectorAll('.vu3d-floor-pill').forEach(b => {
      const isAll = b.dataset.floor === 'ALL' && (viewMode === 'building' || viewMode === 'exploded');
      const isSel = b.dataset.floor === floorCode && viewMode !== 'building';
      b.classList.toggle('active', isAll || isSel);
      b.classList.toggle('has-pinned-dest', Boolean(this.selectedRoom && b.dataset.floor === this.selectedRoom.floor));
    });

    const lbl = el.querySelector('#vu3d-active-floor-label');
    if (lbl) {
      lbl.textContent = viewMode === 'building'
        ? 'All Floors (Basement 2 – Floor 9)'
        : `${formatFloorLabel(floorCode)} · ${viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}`;
    }

    const curPill = el.querySelector('#vu3d-current-floor-pill');
    if (curPill) {
      curPill.textContent = viewMode === 'building' ? 'All Floors' : formatFloorLabel(floorCode);
    }

    if (this.sceneManager) {
      if (viewMode === 'building' || viewMode === 'exploded') {
        this.sceneManager.setViewMode(viewMode, floorCode);
      } else {
        this.sceneManager.focusFloor(floorCode, viewMode, this.topDown);
      }
    }

    // Re-render card banner if destination is pinned on another floor
    if (this.selectedRoom) {
      this.renderSelectedCard(this.selectedRoom);
    }
  }

  render3DSearchResults(query) {
    const box = this.overlayEl.querySelector('#vu3d-search-results');
    const q = (query || '').trim();
    if (!q) {
      box.innerHTML = '';
      return;
    }
    const matches = searchRooms(q).slice(0, 10);
    if (!matches.length) {
      box.innerHTML = '<div class="vu3d-no-results">No matching rooms found.</div>';
      return;
    }
    box.innerHTML = matches.map(rm => {
      const isSelected = this.selectedRoom && this.selectedRoom.id === rm.id;
      return `
      <button type="button" class="vu3d-result-item ${isSelected ? 'selected-dest' : ''}" data-room-id="${rm.id}">
        <span class="vu3d-res-floor ${rm.floorClass || ''}">${formatFloorLabel(rm.floor)}</span>
        <div class="vu3d-res-meta">
          <strong>${rm.name}</strong>
          <small>Room ${rm.room} · ${rm.category}</small>
        </div>
        <span class="vu3d-res-go">${isSelected ? 'Pinned' : 'Locate →'}</span>
      </button>
    `;
    }).join('');

    box.querySelectorAll('.vu3d-result-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const rm = findRoomByIdOrAlias(btn.dataset.roomId);
        if (rm) {
          box.innerHTML = '';
          this.handleSelectRoom(rm, true);
        }
      });
    });
  }

  handleHoverRoom(rm, evt) {
    const tip = this.overlayEl.querySelector('#vu3d-hover-tooltip');
    if (!tip) return;
    if (!rm) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = `${rm.room !== '—' ? rm.room + ' · ' : ''}${rm.name} (${formatFloorLabel(rm.floor)})`;
    const rect = this.overlayEl.querySelector('.vu3d-canvas-area').getBoundingClientRect();
    tip.style.left = `${Math.min(evt.clientX - rect.left + 14, rect.width - 240)}px`;
    tip.style.top = `${Math.max(12, evt.clientY - rect.top - 32)}px`;
  }

  renderSelectedCard(rm) {
    if (!rm || !this.overlayEl) return;
    const card = this.overlayEl.querySelector('#vu3d-selected-card');
    if (!card) return;
    const fullFloor = formatFloorLabel(rm.floor);
    const verBadge = rm.verificationStatus === 'verified-svg'
      ? '<span class="vu3d-badge verified">✓ SVG Verified</span>'
      : rm.verificationStatus === 'under-construction'
        ? '<span class="vu3d-badge warn">🏗️ Under Renovation</span>'
        : '<span class="vu3d-badge est">⚠ Location Estimated / Verify On-Site</span>';

    const imgHtml = rm.image
      ? `<img src="${this.basePath}/${rm.image}" alt="${rm.name}" class="vu3d-room-thumb">`
      : '';

    const onOtherFloor = this.viewMode !== 'building' && rm.floor !== this.activeFloor;
    const pinnedBanner = onOtherFloor
      ? `<div class="vu3d-pinned-banner">
           <span>📍 Pinned on <strong>${fullFloor}</strong> (currently viewing ${formatFloorLabel(this.activeFloor)})</span>
           <button type="button" class="vu3d-jump-pinned" id="vu3d-jump-pinned">Show ${fullFloor}</button>
         </div>`
      : '';

    card.innerHTML = `
      ${pinnedBanner}
      <div class="vu3d-room-header">
        <div>
          <span class="vu3d-room-pill">${fullFloor} · ${rm.room}</span>
          <h3>${rm.name}</h3>
        </div>
        ${verBadge}
      </div>
      <p class="vu3d-room-dir">${rm.directionsText || ''}</p>
      ${rm.verificationNote ? `<p class="vu3d-ver-note">${rm.verificationNote}</p>` : ''}
      ${imgHtml}
      <div class="vu3d-room-actions">
        <button type="button" class="vu3d-nav-cta" id="vu3d-btn-navigate">
          🧭 Navigate Here in 3D
        </button>
        <a class="vu3d-2d-link" href="${this.basePath}/${(rm.anchor || `directions.html#${rm.id}`).replace(/^\.\.\//, '')}">
          Open in 2D Directory
        </a>
      </div>
    `;

    card.querySelector('#vu3d-btn-navigate').addEventListener('click', () => {
      this.startNavigationTo(rm);
    });
    const jumpBtn = card.querySelector('#vu3d-jump-pinned');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        this.activeFloor = rm.floor;
        if (this.viewMode === 'building') this.viewMode = 'isolated';
        this.setFloorAndView(rm.floor, this.viewMode);
        if (this.sceneManager) this.sceneManager.cameraController.flyToRoom(rm, this.topDown);
      });
    }
  }

  handleSelectRoom(rm, moveCamera = true) {
    if (!rm) return;
    this.selectedRoom = rm;
    this.activeFloor = rm.floor;
    if (this.viewMode === 'building') this.viewMode = 'cutaway';

    if (this.sceneManager) {
      this.sceneManager.selectRoom(rm.id, moveCamera);
    }
    this.setFloorAndView(rm.floor, this.viewMode);
    this.renderSelectedCard(rm);

    // Automatically render animated NFS-style route arrows when a destination is selected
    if (this.sceneManager && rm.id !== this.startRoomId) {
      this.startNavigationTo(rm, { keepFocusOnRoom: true, preserveViewMode: true });
    }
  }

  startNavigationTo(destRoom, options = {}) {
    if (!this.sceneManager || !destRoom) return;
    this.stopWalkthrough();

    const route = this.sceneManager.calculateRoute(this.startRoomId, destRoom.id, this.routeMode, options);
    if (!route) return;
    this.currentRoute = route;
    this.activeStepIdx = 0;

    if (!options.preserveViewMode) {
      this.activeFloor = this.sceneManager.building.activeFloorCode;
      this.viewMode = this.sceneManager.building.viewMode;
      this.setFloorAndView(this.activeFloor, this.viewMode);
    }

    // Update right rail indicators to highlight route floors
    this.overlayEl.querySelectorAll('.vu3d-floor-pill').forEach(b => {
      b.classList.toggle('in-route', route.floorsVisited.includes(b.dataset.floor));
    });

    const panel = this.overlayEl.querySelector('#vu3d-directions-panel');
    const stats = this.overlayEl.querySelector('#vu3d-route-stats');
    const list = this.overlayEl.querySelector('#vu3d-steps-list');
    const bottomBar = this.overlayEl.querySelector('#vu3d-bottom-bar');

    panel.hidden = false;
    bottomBar.hidden = false;
    stats.textContent = `${route.distanceMeters}m · ~${route.estimatedSeconds}s (${route.mode})`;

    list.innerHTML = route.steps.map((s, idx) => `
      <li class="vu3d-step-item ${idx === 0 ? 'active' : ''} ${s.kind === 'notice' ? 'notice' : ''}" data-step-idx="${idx}">
        <span class="vu3d-step-fl">${formatFloorLabel(s.floor)}</span>
        <span>${s.instruction}</span>
      </li>
    `).join('');

    list.querySelectorAll('.vu3d-step-item').forEach(li => {
      li.addEventListener('click', () => {
        this.goToStep(Number(li.dataset.stepIdx));
      });
    });

    this.goToStep(0, Boolean(options.keepFocusOnRoom));
  }

  goToStep(idx, skipCameraMove = false) {
    if (!this.currentRoute || !this.currentRoute.steps.length) return;
    const steps = this.currentRoute.steps;
    this.activeStepIdx = Math.max(0, Math.min(idx, steps.length - 1));
    const step = steps[this.activeStepIdx];

    this.overlayEl.querySelectorAll('.vu3d-step-item').forEach((li, i) => {
      li.classList.toggle('active', i === this.activeStepIdx);
      if (i === this.activeStepIdx) li.scrollIntoView({ block: 'nearest' });
    });

    this.overlayEl.querySelector('#vu3d-step-floor-pill').textContent = formatFloorLabel(step.floor);
    this.overlayEl.querySelector('#vu3d-step-text').textContent = step.instruction;

    if (this.sceneManager) {
      const targetFloor = step.toFloor || step.floor;
      if (!skipCameraMove) {
        if (this.viewMode === 'isolated' || this.viewMode === 'cutaway') {
          this.sceneManager.setViewMode(this.viewMode, targetFloor);
        }
        this.sceneManager.cameraController.focusOnRouteStep(step);
      }
      this.sceneManager.building.moveElevatorCabToFloor(targetFloor);
      this.sceneManager.routeRenderer.highlightStep(step);
      this.sceneManager.roomManager.refreshSelectionPosition();
    }
  }

  toggleWalkthrough() {
    const btn = this.overlayEl.querySelector('#vu3d-play-route');
    if (this.walkthroughTimer) {
      this.stopWalkthrough();
      return;
    }
    if (!this.currentRoute) return;
    btn.textContent = '⏸ Pause';
    this.walkthroughTimer = setInterval(() => {
      if (this.activeStepIdx >= this.currentRoute.steps.length - 1) {
        this.stopWalkthrough();
        return;
      }
      this.goToStep(this.activeStepIdx + 1);
    }, 2400);
  }

  stopWalkthrough() {
    if (this.walkthroughTimer) {
      clearInterval(this.walkthroughTimer);
      this.walkthroughTimer = null;
    }
    const btn = this.overlayEl && this.overlayEl.querySelector('#vu3d-play-route');
    if (btn) btn.textContent = '▶ Follow';
  }

  clearRoute() {
    this.stopWalkthrough();
    this.currentRoute = null;
    if (this.sceneManager) this.sceneManager.clearRoute();
    if (this.overlayEl) {
      this.overlayEl.querySelector('#vu3d-directions-panel').hidden = true;
      this.overlayEl.querySelector('#vu3d-bottom-bar').hidden = true;
      this.overlayEl.querySelectorAll('.vu3d-floor-pill').forEach(b => b.classList.remove('in-route'));
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.__VU_NAVIGATOR__ = new NavigatorController();
});
