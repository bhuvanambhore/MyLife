/* ═══════════════════════════════════════════════════════════════
   MODULE: GOALS
   Daily / Weekly / Monthly / Yearly goals with a manual progress
   slider (0-100%, step 5) plus a quick +10% button for fast updates.
   ─────────────────────────────────────────────────────────────
   Goal shape: { id, title, type, deadline:'YYYY-MM-DD'|null,
                 progress:0-100, notes, completed:bool }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'goals';
  const TYPES = ['daily', 'weekly', 'monthly', 'yearly'];
  const TYPE_ICON = { daily: '☀️', weekly: '📆', monthly: '🗓️', yearly: '🎯' };

  let typeFilter = 'all';
  let statusFilter = 'active'; // active | completed | all

  function daysLeftLabel(deadlineISO) {
    if (!deadlineISO) return '';
    const diff = Math.ceil((new Date(deadlineISO) - U().startOfDay(new Date())) / 86400000);
    if (diff < 0) return 'Overdue';
    if (diff === 0) return 'Due today';
    if (diff === 1) return '1 day left';
    return `${diff} days left`;
  }

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openFormModal(existing) {
    let type = existing ? existing.type : 'daily';
    const progress = existing ? (existing.progress || 0) : 0;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Goal</label>
        <input type="text" class="form-input" id="goal-title-input" placeholder="What do you want to achieve?" value="${existing ? U().escapeHtml(existing.title) : ''}" maxlength="100">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${TYPES.map((t) => `<button type="button" class="chip" data-type="${t}" style="flex:1;">${TYPE_ICON[t]} ${t.charAt(0).toUpperCase() + t.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Deadline (optional)</label>
        <input type="date" class="form-input" id="goal-deadline-input" value="${existing && existing.deadline ? existing.deadline : ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Progress: <span id="goal-progress-display">${progress}%</span></label>
        <input type="range" min="0" max="100" step="5" id="goal-progress-slider" value="${progress}" style="width:100%;accent-color:#8B5CF6;">
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="goal-notes-input" style="min-height:60px;">${existing ? U().escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
    `;

    function syncType() { body.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b.dataset.type === type)); }
    body.querySelectorAll('[data-type]').forEach((btn) => btn.addEventListener('click', () => { type = btn.dataset.type; syncType(); }));
    syncType();

    const slider = body.querySelector('#goal-progress-slider');
    const display = body.querySelector('#goal-progress-display');
    slider.addEventListener('input', () => { display.textContent = slider.value + '%'; });

    const footer = [];
    if (existing) footer.push({ label: 'Delete', class: 'btn-danger', onClick: () => confirmDelete(existing) });
    footer.push({ label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() });
    footer.push({
      label: existing ? 'Save' : 'Create',
      class: 'btn-primary',
      onClick: () => {
        const title = body.querySelector('#goal-title-input').value.trim();
        if (!title) { MLO.Toast.error('Give your goal a title'); return; }
        const prog = Number(slider.value);
        const payload = {
          title, type,
          deadline: body.querySelector('#goal-deadline-input').value || null,
          progress: prog,
          notes: body.querySelector('#goal-notes-input').value.trim(),
          completed: prog >= 100,
        };
        if (existing) { MLO.Storage.update(COLLECTION, existing.id, payload); MLO.Toast.success('Goal updated'); }
        else { MLO.Storage.insert(COLLECTION, payload); MLO.Toast.success('Goal created'); }
        MLO.Modal.close();
        MLO.Router.renderCurrent();
      },
    });

    MLO.Modal.open({ title: existing ? 'Edit Goal' : 'New Goal', body, footer });
  }

  async function confirmDelete(g) {
    const ok = await MLO.Modal.confirm({ title: 'Delete goal?', message: `"${g.title}" will be removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, g.id);
    MLO.Toast.success('Goal deleted');
    MLO.Modal.close();
    MLO.Router.renderCurrent();
  }

  function quickProgress(id, delta) {
    const g = MLO.Storage.findById(COLLECTION, id);
    if (!g) return;
    const next = U().clamp((g.progress || 0) + delta, 0, 100);
    MLO.Storage.update(COLLECTION, id, { progress: next, completed: next >= 100 });
    U().vibrate(15);
    MLO.Router.renderCurrent();
  }

  function goalCard(g) {
    const dl = daysLeftLabel(g.deadline);
    return `
      <div class="goal-item slide-up" data-goal-id="${g.id}">
        <div class="goal-header">
          <span class="goal-title">${TYPE_ICON[g.type]} ${U().escapeHtml(g.title)}</span>
          <span class="badge badge-purple">${g.type}</span>
        </div>
        <div class="goal-progress-row">
          <div class="progress-bar-track" style="flex:1;"><div class="progress-bar-fill" style="width:${g.progress || 0}%;${g.completed ? 'background:var(--clr-success);' : ''}"></div></div>
          <span class="goal-pct">${g.progress || 0}%</span>
        </div>
        <div class="flex-between mt-3">
          <span class="text-xs ${dl === 'Overdue' ? '' : 'text-muted'}" style="${dl === 'Overdue' ? 'color:var(--clr-error);font-weight:700;' : ''}">${dl}</span>
          ${!g.completed ? `<button class="btn btn-ghost btn-sm" data-quick-progress="${g.id}">+10%</button>` : '<span class="badge badge-green">✓ Complete</span>'}
        </div>
      </div>`;
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  function render(container) {
    let goals = MLO.Storage.getCollection(COLLECTION);
    if (typeFilter !== 'all') goals = goals.filter((g) => g.type === typeFilter);
    if (statusFilter === 'active') goals = goals.filter((g) => !g.completed);
    else if (statusFilter === 'completed') goals = goals.filter((g) => g.completed);

    const allGoals = MLO.Storage.getCollection(COLLECTION);
    const activeCount = allGoals.filter((g) => !g.completed).length;
    const completedCount = allGoals.filter((g) => g.completed).length;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Goals</div>
          <div class="module-page-sub">${activeCount} active · ${completedCount} completed</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-goal-btn">+ Add</button></div>
      </div>
      <div class="filter-tabs">
        ${['active', 'completed', 'all'].map((s) => `<div class="chip ${statusFilter === s ? 'active' : ''}" data-status="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</div>`).join('')}
      </div>
      <div class="filter-tabs">
        ${['all', ...TYPES].map((t) => `<div class="chip ${typeFilter === t ? 'active' : ''}" data-type-filter="${t}">${t === 'all' ? 'All Types' : TYPE_ICON[t] + ' ' + t.charAt(0).toUpperCase() + t.slice(1)}</div>`).join('')}
      </div>
      <div class="stagger">
        ${goals.length ? goals.map(goalCard).join('') : emptyState('🎯', 'No goals here', 'Set a goal and track your progress over time.')}
      </div>
    `;

    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelector('#add-goal-btn')?.addEventListener('click', () => openFormModal());
    container.querySelectorAll('[data-status]').forEach((el) => el.addEventListener('click', () => { statusFilter = el.dataset.status; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-type-filter]').forEach((el) => el.addEventListener('click', () => { typeFilter = el.dataset.typeFilter; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-goal-id]').forEach((card) => card.addEventListener('click', (e) => {
      if (e.target.closest('[data-quick-progress]')) return;
      openFormModal(MLO.Storage.findById(COLLECTION, card.dataset.goalId));
    }));
    container.querySelectorAll('[data-quick-progress]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); quickProgress(btn.dataset.quickProgress, 10); }));
  }

  MLO.registerModule({
    id: 'goals',
    label: 'Goals',
    icon: '🎯',
    inBottomNav: true,
    render,
    getFabAction() { return { icon: '+', label: 'Add Goal', onClick: () => openFormModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((g) => g.title.toLowerCase().includes(q))
        .map((g) => ({ id: g.id, icon: TYPE_ICON[g.type], title: g.title, sub: `${g.progress || 0}% complete` }));
    },
  });
})();
