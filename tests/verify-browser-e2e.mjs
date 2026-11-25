// End-to-End Headless Chrome CDP Verification for Victoria University 2D + 3D Indoor Navigator
// Run with: node tests/verify-browser-e2e.mjs

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(reqUrl.pathname);
      if (pathname === '/') pathname = '/index.html';
      if (pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      const filePath = path.resolve(rootDir, '.' + pathname);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(404);
          res.end(`Not Found: ${pathname}`);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function findChromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Could not find Chrome or Edge executable for headless E2E verification.');
}

function launchChrome(exePath, userDataDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      exePath,
      [
        '--headless=new',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-angle=swiftshader',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-gpu-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );

    let stderrBuf = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timed out waiting for Chrome DevTools URL. Stderr:\n${stderrBuf}`));
    }, 15000);

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        const wsUrl = new URL(m[1]);
        resolve({ proc, debugOrigin: `http://127.0.0.1:${wsUrl.port}` });
      }
    });

    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited prematurely (${code}). Stderr:\n${stderrBuf}`));
    });
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (err) => reject(err.error || new Error('WebSocket error')));
      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data.toString());
        if (msg.id) {
          const entry = this.pending.get(msg.id);
          if (entry) {
            this.pending.delete(msg.id);
            if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
            else entry.resolve(msg.result);
          }
        } else if (msg.method) {
          const handlers = this.listeners.get(msg.method) || [];
          for (const h of handlers) h(msg.params);
        }
      });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'JS evaluation error';
      throw new Error(desc);
    }
    return res.result?.value;
  }

  async waitFor(fnExpr, timeoutMs = 12000, label = fnExpr) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.eval(`Boolean(${fnExpr})`);
      if (ok) return;
      await new Promise(r => setTimeout(r, 120));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${label}`);
  }

  async navigate(url) {
    const loadPromise = new Promise((resolve) => {
      const handler = () => {
        const arr = this.listeners.get('Page.loadEventFired') || [];
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        resolve();
      };
      this.on('Page.loadEventFired', handler);
    });
    await this.send('Page.navigate', { url });
    await loadPromise;
    await new Promise(r => setTimeout(r, 200));
  }

  close() {
    try {
      this.ws?.close();
    } catch (_) {}
  }
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}\n   -> ${err.message}`);
    process.exitCode = 1;
    throw err;
  }
}

async function run() {
  console.log('Running Victoria University 2D + 3D Headless Chrome E2E Suite...\n');

  const { server, baseUrl } = await startStaticServer(REPO_ROOT);
  const chromeExe = findChromeExecutable();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vu-chrome-e2e-'));
  let chromeProc = null;
  let cdp = null;

  try {
    const launched = await launchChrome(chromeExe, profileDir);
    chromeProc = launched.proc;

    const targetsRes = await fetch(`${launched.debugOrigin}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    assert.ok(pageTarget && pageTarget.webSocketDebuggerUrl, 'No Chrome page target found');

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const consoleErrors = [];
    const pageExceptions = [];
    const httpFailures = [];

    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type === 'error') {
        const text = (params.args || []).map(a => a.value || a.description || '').join(' ');
        consoleErrors.push(text);
      }
    });
    cdp.on('Runtime.exceptionThrown', (params) => {
      const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Uncaught exception';
      pageExceptions.push(desc);
    });
    cdp.on('Network.responseReceived', (params) => {
      const url = params.response?.url || '';
      if (url.startsWith(baseUrl) && params.response.status >= 400) {
        httpFailures.push(`${params.response.status} ${url}`);
      }
    });

    const resetErrors = () => {
      consoleErrors.length = 0;
      pageExceptions.length = 0;
      httpFailures.length = 0;
    };

    const assertNoBrowserErrors = (ctxLabel) => {
      assert.equal(httpFailures.length, 0, `${ctxLabel}: HTTP failures: ${httpFailures.join('; ')}`);
      assert.equal(pageExceptions.length, 0, `${ctxLabel}: Uncaught page exceptions: ${pageExceptions.join('; ')}`);
      assert.equal(consoleErrors.length, 0, `${ctxLabel}: Console errors: ${consoleErrors.join('; ')}`);
    };

    // 1. Desktop (1280x800) on index.html
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await test('Desktop index.html loads with 2D/3D toggle and working 2D search', async () => {
      resetErrors();
      await cdp.navigate(`${baseUrl}/index.html`);
      await cdp.waitFor("document.getElementById('btn-mode-2d') && document.getElementById('btn-mode-3d')");

      // Trigger 2D globalSearch
      const resultText = await cdp.eval(`(() => {
        const input = document.getElementById('globalSearch');
        input.value = '305';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const box = document.getElementById('searchResults');
        return box ? box.innerText : '';
      })()`);
      assert.ok(resultText.includes('305'), `Expected 2D search results for 305, got: ${resultText}`);
      assertNoBrowserErrors('Desktop 2D index.html');
    });

    await test('Switching to 3D MAP builds 12 floors, 129 rooms, and renders non-blank WebGL canvas', async () => {
      resetErrors();
      await cdp.eval("document.getElementById('btn-mode-3d').click()");
      await cdp.waitFor("document.getElementById('vu-3d-overlay')?.classList.contains('open')");
      await cdp.waitFor("window.__VU_NAVIGATOR__?.sceneManager?.building?.floors?.size === 12", 15000, 'SceneManager 12 floors ready');

      const info = await cdp.eval(`(() => {
        const nav = window.__VU_NAVIGATOR__;
        const sm = nav.sceneManager;
        const canvas = sm.renderer?.domElement;
        const rect = canvas ? canvas.getBoundingClientRect() : { width: 0, height: 0 };
        return {
          is3DActive: nav.is3DActive,
          floorsCount: sm.building.floors.size,
          roomsCount: sm.building.roomMeshById.size,
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0,
          clientWidth: rect.width,
          clientHeight: rect.height,
        };
      })()`);

      assert.equal(info.is3DActive, true);
      assert.equal(info.floorsCount, 12);
      assert.equal(info.roomsCount, 129);
      assert.ok(info.canvasWidth > 0 && info.canvasHeight > 0, `Canvas has zero pixel dimensions: ${JSON.stringify(info)}`);
      assert.ok(info.clientWidth > 0 && info.clientHeight > 0, `Canvas has zero layout dimensions: ${JSON.stringify(info)}`);
      assertNoBrowserErrors('3D initialization');
    });

    await test('3D view modes (isolated, cutaway, exploded, building, top-down, reset) and floor selector pills work cleanly', async () => {
      resetErrors();
      const modes = ['isolated', 'cutaway', 'exploded', 'building'];
      for (const m of modes) {
        await cdp.eval(`document.querySelector('.vu3d-view-btn[data-view="${m}"]').click()`);
        const activeMode = await cdp.eval("window.__VU_NAVIGATOR__.viewMode");
        assert.equal(activeMode, m);
      }

      await cdp.eval("document.querySelector('.vu3d-floor-pill[data-floor=\"3\"]').click()");
      const afterF3 = await cdp.eval("({ floor: window.__VU_NAVIGATOR__.activeFloor, mode: window.__VU_NAVIGATOR__.viewMode })");
      assert.equal(afterF3.floor, '3');
      assert.equal(afterF3.mode, 'isolated');

      await cdp.eval("document.getElementById('vu3d-btn-topdown').click()");
      assert.equal(await cdp.eval("window.__VU_NAVIGATOR__.topDown"), true);
      await cdp.eval("document.getElementById('vu3d-btn-reset').click()");
      assert.equal(await cdp.eval("window.__VU_NAVIGATOR__.topDown"), false);

      await cdp.eval("document.querySelector('.vu3d-floor-pill[data-floor=\"ALL\"]').click()");
      assert.equal(await cdp.eval("window.__VU_NAVIGATOR__.viewMode"), 'building');
      assertNoBrowserErrors('3D view modes & floor pills');
    });

    await test('3D Search selects Room 305 and generates Elevator + Stairs routes from Main Entrance with interactive steps', async () => {
      resetErrors();
      await cdp.eval(`(() => {
        const input = document.getElementById('vu3d-search-input');
        input.value = '305';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await cdp.waitFor("document.querySelector('.vu3d-result-item[data-room-id=\"room-305\"]')");
      await cdp.eval("document.querySelector('.vu3d-result-item[data-room-id=\"room-305\"]').click()");

      const selectedId = await cdp.eval("window.__VU_NAVIGATOR__.selectedRoom?.id");
      assert.equal(selectedId, 'room-305');
      await cdp.waitFor("document.getElementById('vu3d-btn-navigate')");

      // Navigate (default elevator mode)
      await cdp.eval("document.getElementById('vu3d-btn-navigate').click()");
      await cdp.waitFor("window.__VU_NAVIGATOR__.currentRoute !== null");

      const elevRouteInfo = await cdp.eval(`(() => {
        const nav = window.__VU_NAVIGATOR__;
        return {
          mode: nav.currentRoute.mode,
          stepCount: document.querySelectorAll('#vu3d-steps-list .vu3d-step-item').length,
          bottomVisible: !document.getElementById('vu3d-bottom-bar').hidden,
          routeChildren: nav.sceneManager.routeRenderer.routeGroup.children.length,
          floorsVisited: nav.currentRoute.floorsVisited,
        };
      })()`);
      assert.equal(elevRouteInfo.mode, 'elevator');
      assert.ok(elevRouteInfo.stepCount >= 4, `Expected >= 4 route steps, got ${elevRouteInfo.stepCount}`);
      assert.equal(elevRouteInfo.bottomVisible, true);
      assert.ok(elevRouteInfo.routeChildren > 0, 'Expected 3D route meshes rendered in routeGroup');
      assert.deepEqual(elevRouteInfo.floorsVisited, ['G', '1', '2', '3']);

      // Switch vertical mode to stairs
      await cdp.eval("document.querySelector('.vu3d-vmode[data-vmode=\"stairs\"]').click()");
      const stairsMode = await cdp.eval("window.__VU_NAVIGATOR__.currentRoute?.mode");
      assert.equal(stairsMode, 'stairs');

      // Advance step
      const idxBefore = await cdp.eval("window.__VU_NAVIGATOR__.activeStepIdx");
      await cdp.eval("document.getElementById('vu3d-next-step').click()");
      const idxAfter = await cdp.eval("window.__VU_NAVIGATOR__.activeStepIdx");
      assert.equal(idxAfter, idxBefore + 1);
      assertNoBrowserErrors('3D search & routing');
    });

    await test('Ground Floor Reception relocation, Purple Elevator Cores, Basement B1/B2 Isolation, Persistent Pin, NFS Animated Arrows, Full Labels & Dark Mode', async () => {
      resetErrors();
      const scratchDir = 'C:\\Users\\jeis\\.gemini\\antigravity\\brain\\edef16da-96f0-48d9-b90a-a379bec4162a\\scratch';
      fs.mkdirSync(scratchDir, { recursive: true });
      const snap = async (filename) => {
        await new Promise(r => setTimeout(r, 850));
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(scratchDir, filename), Buffer.from(data, 'base64'));
      };

      // 1. Check full human-readable labels across floor rail & bottom step bar
      const labelAudit = await cdp.eval(`(() => {
        const pills = [...document.querySelectorAll('.vu3d-floor-rail .vu3d-floor-pill')].map(b => b.textContent.trim());
        const stepPill = document.getElementById('vu3d-step-floor-pill')?.textContent.trim();
        return { pills, stepPill };
      })()`);
      assert.deepEqual(labelAudit.pills, [
        'All Floors', 'Floor 9', 'Floor 8', 'Floor 7', 'Floor 6', 'Floor 5',
        'Floor 4', 'Floor 3', 'Floor 2', 'Floor 1', 'Ground Floor', 'Basement 1', 'Basement 2',
      ]);
      assert.ok(!/^FL\s*\d+$|^FL\s*G$|^B[12]$|^G$/.test(labelAudit.stepPill), `Step floor pill used abbreviation: ${labelAudit.stepPill}`);

      // 2. Check Ground Floor Reception coordinates & Elevator purple cores across all 12 levels
      const archAudit = await cdp.eval(`(() => {
        const nav = window.__VU_NAVIGATOR__;
        const sm = nav.sceneManager;
        const recMesh = sm.building.roomMeshById.get('reception');
        const elevCount = [...sm.building.floors.values()].filter(f => {
          let found = false;
          f.group.traverse(o => { if (o.userData?.isElevatorCore) found = true; });
          return found;
        }).length;
        return {
          recX: recMesh ? recMesh.position.x : null,
          recZ: recMesh ? recMesh.position.z : null,
          elevCount,
        };
      })()`);
      assert.ok(archAudit.recX > 0.5 && archAudit.recX < 1.5 && archAudit.recZ < -12, `Unexpected reception position: ${JSON.stringify(archAudit)}`);
      assert.equal(archAudit.elevCount, 12, 'Expected purple elevator core on all 12 levels');

      // Switch explicitly to Isolate Floor mode and test Ground Floor + Basements B2 & B1 + all 12 levels
      await cdp.eval("document.querySelector('.vu3d-view-btn[data-view=\"isolated\"]').click()");
      await cdp.eval("document.querySelector('.vu3d-floor-pill[data-floor=\"G\"]').click()");
      await snap('verify_ground_reception.png');

      // 3. Test Basement 2 & Basement 1 isolation hides Ground Plaza and all upper floors cleanly
      await cdp.eval("document.querySelector('.vu3d-floor-pill[data-floor=\"B2\"]').click()");
      await snap('verify_basement2_isolated.png');

      for (const fCode of ['B2', 'B1', 'G', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        await cdp.eval(`document.querySelector('.vu3d-floor-pill[data-floor="${fCode}"]').click()`);
        const vis = await cdp.eval(`(() => {
          const b = window.__VU_NAVIGATOR__.sceneManager.building;
          const visibleFloors = [...b.floors.entries()].filter(([, e]) => e.group.visible).map(([k]) => k);
          return {
            mode: window.__VU_NAVIGATOR__.viewMode,
            visibleFloors,
            plazaVisible: b.groundPlazaGroup.visible,
            verticalCoreVisible: b.verticalCoreGroup.visible,
          };
        })()`);
        assert.equal(vis.mode, 'isolated');
        assert.deepEqual(vis.visibleFloors, [fCode]);
        assert.equal(vis.plazaVisible, false, `Ground plaza must be hidden when isolating ${fCode}`);
        assert.equal(vis.verticalCoreVisible, false);
      }

      // Return to Basement 1 for persistence check (so destination Room 305 on Floor 3 is currently hidden)
      await cdp.eval("document.querySelector('.vu3d-floor-pill[data-floor=\"B1\"]').click()");

      // 4. Test Isolate Floor works on all 12 levels & destination pin persists across floor changes
      // Room 305 is still selected from earlier test
      const pinCheckWhileHidden = await cdp.eval(`(() => {
        const nav = window.__VU_NAVIGATOR__;
        const rmMgr = nav.sceneManager.roomManager;
        return {
          selectedRoomId: nav.selectedRoom?.id,
          rmMgrSelectedId: rmMgr.selectedRoomId,
          pinVisibleOnB1: rmMgr.highlightGroup.visible,
          bannerText: document.querySelector('.vu3d-pinned-banner')?.innerText || '',
        };
      })()`);
      assert.equal(pinCheckWhileHidden.selectedRoomId, 'room-305');
      assert.equal(pinCheckWhileHidden.rmMgrSelectedId, 'room-305');
      assert.equal(pinCheckWhileHidden.pinVisibleOnB1, false, 'Pin should hide when destination floor is not visible');
      assert.ok(pinCheckWhileHidden.bannerText.includes('Pinned on Floor 3'), `Missing cross-floor pinned banner: ${pinCheckWhileHidden.bannerText}`);

      // Jump back to Floor 3 via pinned banner CTA & verify pin + animated arrows restore
      await cdp.eval("document.getElementById('vu3d-jump-pinned').click()");
      const pinRestored = await cdp.eval(`(() => {
        const nav = window.__VU_NAVIGATOR__;
        const sm = nav.sceneManager;
        const rr = sm.routeRenderer;
        const arrows = rr.arrowMeshes;
        const emBefore = arrows.find(a => a.visible)?.material.emissiveIntensity ?? 0;
        rr.update(0.35);
        const emAfter = arrows.find(a => a.visible)?.material.emissiveIntensity ?? 0;
        return {
          activeFloor: nav.activeFloor,
          pinVisible: sm.roomManager.highlightGroup.visible,
          arrowCount: arrows.length,
          visibleArrows: arrows.filter(a => a.visible).length,
          emissiveChanged: Math.abs(emAfter - emBefore) > 0.001,
        };
      })()`);
      assert.equal(pinRestored.activeFloor, '3');
      assert.equal(pinRestored.pinVisible, true, 'Destination pin must restore when returning to Floor 3');
      assert.ok(pinRestored.arrowCount >= 5 && pinRestored.visibleArrows >= 1, `Expected visible NFS arrows: ${JSON.stringify(pinRestored)}`);
      assert.equal(pinRestored.emissiveChanged, true, 'Expected animated arrow pulse update over time');
      await snap('verify_floor3_pin_arrows.png');

      // 5. Test Dark Mode persistence + 3D background theme update + Light Mode toggle back (plain text labels)
      assert.equal(await cdp.eval("document.getElementById('vu3d-theme-toggle').textContent.trim()"), 'Dark');
      await cdp.eval("document.getElementById('vu3d-theme-toggle').click()");
      const darkState = await cdp.eval(`(() => ({
        attr: document.documentElement.getAttribute('data-theme'),
        stored: localStorage.getItem('vu_theme_v1'),
        bgHex: window.__VU_NAVIGATOR__.sceneManager.scene.background.getHex(),
        btnText: document.getElementById('vu3d-theme-toggle').textContent.trim(),
        headerBtnText: document.getElementById('vu-theme-toggle').textContent.trim(),
      }))()`);
      assert.equal(darkState.attr, 'dark');
      assert.equal(darkState.stored, 'dark');
      assert.equal(darkState.bgHex, 0x0b1325);
      assert.equal(darkState.btnText, 'Light');
      assert.equal(darkState.headerBtnText, 'Light');
      await snap('verify_dark_mode_3d.png');

      await cdp.eval("document.getElementById('vu3d-theme-toggle').click()");
      assert.equal(await cdp.eval("localStorage.getItem('vu_theme_v1')"), 'light');
      assert.equal(await cdp.eval("document.getElementById('vu3d-theme-toggle').textContent.trim()"), 'Dark');

      // Exit back to 2D MAP
      await cdp.eval("document.getElementById('btn-mode-2d').click()");
      const stillOpen = await cdp.eval("document.getElementById('vu-3d-overlay').classList.contains('open')");
      assert.equal(stillOpen, false);
      assertNoBrowserErrors('Section 8 full verification');
    });

    // 2. Mobile (390x844) on directions.html & floors/floor-3.html
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });

    await test('Mobile directions.html: Navigate in 3D button opens Room 305 and mobile panel toggle works', async () => {
      resetErrors();
      await cdp.navigate(`${baseUrl}/directions.html`);
      await cdp.waitFor("document.querySelector('#room-305 .card-3d-link')");
      await cdp.eval("document.querySelector('#room-305 .card-3d-link').click()");
      await cdp.waitFor("document.getElementById('vu-3d-overlay')?.classList.contains('open')");
      await cdp.waitFor("window.__VU_NAVIGATOR__?.sceneManager?.building?.floors?.size === 12", 15000);

      const sel = await cdp.eval("window.__VU_NAVIGATOR__.selectedRoom?.id");
      assert.equal(sel, 'room-305');

      const mobileStateBefore = await cdp.eval("document.getElementById('vu3d-left-panel').classList.contains('mobile-open')");
      await cdp.eval("document.getElementById('vu3d-mobile-panel-toggle').click()");
      const mobileStateAfter = await cdp.eval("document.getElementById('vu3d-left-panel').classList.contains('mobile-open')");
      assert.equal(mobileStateAfter, !mobileStateBefore);
      assertNoBrowserErrors('Mobile directions.html');
    });

    await test('Mobile floors/floor-3.html: Explore in 3D button opens isolated Floor 3', async () => {
      resetErrors();
      await cdp.navigate(`${baseUrl}/floors/floor-3.html`);
      await cdp.waitFor("document.querySelector('.floor-3d-cta')", 10000, '.floor-3d-cta on floor-3.html');
      await cdp.eval("document.querySelector('.floor-3d-cta').click()");
      await cdp.waitFor("document.getElementById('vu-3d-overlay')?.classList.contains('open')");
      await cdp.waitFor("window.__VU_NAVIGATOR__?.sceneManager?.building?.floors?.size === 12", 15000);

      const state = await cdp.eval("({ floor: window.__VU_NAVIGATOR__.activeFloor, mode: window.__VU_NAVIGATOR__.viewMode })");
      assert.equal(state.floor, '3');
      assert.equal(state.mode, 'isolated');
      assertNoBrowserErrors('Mobile floor-3.html');
    });

    // 3. Graceful WebGL Fallback Test
    await test('WebGL-disabled browser displays .vu3d-webgl-fallback cleanly with zero uncaught exceptions', async () => {
      resetErrors();
      const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          const origGetContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            if (typeof type === 'string' && type.toLowerCase().includes('webgl')) {
              return null;
            }
            return origGetContext.call(this, type, ...args);
          };
        `,
      });

      try {
        await cdp.navigate(`${baseUrl}/index.html`);
        await cdp.waitFor("document.getElementById('btn-mode-3d')");
        await cdp.eval("document.getElementById('btn-mode-3d').click()");
        await cdp.waitFor("document.querySelector('.vu3d-webgl-fallback') !== null", 10000, 'WebGL fallback card');

        const fbText = await cdp.eval("document.querySelector('.vu3d-webgl-fallback').innerText");
        assert.ok(fbText.includes('3D View Unavailable'), `Unexpected fallback text: ${fbText}`);
        assert.equal(await cdp.eval("window.__VU_NAVIGATOR__.sceneManager"), null);
        assert.equal(pageExceptions.length, 0, `Unexpected uncaught exceptions on WebGL fallback: ${pageExceptions.join('; ')}`);

        // Return to 2D button in fallback works
        await cdp.eval("document.getElementById('vu3d-fallback-2d').click()");
        assert.equal(await cdp.eval("document.getElementById('vu-3d-overlay').classList.contains('open')"), false);
      } finally {
        await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
    });

    console.log(`\nSummary: ${passed} E2E browser checks passed cleanly.`);
  } finally {
    if (cdp) cdp.close();
    if (chromeProc) {
      try {
        chromeProc.kill();
      } catch (_) {}
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_) {}
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch((err) => {
  console.error('\nE2E suite aborted:', err);
  process.exit(1);
});
