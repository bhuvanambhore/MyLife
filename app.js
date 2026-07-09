/* ═══════════════════════════════════════════════════════════════
   MY LIFE OS v3.0 — CORE APPLICATION ENGINE
   ─────────────────────────────────────────────────────────────
   Responsibilities:
     • MLO.Storage   — persistence layer (localStorage today,
                        swappable for SQLite/IndexedDB tomorrow)
     • MLO.Router    — hash-based SPA routing between modules
     • MLO.App       — shell wiring: sidebar, bottom nav, FAB,
                        theme, search, splash, Android back button
   Every module registers itself via MLO.registerModule(def) and
   is rendered into #app-main by the router. See modules/*.js.
═══════════════════════════════════════════════════════════════ */

// MLO is initialised by the inline bootstrap script in index.html.
// Modules have already called MLO.registerModule() by the time this
// file executes, so we must NOT reassign window.MLO here.
const MLO = window.MLO;

/* ═══════════════════════════════════════════
   1. STORAGE LAYER
   A small table-oriented abstraction over localStorage.
   Every module reads/writes through this object only — never
   touches `localStorage` directly. That means the day this app
   moves into an Android WebView with a real SQLite backend, only
   the internals below need to change; every module keeps working.
══════════════════════════════════════════ */
MLO.Storage = (function () {
  const NS = 'mlo_v3_';
  const memCache = {}; // in-memory mirror to avoid repeated JSON.parse

  function readRaw(key) {
    if (key in memCache) return memCache[key];
    try {
      const raw = localStorage.getItem(NS + key);
      memCache[key] = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[MLO.Storage] read failed for', key, e);
      memCache[key] = null;
    }
    return memCache[key];
  }

  function writeRaw(key, value) {
    memCache[key] = value;
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('[MLO.Storage] write failed for', key, e);
      MLO.Toast && MLO.Toast.error('Storage full — could not save');
      return false;
    }
  }

  /** Generates a reasonably unique id (timestamp + random base36). */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    /** Raw key/value get with default fallback. */
    get(key, fallback = null) {
      const v = readRaw(key);
      return v === null || v === undefined ? fallback : v;
    },
    /** Raw key/value set. */
    set(key, value) {
      return writeRaw(key, value);
    },
    remove(key) {
      delete memCache[key];
      localStorage.removeItem(NS + key);
    },

    /* ── Collection ("table") helpers ──────────────────────────
       These treat a stored array as a table of records, each with
       an `id`. This is intentionally shaped like simple ORM calls
       so swapping to SQL later (SELECT/INSERT/UPDATE/DELETE) is a
       mechanical rename rather than a rewrite of module logic.   */
    getCollection(name) {
      return this.get(name, []);
    },
    setCollection(name, arr) {
      return this.set(name, arr);
    },
    insert(name, record) {
      const list = this.getCollection(name);
      const withId = Object.assign({ id: generateId(), createdAt: Date.now() }, record);
      list.unshift(withId);
      this.setCollection(name, list);
      return withId;
    },
    update(name, id, patch) {
      const list = this.getCollection(name);
      const idx = list.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      list[idx] = Object.assign({}, list[idx], patch, { updatedAt: Date.now() });
      this.setCollection(name, list);
      return list[idx];
    },
    delete(name, id) {
      const list = this.getCollection(name);
      const next = list.filter((r) => r.id !== id);
      this.setCollection(name, next);
      return next.length !== list.length;
    },
    findById(name, id) {
      return this.getCollection(name).find((r) => r.id === id) || null;
    },
    find(name, predicate) {
      return this.getCollection(name).filter(predicate);
    },
    generateId,

    /** Returns approx bytes used by this app's namespace (for Backup module). */
    estimateUsage() {
      let bytes = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS)) bytes += (localStorage.getItem(k) || '').length;
      }
      return bytes;
    },

    /** Dumps every MLO key into a plain object (for export/backup). */
    exportAll() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS)) {
          try { out[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k)); }
          catch (e) { /* skip corrupt entry */ }
        }
      }
      return out;
    },

    /** Restores from a plain object produced by exportAll(). */
    importAll(obj) {
      Object.keys(obj).forEach((k) => writeRaw(k, obj[k]));
    },

    NS,
  };
})();

