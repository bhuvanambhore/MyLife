/* ═══════════════════════════════════════════════════════════════
   MODULE: SECURITY
   PIN lock (4-digit), biometric hook for the future Android
   WebView wrapper, auto-lock on resume, plus general app settings
   (profile name, data usage, reset). Drives the #pin-screen markup
   that lives in index.html.
   ─────────────────────────────────────────────────────────────
   Public API used by app.js at boot:
     MLO.Security.isLockEnabled()
     MLO.Security.showLockScreen(onUnlock)
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const KEY = 'security';
  const DEFAULTS = { pinEnabled: false, pinHash: '', bioEnabled: false, autoLockMins: 1 };

  function getSettings() { return MLO.Storage.get(KEY, DEFAULTS); }
  function saveSettings(patch) {
    const s = Object.assign({}, getSettings(), patch);
    MLO.Storage.set(KEY, s);
    return s;
  }

  /** Not cryptographically secure — adequate for a casual local app-lock, not a vault. */
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
    return String(hash);
  }

  function isLockEnabled() { return !!getSettings().pinEnabled; }

  function bioAvailable() {
    // Hook point: the Android WebView wrapper should inject `window.Android.biometricAuth()`
    // which performs native BiometricPrompt auth and calls MLO.Security.onBiometricResult(bool).
    return !!(window.Android && typeof window.Android.biometricAuth === 'function');
  }

  /* ── State machine for the shared PIN screen ──────────────── */
  let mode = 'unlock';       // unlock | setup | confirm | change-old
  let entered = '';
  let tempNewPin = '';
  let unlockCallback = null;
  let keypadBound = false;
  let cancelEl = null;

  const els = {};
  function cacheEls() {
    els.screen = document.getElementById('pin-screen');
    els.dotsWrap = document.getElementById('pin-dots');
    els.dots = () => document.querySelectorAll('.pin-dot');
    els.error = document.getElementById('pin-error');
    els.subtitle = document.getElementById('pin-subtitle');
    els.bioKey = document.getElementById('key-bio');
    els.card = document.querySelector('.pin-card');
  }

  function renderDots() {
    els.dots().forEach((dot, i) => dot.classList.toggle('filled', i < entered.length));
  }

  function shakeAndClear(message) {
    els.error.textContent = message || 'Incorrect PIN — try again';
    els.error.classList.remove('hidden');
    els.dots().forEach((d) => d.classList.add('shake'));
    U().vibrate(80);
    setTimeout(() => {
      els.dots().forEach((d) => d.classList.remove('shake'));
      entered = '';
      renderDots();
    }, 400);
  }

  function showCancel(onCancel) {
    hideCancel();
    cancelEl = document.createElement('button');
    cancelEl.textContent = 'Cancel';
    cancelEl.className = 'btn btn-ghost btn-sm';
    cancelEl.style.marginTop = '18px';
    cancelEl.addEventListener('click', onCancel);
    els.card.appendChild(cancelEl);
  }
  function hideCancel() {
    if (cancelEl) { cancelEl.remove(); cancelEl = null; }
  }

  function bindKeypadOnce() {
    if (keypadBound) return;
    keypadBound = true;
    document.querySelectorAll('.key-btn[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => onKey(btn.dataset.key));
    });
    document.getElementById('key-del').addEventListener('click', onDelete);
    els.bioKey.addEventListener('click', onBioTap);
  }

  function onKey(digit) {
    if (entered.length >= 4) return;
    entered += digit;
    renderDots();
    els.error.classList.add('hidden');
    if (entered.length === 4) setTimeout(processEntry, 140);
  }
  function onDelete() { entered = entered.slice(0, -1); renderDots(); }

  function processEntry() {
    const s = getSettings();
    if (mode === 'unlock') {
      if (simpleHash(entered) === s.pinHash) unlockSuccess();
      else shakeAndClear();
    } else if (mode === 'setup') {
      tempNewPin = entered;
      mode = 'confirm';
      entered = '';
      renderDots();
      els.subtitle.textContent = 'Confirm your new PIN';
    } else if (mode === 'confirm') {
      if (entered === tempNewPin) {
        saveSettings({ pinEnabled: true, pinHash: simpleHash(entered) });
        finishSetupFlow('PIN lock enabled');
      } else {
        shakeAndClear('PINs did not match');
        mode = 'setup';
        tempNewPin = '';
        setTimeout(() => { els.subtitle.textContent = 'Create a 4-digit PIN'; }, 420);
      }
    } else if (mode === 'change-old') {
      if (simpleHash(entered) === s.pinHash) {
        mode = 'setup';
        entered = '';
        renderDots();
        els.subtitle.textContent = 'Enter your new PIN';
      } else {
        shakeAndClear();
      }
    }
  }

  function onBioTap() {
    if (!bioAvailable()) return;
    try { window.Android.biometricAuth(); } catch (e) { /* native bridge missing */ }
  }
  /** Called by the native Android wrapper after BiometricPrompt completes. */
  function onBiometricResult(success) {
    if (mode !== 'unlock') return;
    if (success) unlockSuccess();
    else shakeAndClear('Biometric failed — use PIN');
  }

  function unlockSuccess() {
    U().vibrate(20);
    els.screen.classList.add('hidden');
    hideCancel();
    lastBackgroundedAt = null;
    const cb = unlockCallback;
    unlockCallback = null;
    if (typeof cb === 'function') cb();
  }

  function finishSetupFlow(toastMsg) {
    els.screen.classList.add('hidden');
    hideCancel();
    if (toastMsg) MLO.Toast.success(toastMsg);
    if (MLO.Router && MLO.Router.current === 'security') MLO.Router.renderCurrent();
  }

  /** Entry point used by app.js at boot, and by auto-lock. */
  function showLockScreen(onUnlock) {
    cacheEls();
    mode = 'unlock';
    entered = '';
    unlockCallback = onUnlock;
    hideCancel();
    renderDots();
    els.subtitle.textContent = 'Enter your 4-digit PIN';
    els.error.classList.add('hidden');
    els.bioKey.classList.toggle('hidden', !(getSettings().bioEnabled && bioAvailable()));
    els.screen.classList.remove('hidden');
    bindKeypadOnce();
  }

  /** Triggered from the Security settings page to create a PIN. */
  function startPinSetup() {
    cacheEls();
    mode = 'setup';
    entered = ''; tempNewPin = '';
    unlockCallback = null;
    els.subtitle.textContent = 'Create a 4-digit PIN';
    els.error.classList.add('hidden');
    els.bioKey.classList.add('hidden');
    renderDots();
    els.screen.classList.remove('hidden');
    bindKeypadOnce();
    showCancel(() => { els.screen.classList.add('hidden'); hideCancel(); });
  }

  /** Triggered from settings to change an existing PIN. */
  function startPinChange() {
    cacheEls();
    mode = 'change-old';
    entered = '';
    unlockCallback = null;
    els.subtitle.textContent = 'Enter current PIN';
    els.error.classList.add('hidden');
    els.bioKey.classList.add('hidden');
    renderDots();
    els.screen.classList.remove('hidden');
    bindKeypadOnce();
    showCancel(() => { els.screen.classList.add('hidden'); hideCancel(); });
  }

  async function disablePin() {
    const ok = await MLO.Modal.confirm({
      title: 'Disable PIN lock?',
      message: 'Anyone who opens the app will be able to access all your data without a PIN.',
      confirmLabel: 'Disable',
      danger: true,
    });
    if (!ok) return;
    saveSettings({ pinEnabled: false, pinHash: '', bioEnabled: false });
    MLO.Toast.info('PIN lock disabled');
    MLO.Router.renderCurrent();
  }

  /* ── AUTO-LOCK ON RESUME ─────────────────────────────────── */
  let lastBackgroundedAt = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      lastBackgroundedAt = Date.now();
    } else if (lastBackgroundedAt && isLockEnabled()) {
      const elapsedMin = (Date.now() - lastBackgroundedAt) / 60000;
      if (elapsedMin >= getSettings().autoLockMins) {
        showLockScreen(() => {});
      }
    }
  });

  /* ── SETTINGS PAGE RENDER ─────────────────────────────────── */
  function renderToggleRow({ title, sub, on, onToggle, disabled }) {
    return `
      <div class="security-setting" data-toggle-row>
        <div class="sec-setting-info">
          <div class="sec-setting-title">${title}</div>
          <div class="sec-setting-sub">${sub}</div>
        </div>
        <div class="toggle-switch ${on ? 'on' : ''} ${disabled ? 'hidden' : ''}" data-action="${onToggle}"></div>
      </div>`;
  }

  function render(container) {
    const s = getSettings();
    const profileName = MLO.Storage.get('profileName', 'Bhuvan');
    const usageBytes = MLO.Storage.estimateUsage();
    const usageKb = (usageBytes / 1024).toFixed(1);

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Security & Settings</div>
          <div class="module-page-sub">Protect your data and personalize the app</div>
        </div>
      </div>

      <div class="section-title">App Lock</div>
      ${renderToggleRow({ title: 'PIN Lock', sub: s.pinEnabled ? '4-digit PIN required to open the app' : 'Require a PIN to open the app', on: s.pinEnabled, onToggle: 'toggle-pin' })}
      ${s.pinEnabled ? `
        <div class="list-item" data-action="change-pin" style="cursor:pointer;">
          <span class="list-item-icon">🔑</span>
          <div class="list-item-main"><div class="list-item-title">Change PIN</div></div>
          <span class="text-muted">›</span>
        </div>
        ${renderToggleRow({
          title: 'Fingerprint Unlock', on: s.bioEnabled, onToggle: 'toggle-bio',
          sub: bioAvailable() ? 'Use your fingerprint instead of typing a PIN' : 'Available once installed as an Android app',
        })}
        <div class="form-group" style="margin-top:var(--sp-3);">
          <label class="form-label">Auto-lock after leaving the app</label>
          <select class="form-select" id="autolock-select">
            <option value="0" ${s.autoLockMins === 0 ? 'selected' : ''}>Immediately</option>
            <option value="1" ${s.autoLockMins === 1 ? 'selected' : ''}>After 1 minute</option>
            <option value="5" ${s.autoLockMins === 5 ? 'selected' : ''}>After 5 minutes</option>
            <option value="15" ${s.autoLockMins === 15 ? 'selected' : ''}>After 15 minutes</option>
            <option value="30" ${s.autoLockMins === 30 ? 'selected' : ''}>After 30 minutes</option>
          </select>
        </div>
      ` : ''}

      <div class="section-title">Profile</div>
      <div class="card mb-4">
        <div class="form-group" style="margin-bottom:var(--sp-3);">
          <label class="form-label">Display Name</label>
          <input type="text" class="form-input" id="profile-name-input" value="${U().escapeHtml(profileName)}" maxlength="24">
        </div>
        <button class="btn btn-primary btn-sm" id="save-profile-btn">Save Name</button>
      </div>

      <div class="section-title">Appearance</div>
      <div class="card mb-4">
        <div class="toggle-wrap" id="theme-row" style="cursor:pointer;">
          <div class="toggle-switch ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'on' : ''}" id="theme-row-switch"></div>
          <span class="toggle-label">Dark Mode</span>
        </div>
      </div>

      <div class="section-title">Storage</div>
      <div class="data-summary-grid mb-4">
        <div class="data-summary-item"><span class="ds-icon">💾</span><div><div class="ds-val">${usageKb} KB</div><div class="ds-key">Data used</div></div></div>
        <div class="data-summary-item"><span class="ds-icon">📦</span><div><div class="ds-val">Local</div><div class="ds-key">Storage mode</div></div></div>
      </div>

      <div class="section-title">Danger Zone</div>
      <div class="backup-action-card" id="reset-data-btn" style="border-color:rgba(239,68,68,.3);">
        <span class="backup-icon">🗑️</span>
        <div>
          <div class="backup-info-title" style="color:var(--clr-error);">Reset All Data</div>
          <div class="backup-info-sub">Permanently erase everything stored in this app</div>
        </div>
      </div>

      <p class="text-center text-xs text-muted" style="margin-top:var(--sp-6);">My Life OS v3.0 · Offline-first · Built for Bhuvan</p>
    `;

    container.querySelector('[data-toggle-row] .toggle-switch[data-action="toggle-pin"]')?.addEventListener('click', () => {
      if (s.pinEnabled) disablePin(); else startPinSetup();
    });

    container.querySelector('[data-action="change-pin"]')?.addEventListener('click', startPinChange);

    const bioToggle = container.querySelector('.toggle-switch[data-action="toggle-bio"]');
    if (bioToggle) {
      if (!bioAvailable()) bioToggle.classList.add('hidden');
      bioToggle.addEventListener('click', () => {
        const next = !getSettings().bioEnabled;
        saveSettings({ bioEnabled: next });
        MLO.Toast.success(next ? 'Fingerprint unlock enabled' : 'Fingerprint unlock disabled');
        MLO.Router.renderCurrent();
      });
    }

    container.querySelector('#autolock-select')?.addEventListener('change', (e) => {
      saveSettings({ autoLockMins: Number(e.target.value) });
      MLO.Toast.success('Auto-lock updated');
    });

    container.querySelector('#save-profile-btn')?.addEventListener('click', () => {
      const val = container.querySelector('#profile-name-input').value.trim() || 'User';
      MLO.Storage.set('profileName', val);
      MLO.App.loadProfile();
      MLO.Toast.success('Profile updated');
    });

    container.querySelector('#theme-row')?.addEventListener('click', () => {
      MLO.App.toggleTheme();
      const on = document.documentElement.getAttribute('data-theme') === 'dark';
      container.querySelector('#theme-row-switch').classList.toggle('on', on);
    });

    container.querySelector('#reset-data-btn')?.addEventListener('click', async () => {
      const ok = await MLO.Modal.confirm({
        title: 'Reset everything?',
        message: 'This deletes all tasks, notes, habits, expenses, and every other piece of data in My Life OS. This cannot be undone.',
        confirmLabel: 'Delete Everything',
        danger: true,
      });
      if (!ok) return;
      Object.keys(localStorage).filter((k) => k.startsWith(MLO.Storage.NS)).forEach((k) => localStorage.removeItem(k));
      MLO.Toast.success('All data cleared');
      setTimeout(() => location.reload(), 600);
    });
  }

  MLO.Security = { isLockEnabled, showLockScreen, onBiometricResult, startPinSetup, startPinChange };

  MLO.registerModule({
    id: 'security',
    label: 'Security',
    icon: '🔒',
    inBottomNav: false,
    render,
  });
})();
