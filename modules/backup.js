/* ═══════════════════════════════════════════════════════════════
   MODULE: BACKUP
   Four layers of safety:
   1. Data summary
   2. File export / import (download a .json to phone storage)
   3. Local snapshots  (quick in-device restore points)
   4. ☁️ FREE cloud sync via GitHub Gist — private, versioned,
      accessible from any device. Needs a free GitHub account and a
      Personal Access Token (gist scope only). No server, no cost.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const BACKUPS_KEY  = 'localBackups';
  const CLOUD_KEY    = 'cloudSync';
  const MAX_LOCAL_BACKUPS = 5;
  const GIST_FILENAME = 'mylifeos-backup.json';
  const SUMMARY_ICONS = { Tasks:'✅', Habits:'🌱', Notes:'📝', Events:'📅', Expenses:'💰', Goals:'🎯', Links:'🔖', Videos:'📺' };

  /* ─────────────────────────────────────────────────────────────
     CLOUD SETTINGS helpers
  ───────────────────────────────────────────────────────────── */
  function getCloud() {
    return MLO.Storage.get(CLOUD_KEY, { token:'', gistId:'', lastSync:null });
  }
  function saveCloud(patch) {
    MLO.Storage.set(CLOUD_KEY, Object.assign({}, getCloud(), patch));
  }

  /* ─────────────────────────────────────────────────────────────
     FILE EXPORT / IMPORT  (existing feature, unchanged)
  ───────────────────────────────────────────────────────────── */
  function exportToFile() {
    const data = MLO.Storage.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `mylifeos-backup-${U().toISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    MLO.Toast.success('Backup downloaded');
  }

  function clearAllAppKeys() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(MLO.Storage.NS))
      .forEach((k) => localStorage.removeItem(k));
  }

  function importFromFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); } catch (e) { MLO.Toast.error('That file isn\'t valid JSON'); return; }
      const ok = await MLO.Modal.confirm({
        title: 'Import this backup?',
        message: 'Your current data will be replaced with the contents of this file. This cannot be undone.',
        confirmLabel: 'Import & Replace', danger: true,
      });
      if (!ok) return;
      clearAllAppKeys();
      MLO.Storage.importAll(parsed);
      MLO.Toast.success('Backup imported — reloading…');
      setTimeout(() => location.reload(), 700);
    };
    reader.readAsText(file);
  }

  /* ─────────────────────────────────────────────────────────────
     LOCAL SNAPSHOTS  (existing feature, unchanged)
  ───────────────────────────────────────────────────────────── */
  function snapshotPayload() {
    const all = MLO.Storage.exportAll();
    delete all[BACKUPS_KEY];
    return all;
  }

  function createLocalBackup() {
    const backups  = MLO.Storage.get(BACKUPS_KEY, []);
    const snapshot = { id: U().uid(), createdAt: Date.now(), data: snapshotPayload() };
    MLO.Storage.set(BACKUPS_KEY, [snapshot, ...backups].slice(0, MAX_LOCAL_BACKUPS));
    MLO.Toast.success('Snapshot saved');
    MLO.Router.renderCurrent();
  }

  async function restoreLocalBackup(id) {
    const backup = MLO.Storage.get(BACKUPS_KEY, []).find((b) => b.id === id);
    if (!backup) return;
    const ok = await MLO.Modal.confirm({
      title: 'Restore this snapshot?',
      message: `All current data will be replaced with the snapshot from ${U().formatDateFull(backup.createdAt)} at ${U().formatTime(backup.createdAt)}.`,
      confirmLabel: 'Restore', danger: true,
    });
    if (!ok) return;
    const cloudSettings = getCloud();
    clearAllAppKeys();
    MLO.Storage.importAll(backup.data);
    saveCloud(cloudSettings);
    MLO.Toast.success('Snapshot restored — reloading…');
    setTimeout(() => location.reload(), 700);
  }

  function deleteLocalBackup(id) {
    MLO.Storage.set(BACKUPS_KEY, MLO.Storage.get(BACKUPS_KEY, []).filter((b) => b.id !== id));
    MLO.Router.renderCurrent();
  }

  /* ─────────────────────────────────────────────────────────────
     ☁️  FREE CLOUD SYNC — GitHub Gist
     ─────────────────────────────────────────────────────────────
     WHY GIST:
       • GitHub is free to sign up
       • Private Gists are invisible to anyone without your token
       • Built-in version history (every sync is a revision)
       • Simple REST API — no OAuth dance, just a token
       • Data accessible from any device / browser

     SETUP (one-time, ~2 minutes):
       1. Go to  github.com  → sign up or log in
       2. Click your avatar → Settings
       3. Developer settings → Personal access tokens → Tokens (classic)
       4. "Generate new token (classic)"
       5. Give it ANY name, e.g. "MyLifeOS"
       6. Tick ONLY the  "gist"  checkbox
       7. Click "Generate token" — COPY the token immediately!
       8. Paste it below and tap "Back Up Now"
  ───────────────────────────────────────────────────────────── */

  function buildPayload() {
    const all = MLO.Storage.exportAll();
    // Never include backup chain or token in the cloud payload
    delete all[BACKUPS_KEY];
    delete all[CLOUD_KEY];
    return all;
  }

  function gistHeaders(token) {
    return {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
    };
  }

  async function syncToCloud() {
    const cloud = getCloud();
    if (!cloud.token) { MLO.Toast.error('Enter your GitHub token first'); return; }

    const content = JSON.stringify(buildPayload(), null, 2);
    const btn = document.getElementById('cloud-sync-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }

    try {
      let response;
      if (cloud.gistId) {
        // Update existing Gist
        response = await fetch(`https://api.github.com/gists/${cloud.gistId}`, {
          method: 'PATCH',
          headers: gistHeaders(cloud.token),
          body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }),
        });
      } else {
        // First sync — create a new private Gist
        response = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: gistHeaders(cloud.token),
          body: JSON.stringify({
            description: 'My Life OS — Auto Backup (do not delete)',
            public: false,
            files: { [GIST_FILENAME]: { content } },
          }),
        });
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${response.status}`);
      }

      const result = await response.json();
      saveCloud({ gistId: result.id, lastSync: Date.now() });
      MLO.Toast.success('✓ Backed up to GitHub Gist');
      MLO.Router.renderCurrent();
    } catch (err) {
      const msg = err.message.includes('401') ? 'Invalid token — check your GitHub PAT'
                : err.message.includes('NetworkError') || err.message.includes('Failed to fetch') ? 'No internet connection'
                : err.message;
      MLO.Toast.error('Sync failed: ' + msg);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Back Up Now'; }
    }
  }

  async function restoreFromCloud() {
    const cloud = getCloud();
    if (!cloud.token)  { MLO.Toast.error('Enter your GitHub token first'); return; }
    if (!cloud.gistId) { MLO.Toast.error('No backup found — sync first'); return; }

    const btn = document.getElementById('cloud-restore-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

    try {
      const response = await fetch(`https://api.github.com/gists/${cloud.gistId}`, {
        headers: gistHeaders(cloud.token),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const gist = await response.json();
      const file = gist.files[GIST_FILENAME];
      if (!file) throw new Error('No backup file found in Gist');

      // Fetch raw content (may be truncated for large files)
      const rawUrl = file.raw_url;
      const rawResponse = await fetch(rawUrl, { headers: gistHeaders(cloud.token) });
      const rawText = await rawResponse.text();

      let data;
      try { data = JSON.parse(rawText); } catch (e) { throw new Error('Backup file is corrupted'); }

      const updatedAt = gist.updated_at ? new Date(gist.updated_at).toLocaleString() : 'unknown';
      const ok = await MLO.Modal.confirm({
        title: 'Restore from cloud?',
        message: `This will replace ALL current data with your cloud backup (last updated ${updatedAt}). This cannot be undone.`,
        confirmLabel: 'Restore from Cloud', danger: true,
      });
      if (!ok) return;

      const savedCloud = getCloud();
      clearAllAppKeys();
      MLO.Storage.importAll(data);
      saveCloud(savedCloud);                  // re-apply token & gistId
      MLO.Toast.success('Restored from cloud — reloading…');
      setTimeout(() => location.reload(), 700);
    } catch (err) {
      MLO.Toast.error('Restore failed: ' + err.message);
      if (btn) { btn.disabled = false; btn.textContent = '⬇️ Restore from Cloud'; }
    }
  }

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────── */
  function render(container) {
    const counts = {
      Tasks:   MLO.Storage.getCollection('tasks').length,
      Habits:  MLO.Storage.getCollection('habits').length,
      Notes:   MLO.Storage.getCollection('notes').length,
      Events:  MLO.Storage.getCollection('events').length,
      Expenses:MLO.Storage.getCollection('expenses').length,
      Goals:   MLO.Storage.getCollection('goals').length,
      Links:   MLO.Storage.getCollection('links').length,
      Videos:  MLO.Storage.getCollection('tubeVideos').length,
    };
    const usageKb  = (MLO.Storage.estimateUsage() / 1024).toFixed(1);
    const backups  = MLO.Storage.get(BACKUPS_KEY, []);
    const cloud    = getCloud();
    const lastSync = cloud.lastSync ? U().formatDateShort(cloud.lastSync) + ' · ' + U().formatTime(cloud.lastSync) : null;
    const synced   = !!cloud.gistId;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Backup</div>
          <div class="module-page-sub">3 layers of protection for your data</div>
        </div>
      </div>

      <!-- DATA SUMMARY -->
      <div class="section-title">Your Data</div>
      <div class="data-summary-grid mb-3">
        ${Object.entries(counts).map(([k,v]) => `<div class="data-summary-item"><span class="ds-icon">${SUMMARY_ICONS[k]||'📦'}</span><div><div class="ds-val">${v}</div><div class="ds-key">${k}</div></div></div>`).join('')}
      </div>
      <p class="text-xs text-muted mb-4">Total storage used: ${usageKb} KB</p>

      <!-- ☁️ FREE CLOUD SYNC -->
      <div class="section-title">☁️ Free Cloud Backup</div>

      <div class="card mb-3" style="border-color:${synced ? 'var(--clr-success)' : 'var(--bdr-accent)'};">
        <!-- Status badge -->
        <div class="flex-between mb-3">
          <span class="font-bold" style="font-size:var(--fs-base);">GitHub Gist  <span style="font-size:var(--fs-xs);color:var(--clr-success);font-weight:700;">FREE</span></span>
          <span class="badge ${synced ? 'badge-green' : 'badge-gray'}">${synced ? '✓ Connected' : 'Not set up'}</span>
        </div>

        ${!synced ? `
        <!-- SETUP GUIDE (shown until first sync) -->
        <div style="background:var(--clr-primary-dim);border-radius:var(--r-md);padding:var(--sp-4);margin-bottom:var(--sp-4);border:1px solid var(--bdr-accent);">
          <div class="text-sm font-bold mb-3" style="color:var(--clr-primary-light);">📋 One-time setup (2 minutes)</div>
          <ol style="padding-left:20px;font-size:var(--fs-sm);color:var(--txt-2);line-height:2;">
            <li>Go to <strong>github.com</strong> → create a free account</li>
            <li>Click your avatar → <strong>Settings</strong></li>
            <li>Scroll to <strong>Developer settings</strong></li>
            <li>Personal access tokens → <strong>Tokens (classic)</strong></li>
            <li>Click <strong>"Generate new token"</strong></li>
            <li>Give it a name (e.g. <em>MyLifeOS</em>)</li>
            <li>Tick ONLY the <strong>"gist"</strong> checkbox</li>
            <li>Click <strong>"Generate token"</strong> — copy it immediately!</li>
            <li>Paste the token in the field below and tap <strong>Back Up Now</strong></li>
          </ol>
          <p class="text-xs text-muted mt-3">Your data goes to a <strong>private Gist</strong> — only visible to you. Free forever. Includes full version history.</p>
        </div>` : `
        <!-- CONNECTED STATE -->
        <div class="flex-between mb-3" style="font-size:var(--fs-sm);">
          <span class="text-muted">Last synced</span>
          <span class="font-bold">${lastSync || 'Never'}</span>
        </div>`}

        <!-- TOKEN INPUT -->
        <div class="form-group">
          <label class="form-label">GitHub Personal Access Token</label>
          <input type="password" class="form-input" id="cloud-token-input"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value="${U().escapeHtml(cloud.token)}"
            autocomplete="off">
          <p class="text-xs text-muted mt-3">Stored only on this device. Never sent anywhere except api.github.com.</p>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="flex gap-3 mt-3">
          <button class="btn btn-primary" id="cloud-sync-btn" style="flex:1;">☁️ Back Up Now</button>
          ${synced ? `<button class="btn btn-ghost" id="cloud-restore-btn" style="flex:1;">⬇️ Restore</button>` : ''}
        </div>

        ${synced ? `
        <div class="text-xs text-muted mt-3" style="text-align:center;">
          Gist ID: <code style="color:var(--clr-primary-light);">${cloud.gistId.slice(0,8)}…</code>
          <button class="btn btn-ghost btn-sm" id="cloud-disconnect-btn" style="margin-left:8px;padding:2px 10px;font-size:11px;">Disconnect</button>
        </div>` : ''}
      </div>

      <!-- FILE BACKUP -->
      <div class="section-title">📁 File Backup</div>
      <div class="backup-action-card" id="export-btn">
        <span class="backup-icon">📤</span>
        <div><div class="backup-info-title">Export as JSON</div><div class="backup-info-sub">Download backup file to your phone</div></div>
      </div>
      <div class="backup-action-card" id="import-btn">
        <span class="backup-icon">📥</span>
        <div><div class="backup-info-title">Import from JSON</div><div class="backup-info-sub">Restore from a saved backup file</div></div>
      </div>
      <input type="file" accept=".json,application/json" id="import-file-input" class="hidden">

      <!-- LOCAL SNAPSHOTS -->
      <div class="section-title">📸 Local Snapshots</div>
      <div class="backup-action-card" id="snapshot-btn">
        <span class="backup-icon">💾</span>
        <div><div class="backup-info-title">Create Snapshot Now</div><div class="backup-info-sub">Quick restore point on this device (keeps last ${MAX_LOCAL_BACKUPS})</div></div>
      </div>
      ${backups.length
        ? backups.map((b) => `
          <div class="list-item" data-backup-id="${b.id}">
            <span class="list-item-icon">🕓</span>
            <div class="list-item-main">
              <div class="list-item-title">${U().formatDateFull(b.createdAt)}</div>
              <div class="list-item-sub">${U().formatTime(b.createdAt)}</div>
            </div>
            <button class="task-action-btn" data-delete-backup="${b.id}">🗑️</button>
          </div>`).join('')
        : `<p class="text-xs text-muted">No snapshots yet — create one above.</p>`}
    `;

    bindEvents(container, cloud);
  }

  function bindEvents(container, cloud) {
    // Cloud sync
    const tokenInput = container.querySelector('#cloud-token-input');
    container.querySelector('#cloud-sync-btn')?.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (token) saveCloud({ token });
      syncToCloud();
    });
    container.querySelector('#cloud-restore-btn')?.addEventListener('click', () => {
      const token = tokenInput.value.trim();
      if (token) saveCloud({ token });
      restoreFromCloud();
    });
    container.querySelector('#cloud-disconnect-btn')?.addEventListener('click', async () => {
      const ok = await MLO.Modal.confirm({
        title: 'Disconnect cloud sync?',
        message: 'This removes the token and Gist link from this device. Your actual Gist on GitHub is NOT deleted.',
        confirmLabel: 'Disconnect',
        danger: false,
      });
      if (!ok) return;
      MLO.Storage.set(CLOUD_KEY, { token: '', gistId: '', lastSync: null });
      MLO.Toast.info('Cloud sync disconnected');
      MLO.Router.renderCurrent();
    });

    // File export / import
    container.querySelector('#export-btn')?.addEventListener('click', exportToFile);
    container.querySelector('#import-btn')?.addEventListener('click', () => container.querySelector('#import-file-input').click());
    container.querySelector('#import-file-input')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importFromFile(file);
      e.target.value = '';
    });

    // Local snapshots
    container.querySelector('#snapshot-btn')?.addEventListener('click', createLocalBackup);
    container.querySelectorAll('[data-backup-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-backup]')) return;
        restoreLocalBackup(row.dataset.backupId);
      });
    });
    container.querySelectorAll('[data-delete-backup]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); deleteLocalBackup(btn.dataset.deleteBackup); });
    });
  }

  MLO.registerModule({
    id: 'backup',
    label: 'Backup',
    icon: '💾',
    inBottomNav: false,
    render,
  });
})();
