/* ═══════════════════════════════════════════════════════════════
   MODULE: LINKS
   A simple bookmark manager with categories, live search, and
   favicons (loaded progressively via Google's favicon service when
   online; falls back to a letter avatar when offline or on error).
   ─────────────────────────────────────────────────────────────
   Link shape: { id, label, url, category }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'links';
  const CATEGORIES = ['Work', 'Tools', 'Reference', 'Reading', 'Shopping', 'Social', 'Other'];

  let searchQuery = '';
  let categoryFilter = 'All';

  function extractDomain(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openFormModal(existing) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Label</label>
        <input type="text" class="form-input" id="link-label-input" placeholder="e.g., Project Tracker" value="${existing ? U().escapeHtml(existing.label) : ''}" maxlength="60">
      </div>
      <div class="form-group">
        <label class="form-label">URL</label>
        <input type="url" class="form-input" id="link-url-input" placeholder="https://…" value="${existing ? existing.url : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select class="form-select" id="link-category-input">
          ${CATEGORIES.map((c) => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
    `;
    MLO.Modal.open({
      title: existing ? 'Edit Link' : 'Add Link',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Add',
          class: 'btn-primary',
          onClick: () => {
            const label = body.querySelector('#link-label-input').value.trim();
            let url = body.querySelector('#link-url-input').value.trim();
            if (!label || !url) { MLO.Toast.error('Label and URL are required'); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            const payload = { label, url, category: body.querySelector('#link-category-input').value };
            if (existing) MLO.Storage.update(COLLECTION, existing.id, payload);
            else MLO.Storage.insert(COLLECTION, payload);
            MLO.Toast.success(existing ? 'Link updated' : 'Link added');
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  async function confirmDelete(link) {
    const ok = await MLO.Modal.confirm({ title: 'Delete link?', message: `"${link.label}" will be removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, link.id);
    MLO.Router.renderCurrent();
  }

  /* ── LIST (search updates list only, to preserve input focus) ── */
  function getFiltered() {
    let links = MLO.Storage.getCollection(COLLECTION);
    if (categoryFilter !== 'All') links = links.filter((l) => l.category === categoryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      links = links.filter((l) => l.label.toLowerCase().includes(q) || l.url.toLowerCase().includes(q));
    }
    return links;
  }

  function linkRow(l) {
    const domain = extractDomain(l.url);
    return `
      <div class="link-item" data-link-id="${l.id}">
        <div class="link-favicon">
          ${domain ? `<img src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span style="display:none;">${l.label.charAt(0).toUpperCase()}</span>` : `<span>${l.label.charAt(0).toUpperCase()}</span>`}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="link-name">${U().escapeHtml(l.label)}</div>
          <div class="link-url">${U().escapeHtml(domain || l.url)}</div>
        </div>
        <span class="badge badge-gray">${l.category}</span>
        <button class="task-action-btn" data-edit-link="${l.id}">✏️</button>
        <button class="task-action-btn" data-delete-link="${l.id}">🗑️</button>
      </div>`;
  }

  function renderListInto(el) {
    const links = getFiltered();
    el.innerHTML = links.length
      ? links.map(linkRow).join('')
      : `<div class="empty-state"><div class="empty-icon">🔖</div><div class="empty-title">No links found</div><div class="empty-desc">Add a bookmark or try a different search.</div></div>`;

    el.querySelectorAll('[data-edit-link]').forEach((btn) => btn.addEventListener('click', () => openFormModal(MLO.Storage.findById(COLLECTION, btn.dataset.editLink))));
    el.querySelectorAll('[data-delete-link]').forEach((btn) => btn.addEventListener('click', () => confirmDelete(MLO.Storage.findById(COLLECTION, btn.dataset.deleteLink))));
    el.querySelectorAll('.link-item').forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('[data-edit-link], [data-delete-link]')) return;
      const link = MLO.Storage.findById(COLLECTION, row.dataset.linkId);
      if (link) window.open(link.url, '_blank', 'noopener');
    }));
  }

  /* ── MAIN RENDER ─────────────────────────────────────────── */
  function render(container) {
    const all = MLO.Storage.getCollection(COLLECTION);
    const categoriesInUse = ['All', ...new Set(all.map((l) => l.category))];

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Links</div>
          <div class="module-page-sub">${all.length} bookmark${all.length === 1 ? '' : 's'}</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-link-btn">+ Add</button></div>
      </div>

      <div class="form-group"><input type="search" class="form-input" id="links-search-input" placeholder="Search links…" value="${U().escapeHtml(searchQuery)}"></div>

      ${categoriesInUse.length > 1 ? `<div class="filter-tabs">${categoriesInUse.map((c) => `<div class="chip ${categoryFilter === c ? 'active' : ''}" data-cat="${c}">${c}</div>`).join('')}</div>` : ''}

      <div id="links-list"></div>
    `;

    const list = container.querySelector('#links-list');
    renderListInto(list);

    container.querySelector('#add-link-btn').addEventListener('click', () => openFormModal());
    container.querySelector('#links-search-input').addEventListener('input', U().debounce((e) => { searchQuery = e.target.value; renderListInto(list); }, 200));
    container.querySelectorAll('[data-cat]').forEach((chip) => chip.addEventListener('click', () => { categoryFilter = chip.dataset.cat; MLO.Router.renderCurrent(); }));
  }

  MLO.registerModule({
    id: 'links',
    label: 'Links',
    icon: '🔖',
    inBottomNav: false,
    render,
    getFabAction() { return { icon: '+', label: 'Add Link', onClick: () => openFormModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((l) => l.label.toLowerCase().includes(q) || l.url.toLowerCase().includes(q))
        .map((l) => ({ id: l.id, icon: '🔖', title: l.label, sub: extractDomain(l.url) }));
    },
  });
})();
