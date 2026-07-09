/* ═══════════════════════════════════════════════════════════════
   MODULE: MYTUBE
   A link organizer for YouTube videos (not an embedded player —
   tapping a card opens the video in a new tab). Tracks watch
   status (doubles as "progress" and feeds "watch history"),
   favorites, categories, and free-form playlists.
   ─────────────────────────────────────────────────────────────
   Video shape: { id, url, videoId, title, category, playlist,
                  status:'unwatched'|'in-progress'|'watched',
                  favorite:bool, watchedAt }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'tubeVideos';
  const CATEGORIES = ['Tutorial', 'Entertainment', 'Music', 'Education', 'Tech', 'Documentary', 'Other'];
  const STATUS_CYCLE = ['unwatched', 'in-progress', 'watched'];
  const STATUS_BADGE = { unwatched: 'badge-gray', 'in-progress': 'badge-yellow', watched: 'badge-green' };
  const STATUS_LABEL = { unwatched: 'Not Started', 'in-progress': 'In Progress', watched: 'Watched' };

  let currentTab = 'all'; // all | playlists | favorites | history
  let categoryFilter = 'All';
  let selectedPlaylist = null;

  function extractVideoId(url) {
    const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openFormModal(existing) {
    const playlists = [...new Set(MLO.Storage.getCollection(COLLECTION).map((v) => v.playlist).filter(Boolean))];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">YouTube URL</label>
        <input type="url" class="form-input" id="tube-url-input" placeholder="https://youtube.com/watch?v=…" value="${existing ? existing.url : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" class="form-input" id="tube-title-input" placeholder="Video title" value="${existing ? U().escapeHtml(existing.title) : ''}" maxlength="120">
      </div>
      <div class="input-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="tube-category-input">
            ${CATEGORIES.map((c) => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Playlist (optional)</label>
          <input type="text" class="form-input" id="tube-playlist-input" list="tube-playlists" value="${existing ? U().escapeHtml(existing.playlist || '') : ''}" placeholder="e.g., Web Dev 2026">
          <datalist id="tube-playlists">${playlists.map((p) => `<option value="${U().escapeHtml(p)}">`).join('')}</datalist>
        </div>
      </div>
    `;

    MLO.Modal.open({
      title: existing ? 'Edit Video' : 'Save Video',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Save Video',
          class: 'btn-primary',
          onClick: () => {
            const url = body.querySelector('#tube-url-input').value.trim();
            const title = body.querySelector('#tube-title-input').value.trim();
            if (!url || !title) { MLO.Toast.error('URL and title are required'); return; }
            const payload = {
              url, title,
              videoId: extractVideoId(url),
              category: body.querySelector('#tube-category-input').value,
              playlist: body.querySelector('#tube-playlist-input').value.trim(),
            };
            if (existing) {
              MLO.Storage.update(COLLECTION, existing.id, payload);
              MLO.Toast.success('Video updated');
            } else {
              MLO.Storage.insert(COLLECTION, Object.assign({ status: 'unwatched', favorite: false }, payload));
              MLO.Toast.success('Video saved');
            }
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  async function confirmDelete(v) {
    const ok = await MLO.Modal.confirm({ title: 'Remove video?', message: `"${v.title}" will be removed from your library.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, v.id);
    MLO.Router.renderCurrent();
  }

  function cycleStatus(id) {
    const v = MLO.Storage.findById(COLLECTION, id);
    if (!v) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(v.status) + 1) % STATUS_CYCLE.length];
    const patch = { status: next };
    if (next === 'watched') patch.watchedAt = Date.now();
    MLO.Storage.update(COLLECTION, id, patch);
    MLO.Router.renderCurrent();
  }

  function toggleFavorite(id) {
    const v = MLO.Storage.findById(COLLECTION, id);
    if (!v) return;
    MLO.Storage.update(COLLECTION, id, { favorite: !v.favorite });
    MLO.Router.renderCurrent();
  }

  /* ── CARD ─────────────────────────────────────────────────── */
  function cardHtml(v) {
    return `
      <div class="tube-card slide-up" data-video-id="${v.id}">
        <div class="tube-thumb" data-open-video="${v.id}">
          ${v.videoId
            ? `<img src="https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg" alt="${U().escapeHtml(v.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="tube-thumb-placeholder" style="display:none;">▶️</div>`
            : `<div class="tube-thumb-placeholder">▶️</div>`}
          <span class="tube-status-badge badge ${STATUS_BADGE[v.status]}">${STATUS_LABEL[v.status]}</span>
        </div>
        <div class="tube-body">
          <div class="tube-title">${U().escapeHtml(v.title)}</div>
          <div class="tube-meta">
            <span class="tube-cat">${v.category}${v.playlist ? ` · ${U().escapeHtml(v.playlist)}` : ''}</span>
            <div class="tube-actions">
              <button class="task-action-btn" data-fav="${v.id}">${v.favorite ? '⭐' : '☆'}</button>
              <button class="task-action-btn" data-cycle="${v.id}">🔄</button>
              <button class="task-action-btn" data-edit-video="${v.id}">✏️</button>
              <button class="task-action-btn" data-delete-video="${v.id}">🗑️</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ── TAB CONTENT ─────────────────────────────────────────── */
  function renderAllTab() {
    let videos = MLO.Storage.getCollection(COLLECTION);
    const categoriesInUse = ['All', ...new Set(videos.map((v) => v.category))];
    if (categoryFilter !== 'All') videos = videos.filter((v) => v.category === categoryFilter);

    const chips = categoriesInUse.length > 1 ? `<div class="filter-tabs">${categoriesInUse.map((c) => `<div class="chip ${categoryFilter === c ? 'active' : ''}" data-cat="${c}">${c}</div>`).join('')}</div>` : '';
    const grid = videos.length ? `<div class="tube-grid stagger">${videos.map(cardHtml).join('')}</div>` : emptyState('📺', 'No videos saved', 'Save a YouTube link to start building your library.');
    return chips + grid;
  }

  function renderPlaylistsTab() {
    const videos = MLO.Storage.getCollection(COLLECTION);
    if (selectedPlaylist) {
      const items = videos.filter((v) => v.playlist === selectedPlaylist);
      return `
        <div class="flex gap-2 mb-4" style="align-items:center;">
          <button class="icon-btn ripple" id="back-to-playlists">‹</button>
          <span class="font-bold">${U().escapeHtml(selectedPlaylist)}</span>
        </div>
        <div class="tube-grid stagger">${items.map(cardHtml).join('')}</div>
      `;
    }
    const playlists = {};
    videos.forEach((v) => { if (v.playlist) (playlists[v.playlist] = playlists[v.playlist] || []).push(v); });
    const names = Object.keys(playlists);
    if (!names.length) return emptyState('🎞️', 'No playlists yet', 'Add a playlist name when saving a video to group it here.');
    return `<div class="stagger">${names.map((name) => `
      <div class="list-item slide-up" data-open-playlist="${U().escapeHtml(name)}">
        <span class="list-item-icon">🎞️</span>
        <div class="list-item-main"><div class="list-item-title">${U().escapeHtml(name)}</div><div class="list-item-sub">${playlists[name].length} video${playlists[name].length === 1 ? '' : 's'}</div></div>
        <span class="text-muted">›</span>
      </div>`).join('')}</div>`;
  }

  function renderFavoritesTab() {
    const videos = MLO.Storage.getCollection(COLLECTION).filter((v) => v.favorite);
    return videos.length ? `<div class="tube-grid stagger">${videos.map(cardHtml).join('')}</div>` : emptyState('⭐', 'No favorites yet', 'Star videos you love to find them quickly here.');
  }

  function renderHistoryTab() {
    const videos = MLO.Storage.getCollection(COLLECTION).filter((v) => v.status === 'watched' && v.watchedAt).sort((a, b) => b.watchedAt - a.watchedAt);
    if (!videos.length) return emptyState('🕓', 'No watch history', 'Videos marked "Watched" will show up here.');
    return `<div class="stagger">${videos.map((v) => `
      <div class="list-item" data-open-video="${v.id}">
        <span class="list-item-icon">▶️</span>
        <div class="list-item-main"><div class="list-item-title">${U().escapeHtml(v.title)}</div><div class="list-item-sub">${v.category}</div></div>
        <span class="text-xs text-muted">${U().timeAgo(v.watchedAt)}</span>
      </div>`).join('')}</div>`;
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  const TABS = [
    { id: 'all', label: 'All Videos' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'history', label: 'History' },
  ];

  /* ── MAIN RENDER ─────────────────────────────────────────── */
  function render(container) {
    const renderers = { all: renderAllTab, playlists: renderPlaylistsTab, favorites: renderFavoritesTab, history: renderHistoryTab };

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">MyTube</div>
          <div class="module-page-sub">Your saved video library</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-video-btn">+ Save</button></div>
      </div>
      <div class="filter-tabs">
        ${TABS.map((t) => `<div class="chip ${currentTab === t.id ? 'active' : ''}" data-tube-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="tube-tab-content">${renderers[currentTab]()}</div>
    `;

    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelector('#add-video-btn')?.addEventListener('click', () => openFormModal());
    container.querySelectorAll('[data-tube-tab]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.tubeTab; selectedPlaylist = null; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-cat]').forEach((el) => el.addEventListener('click', () => { categoryFilter = el.dataset.cat; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-open-playlist]').forEach((el) => el.addEventListener('click', () => { selectedPlaylist = el.dataset.openPlaylist; MLO.Router.renderCurrent(); }));
    container.querySelector('#back-to-playlists')?.addEventListener('click', () => { selectedPlaylist = null; MLO.Router.renderCurrent(); });

    container.querySelectorAll('[data-open-video]').forEach((el) => el.addEventListener('click', () => {
      const v = MLO.Storage.findById(COLLECTION, el.dataset.openVideo);
      if (v) window.open(v.url, '_blank', 'noopener');
    }));
    container.querySelectorAll('[data-fav]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(btn.dataset.fav); }));
    container.querySelectorAll('[data-cycle]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); cycleStatus(btn.dataset.cycle); }));
    container.querySelectorAll('[data-edit-video]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); openFormModal(MLO.Storage.findById(COLLECTION, btn.dataset.editVideo)); }));
    container.querySelectorAll('[data-delete-video]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(MLO.Storage.findById(COLLECTION, btn.dataset.deleteVideo)); }));
  }

  MLO.registerModule({
    id: 'mytube',
    label: 'MyTube',
    icon: '📺',
    inBottomNav: false,
    render,
    getFabAction() { return { icon: '+', label: 'Save Video', onClick: () => openFormModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((v) => v.title.toLowerCase().includes(q))
        .map((v) => ({ id: v.id, icon: '📺', title: v.title, sub: v.category }));
    },
  });
})();