/* ═══════════════════════════════════════════
   2. MODULE REGISTRY
   MLO.modules and MLO.registerModule are defined in the inline
   bootstrap <script> in index.html so they exist before any
   module file loads. By the time we reach this line all 15
   modules have already registered themselves — do NOT reset here.
══════════════════════════════════════════ */
// Module contract (each modules/*.js file calls MLO.registerModule):
// { id, label, icon, render(container), onShow?, getFabAction?, search? }

/* ═══════════════════════════════════════════
   3. ROUTER
══════════════════════════════════════════ */
MLO.Router = (function () {
  let current = null;

  function parseHash() {
    const hash = location.hash.replace('#/', '').replace('#', '');
    return hash || 'dashboard';
  }

  function navigate(moduleId, { replace = false } = {}) {
    if (!MLO.modules[moduleId]) moduleId = 'dashboard';
    if (replace) location.replace('#/' + moduleId);
    else location.hash = '/' + moduleId;
  }

  function renderCurrent() {
    const id = parseHash();
    const mod = MLO.modules[id] || MLO.modules['dashboard'];
    if (!mod) {
      // Modules failed to register — show a visible error instead of a
      // frozen spinner so it's obvious on-device what went wrong.
      const main = document.getElementById('app-main');
      if (main) main.innerHTML = `
        <div class="empty-state" style="padding:40px 24px;">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Modules not loaded</div>
          <div class="empty-desc" style="max-width:300px;">
            No modules registered (found ${Object.keys(MLO.modules).length}).
            Make sure all files in <code>components/</code> and
            <code>modules/</code> are present next to index.html and
            reload the page.
          </div>
        </div>`;
      return;
    }

    current = mod.id;
    const main = document.getElementById('app-main');
    main.scrollTop = 0;

    document.getElementById('hdr-title').textContent = mod.label;
    MLO.App.setActiveNav(mod.id);
    MLO.App.updateFab(mod);

    main.innerHTML = '<div class="module-loading"><div class="spinner"></div></div>';

    // Defer to next frame so the loading spinner actually paints on slow devices.
    requestAnimationFrame(() => {
      main.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'page-enter';

      // ── CRITICAL: append wrap BEFORE calling render() ──────────────
      // If render() runs while wrap is detached, any document.getElementById()
      // call inside it returns null (elements in a detached subtree are not in
      // the document). Tasks, Calendar, Office and Expenses all use this pattern
      // for their sub-tab content divs, causing "null.innerHTML" TypeErrors.
      // Appending first makes getElementById work like every module expects.
      main.appendChild(wrap);

      try {
        mod.render(wrap);
      } catch (err) {
        console.error('[MLO.Router] render error in module', mod.id, err);
        // Show the actual error so it is visible on-device without a console.
        wrap.innerHTML = `<div class="empty-state">
          <div class="empty-icon">⚠️</div>
          <div class="empty-title">Something went wrong</div>
          <div class="empty-desc" style="font-family:monospace;font-size:12px;word-break:break-all;">
            ${mod.id}: ${err && err.message ? err.message : String(err)}
          </div>
        </div>`;
      }
      if (typeof mod.onShow === 'function') mod.onShow();
    });
  }

  function init() {
    window.addEventListener('hashchange', renderCurrent);
    renderCurrent();
  }

  return { init, navigate, renderCurrent, get current() { return current; } };
})();

