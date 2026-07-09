/* ═══════════════════════════════════════════════════════════════
   MODULE: NOTES
   Rich text notes (contenteditable + execCommand toolbar — the
   standard dependency-free approach for basic formatting), with
   pinning, categories, live search, and small image attachments
   stored as base64 data URLs.
   ─────────────────────────────────────────────────────────────
   Note shape: { id, title, body (HTML string), category, color:1-6,
                 pinned:bool, attachments:[{id,name,dataUrl}] }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'notes';
  const CATEGORIES = ['Personal', 'Work', 'Ideas', 'Journal', 'Important', 'Other'];
  const MAX_ATTACHMENT_BYTES = 1.5 * 1024 * 1024;

  let searchQuery = '';
  let categoryFilter = 'All';
  let pinnedOnly = false;

  function stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || div.innerText || '';
  }

  /* ── EDITOR MODAL ────────────────────────────────────────── */
  function openEditor(existing) {
    let color = existing ? (existing.color || 1) : (Math.floor(Math.random() * 6) + 1);
    let attachments = existing ? [...(existing.attachments || [])] : [];
    let pinned = existing ? !!existing.pinned : false;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <input type="text" class="form-input" id="note-title-input" placeholder="Title" value="${existing ? U().escapeHtml(existing.title) : ''}" style="font-weight:700;font-size:var(--fs-lg);" maxlength="80">
      </div>
      <div class="input-row">
        <div class="form-group" style="flex:1;">
          <label class="form-label">Category</label>
          <select class="form-select" id="note-category-input">
            ${CATEGORIES.map((c) => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Pin</label>
          <div class="toggle-wrap" id="note-pin-wrap" style="padding:11px 14px;background:var(--bg-input);border-radius:var(--r-md);border:1px solid var(--bdr-mid);">
            <div class="toggle-switch ${pinned ? 'on' : ''}" id="note-pin-toggle"></div>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div id="note-color-row" style="display:flex;gap:10px;">
          ${[1, 2, 3, 4, 5, 6].map((i) => `<button type="button" class="note-color-${i}" data-color="${i}" style="width:30px;height:30px;border-radius:50%;border:2px solid ${color === i ? 'var(--clr-primary)' : 'transparent'};cursor:pointer;"></button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Note</label>
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" data-cmd="bold"><b>B</b></button>
          <button type="button" class="btn btn-ghost btn-sm" data-cmd="italic"><i>I</i></button>
          <button type="button" class="btn btn-ghost btn-sm" data-cmd="underline"><u>U</u></button>
          <button type="button" class="btn btn-ghost btn-sm" data-cmd="insertUnorderedList">• List</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cmd="insertOrderedList">1. List</button>
        </div>
        <div class="note-editor" id="note-body-input" contenteditable="true" style="border:1px solid var(--bdr-mid);border-radius:var(--r-md);padding:12px;background:var(--bg-input);">${existing ? existing.body || '' : ''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Attachments</label>
        <div id="note-attachments-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"></div>
        <input type="file" accept="image/*" id="note-attachment-input" class="hidden">
        <button type="button" class="btn btn-secondary btn-sm" id="note-add-attachment-btn">📎 Add Image</button>
      </div>
    `;

    body.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => {
        color = Number(btn.dataset.color);
        body.querySelectorAll('[data-color]').forEach((b) => { b.style.borderColor = Number(b.dataset.color) === color ? 'var(--clr-primary)' : 'transparent'; });
      });
    });

    body.querySelectorAll('[data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.execCommand(btn.dataset.cmd, false, null);
        body.querySelector('#note-body-input').focus();
      });
    });

    body.querySelector('#note-pin-wrap').addEventListener('click', () => {
      pinned = !pinned;
      body.querySelector('#note-pin-toggle').classList.toggle('on', pinned);
    });

    function renderAttachments() {
      const row = body.querySelector('#note-attachments-row');
      row.innerHTML = attachments.map((a) => `
        <div style="position:relative;">
          <img src="${a.dataUrl}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--bdr-mid);" alt="${U().escapeHtml(a.name)}">
          <button type="button" data-remove-att="${a.id}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:var(--clr-error);color:#fff;border:none;font-size:11px;cursor:pointer;">✕</button>
        </div>`).join('');
      row.querySelectorAll('[data-remove-att]').forEach((b) => {
        b.addEventListener('click', () => { attachments = attachments.filter((a) => a.id !== b.dataset.removeAtt); renderAttachments(); });
      });
    }
    renderAttachments();

    body.querySelector('#note-add-attachment-btn').addEventListener('click', () => body.querySelector('#note-attachment-input').click());
    body.querySelector('#note-attachment-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > MAX_ATTACHMENT_BYTES) { MLO.Toast.error('Image too large (max 1.5MB)'); e.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { attachments.push({ id: U().uid(), name: file.name, dataUrl: reader.result }); renderAttachments(); };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    const footer = [];
    if (existing) footer.push({ label: 'Delete', class: 'btn-danger', onClick: () => confirmDelete(existing) });
    footer.push({ label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() });
    footer.push({
      label: existing ? 'Save' : 'Create',
      class: 'btn-primary',
      onClick: () => {
        const title = body.querySelector('#note-title-input').value.trim();
        const bodyHtml = body.querySelector('#note-body-input').innerHTML.trim();
        if (!title && stripHtml(bodyHtml).trim() === '') { MLO.Toast.error('Add a title or some content'); return; }
        const payload = {
          title: title || 'Untitled', body: bodyHtml,
          category: body.querySelector('#note-category-input').value,
          color, pinned, attachments,
        };
        if (existing) MLO.Storage.update(COLLECTION, existing.id, payload);
        else MLO.Storage.insert(COLLECTION, payload);
        MLO.Toast.success(existing ? 'Note updated' : 'Note created');
        MLO.Modal.close();
        MLO.Router.renderCurrent();
      },
    });

    MLO.Modal.open({ title: existing ? 'Edit Note' : 'New Note', body, footer });
  }

  async function confirmDelete(note) {
    const ok = await MLO.Modal.confirm({ title: 'Delete note?', message: `"${note.title}" will be removed permanently.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, note.id);
    MLO.Toast.success('Note deleted');
    MLO.Modal.close();
    MLO.Router.renderCurrent();
  }

  /* ── FILTER + GRID (search updates grid only, to keep input focus) ── */
  function getFilteredNotes() {
    let notes = MLO.Storage.getCollection(COLLECTION);
    if (categoryFilter !== 'All') notes = notes.filter((n) => n.category === categoryFilter);
    if (pinnedOnly) notes = notes.filter((n) => n.pinned);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      notes = notes.filter((n) => n.title.toLowerCase().includes(q) || stripHtml(n.body).toLowerCase().includes(q));
    }
    return notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }

  function noteCardHtml(n) {
    const excerpt = stripHtml(n.body);
    return `
      <div class="note-card note-color-${n.color || 6} ${n.pinned ? 'pinned' : ''} slide-up" data-note-id="${n.id}">
        <div class="note-card-title">${U().escapeHtml(n.title)}</div>
        <div class="note-card-body">${U().escapeHtml(excerpt)}</div>
        <div class="note-card-footer">
          <span class="note-card-date">${U().timeAgo(n.updatedAt || n.createdAt)}</span>
          ${n.attachments && n.attachments.length ? `<span class="text-xs text-muted">📎 ${n.attachments.length}</span>` : ''}
        </div>
      </div>`;
  }

  function renderGridInto(grid) {
    const notes = getFilteredNotes();
    if (!notes.length) {
      grid.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No notes found</div><div class="empty-desc">Try a different search or category, or create a new note.</div></div>`;
      return;
    }
    grid.innerHTML = `<div class="notes-grid stagger">${notes.map(noteCardHtml).join('')}</div>`;
    grid.querySelectorAll('[data-note-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const note = MLO.Storage.findById(COLLECTION, card.dataset.noteId);
        if (note) openEditor(note);
      });
    });
  }

  /* ── MAIN RENDER ─────────────────────────────────────────── */
  function render(container) {
    const total = MLO.Storage.getCollection(COLLECTION).length;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Notes</div>
          <div class="module-page-sub">${total} note${total === 1 ? '' : 's'}</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-note-btn">+ Add</button></div>
      </div>

      <div class="form-group">
        <input type="search" class="form-input" id="notes-search-input" placeholder="Search notes…" value="${U().escapeHtml(searchQuery)}">
      </div>

      <div class="filter-tabs">
        <div class="chip ${pinnedOnly ? 'active' : ''}" id="pinned-filter-chip">📌 Pinned</div>
        ${['All', ...CATEGORIES].map((c) => `<div class="chip ${categoryFilter === c ? 'active' : ''}" data-cat="${c}">${c}</div>`).join('')}
      </div>

      <div id="notes-grid"></div>
    `;

    const grid = container.querySelector('#notes-grid');
    renderGridInto(grid);

    container.querySelector('#add-note-btn').addEventListener('click', () => openEditor());
    container.querySelector('#notes-search-input').addEventListener('input', U().debounce((e) => {
      searchQuery = e.target.value;
      renderGridInto(grid);
    }, 200));
    container.querySelector('#pinned-filter-chip').addEventListener('click', () => { pinnedOnly = !pinnedOnly; MLO.Router.renderCurrent(); });
    container.querySelectorAll('[data-cat]').forEach((chip) => chip.addEventListener('click', () => { categoryFilter = chip.dataset.cat; MLO.Router.renderCurrent(); }));
  }

  MLO.registerModule({
    id: 'notes',
    label: 'Notes',
    icon: '📝',
    inBottomNav: true,
    render,
    getFabAction() { return { icon: '+', label: 'New Note', onClick: () => openEditor() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((n) => n.title.toLowerCase().includes(q) || stripHtml(n.body).toLowerCase().includes(q))
        .map((n) => ({ id: n.id, icon: n.pinned ? '📌' : '📝', title: n.title, sub: n.category }));
    },
  });
})();