/* ═══════════════════════════════════════════
   4. APP SHELL (theme, nav, fab, search, splash, back button)
══════════════════════════════════════════ */
MLO.App = (function () {
  /* Order here defines sidebar order; `inBottomNav` filters the bottom 5 */
  const NAV_ORDER = [
    'dashboard', 'habits', 'tasks', 'calendar', 'office',
    'expenses', 'notes', 'mytube', 'links', 'health',
    'goals', 'ai-assistant', 'analytics', 'backup', 'security',
  ];

  /* ── THEME ───────────────────────────────────────────────── */
  function initTheme() {
    const saved = MLO.Storage.get('theme', 'dark');
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    MLO.Storage.set('theme', next);
    updateThemeIcon(next);
    // Re-render current module so any canvases re-paint with new theme colors.
    MLO.Router.renderCurrent();
  }

  function updateThemeIcon(theme) {
    document.querySelector('.icon-moon').classList.toggle('hidden', theme === 'light');
    document.querySelector('.icon-sun').classList.toggle('hidden', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0A0A14' : '#F3F0FF');
  }

  /* ── SIDEBAR + BOTTOM NAV ────────────────────────────────── */
  function buildNav() {
    const sideNav = document.getElementById('sidebar-nav');
    const bottomNav = document.getElementById('bottom-nav');
    sideNav.innerHTML = '';
    bottomNav.innerHTML = '';

    const primaryIds = ['dashboard', 'tasks', 'calendar', 'notes', 'goals'];

    NAV_ORDER.forEach((id) => {
      const mod = MLO.modules[id];
      if (!mod) return;

      const item = document.createElement('div');
      item.className = 'sidebar-item';
      item.dataset.module = id;
      item.innerHTML = `<span class="s-icon">${mod.icon}</span><span>${mod.label}</span>`;
      item.addEventListener('click', () => { MLO.Router.navigate(id); closeSidebar(); });
      sideNav.appendChild(item);
    });

    primaryIds.forEach((id) => {
      const mod = MLO.modules[id];
      if (!mod) return;
      const item = document.createElement('div');
      item.className = 'bnav-item';
      item.dataset.module = id;
      item.innerHTML = `<span class="bnav-icon">${mod.icon}</span><span class="bnav-label">${mod.label}</span>`;
      item.addEventListener('click', () => MLO.Router.navigate(id));
      bottomNav.appendChild(item);
    });
  }

  function setActiveNav(moduleId) {
    document.querySelectorAll('.sidebar-item').forEach((el) =>
      el.classList.toggle('active', el.dataset.module === moduleId)
    );
    document.querySelectorAll('.bnav-item').forEach((el) =>
      el.classList.toggle('active', el.dataset.module === moduleId)
    );
  }

  /* ── SIDEBAR OPEN/CLOSE ──────────────────────────────────── */
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('visible');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('visible');
  }

  /* ── FAB ─────────────────────────────────────────────────── */
  let fabOpen = false;
  function updateFab(mod) {
    const fab = document.getElementById('fab');
    const menu = document.getElementById('fab-menu');
    fabOpen = false;
    fab.classList.remove('open');
    menu.classList.add('hidden');
    menu.innerHTML = '';

    const action = typeof mod.getFabAction === 'function' ? mod.getFabAction() : null;
    fab.style.display = action ? 'flex' : 'none';
    fab.onclick = action ? action.onClick : null;
  }

  function bindFab() {
    document.getElementById('fab').addEventListener('click', () => {
      // module-level onclick handles primary action; nothing else to do here.
    });
  }

  /* ── GLOBAL SEARCH ───────────────────────────────────────── */
  function bindSearch() {
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    document.getElementById('global-search-btn').addEventListener('click', () => {
      overlay.classList.remove('hidden');
      input.value = '';
      results.innerHTML = '<p class="search-placeholder">Start typing to search…</p>';
      setTimeout(() => input.focus(), 80);
    });
    document.getElementById('search-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(input.value.trim()), 150);
    });
  }

  function runSearch(query) {
    const results = document.getElementById('search-results');
    if (!query) {
      results.innerHTML = '<p class="search-placeholder">Start typing to search…</p>';
      return;
    }
    let allHits = [];
    Object.values(MLO.modules).forEach((mod) => {
      if (typeof mod.search === 'function') {
        try {
          const hits = mod.search(query) || [];
          allHits = allHits.concat(hits.map((h) => Object.assign({ moduleId: mod.id, moduleLabel: mod.label }, h)));
        } catch (e) { /* module search failure shouldn't break global search */ }
      }
    });

    if (!allHits.length) {
      results.innerHTML = `<p class="search-placeholder">No results for "${escapeHtml(query)}"</p>`;
      return;
    }

    results.innerHTML = allHits.slice(0, 30).map((hit) => `
      <div class="search-result-item" data-module="${hit.moduleId}" data-id="${hit.id || ''}">
        <span class="search-result-icon">${hit.icon || '📄'}</span>
        <div style="flex:1;min-width:0;">
          <div class="search-result-title">${escapeHtml(hit.title)}</div>
          ${hit.sub ? `<div class="search-result-sub">${escapeHtml(hit.sub)}</div>` : ''}
        </div>
        <span class="search-result-module">${hit.moduleLabel}</span>
      </div>
    `).join('');

    results.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById('search-overlay').classList.add('hidden');
        MLO.Router.navigate(el.dataset.module);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /* ── HEADER / CLOCK ──────────────────────────────────────── */
  function updateSidebarDate() {
    const el = document.getElementById('sidebar-date');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  /* ── PROFILE NAME (from Storage, editable in Security/Profile) ── */
  function loadProfile() {
    const name = MLO.Storage.get('profileName', 'Bhuvan');
    const initial = (name || 'U').trim().charAt(0).toUpperCase();
    document.getElementById('sidebar-name').textContent = name;
    document.getElementById('sidebar-avatar').textContent = initial;
    document.getElementById('hdr-avatar').textContent = initial;
  }

  /* ── ANDROID BACK BUTTON HANDLING ────────────────────────────
     In a WebView wrapper, hardware/gesture back triggers popstate
     via history. We push a state per navigation so back closes
     overlays first, then steps module history, instead of exiting
     the app immediately. */
  function initBackButtonHandling() {
    window.addEventListener('popstate', () => {
      const sidebar = document.getElementById('sidebar');
      const search = document.getElementById('search-overlay');
      const modal = document.getElementById('modal-overlay');

      if (!modal.classList.contains('hidden')) { MLO.Modal.close(); history.pushState(null, '', location.href); return; }
      if (!search.classList.contains('hidden')) { search.classList.add('hidden'); history.pushState(null, '', location.href); return; }
      if (sidebar.classList.contains('open')) { closeSidebar(); history.pushState(null, '', location.href); return; }
      if (MLO.Router.current !== 'dashboard') { MLO.Router.navigate('dashboard'); }
    });
    history.pushState(null, '', location.href);
  }

  /* ── RIPPLE EFFECT (Material touch feedback) ────────────────── */
  function bindRipple() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.ripple');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const span = document.createElement('span');
      span.className = 'ripple-effect';
      span.style.width = span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(span);
      setTimeout(() => span.remove(), 500);
    });
  }

  /* ── SPLASH SCREEN ───────────────────────────────────────── */
  function runSplash(done) {
    const bar = document.getElementById('splash-bar');
    requestAnimationFrame(() => { bar.style.width = '100%'; });
    setTimeout(() => {
      document.getElementById('splash-screen').style.opacity = '0';
      document.getElementById('splash-screen').style.transition = 'opacity .35s ease';
      setTimeout(() => {
        document.getElementById('splash-screen').classList.add('hidden');
        done();
      }, 350);
    }, 900);
  }

  /* ── BIND TOP-LEVEL UI EVENTS ────────────────────────────── */
  function bindShellEvents() {
    document.getElementById('menu-toggle').addEventListener('click', openSidebar);
    document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    bindFab();
    bindSearch();
  }

  /* ── BOOT SEQUENCE ───────────────────────────────────────── */
  function start() {
    initTheme();
    loadProfile();
    buildNav();
    bindShellEvents();
    bindRipple();
    updateSidebarDate();
    setInterval(updateSidebarDate, 60000);

    const showApp = () => {
      document.getElementById('app').classList.remove('hidden');
      MLO.Router.init();
      initBackButtonHandling();
    };

    runSplash(() => {
      if (MLO.Security && MLO.Security.isLockEnabled()) {
        MLO.Security.showLockScreen(showApp);
      } else {
        showApp();
      }
    });
  }

  return {
    start, toggleTheme, openSidebar, closeSidebar,
    setActiveNav, updateFab, loadProfile, buildNav,
  };
})();

/* ═══════════════════════════════════════════
   5. BOOT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  MLO.App.start();
});
