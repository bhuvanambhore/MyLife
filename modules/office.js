/* ═══════════════════════════════════════════════════════════════
   MODULE: OFFICE WORKSPACE
   Five focused sub-tabs sharing one module shell:
     Team Busy List · Daily Reports · Office Notes ·
     Shift Planner · Quick Shortcuts
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;

  const TEAM_COL = 'officeTeam';
  const REPORTS_COL = 'officeReports';
  const NOTES_COL = 'officeNotes';
  const SHIFTS_COL = 'officeShifts';
  const SHORTCUTS_COL = 'officeShortcuts';

  const STATUS_CYCLE = ['active', 'break', 'wfh', 'out'];
  const STATUS_LABEL = { active: 'Active', break: 'On Break', out: 'Out', wfh: 'WFH' };
  const SHIFT_TYPES = ['Morning', 'Evening', 'Night', 'Off'];
  const SHORTCUT_ICONS = ['🔗', '📊', '📁', '📧', '💬', '🖥️', '📋', '🔧'];

  let currentTab = 'team';
  let shiftWeekAnchor = U().toISODate(new Date());

  const TABS = [
    { id: 'team', label: 'Team' },
    { id: 'reports', label: 'Reports' },
    { id: 'notes', label: 'Notes' },
    { id: 'shifts', label: 'Shifts' },
    { id: 'shortcuts', label: 'Shortcuts' },
  ];

  /* ════════════════ TEAM BUSY LIST ════════════════ */
  function openTeamModal(existing) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input type="text" class="form-input" id="member-name-input" value="${existing ? U().escapeHtml(existing.name) : ''}" maxlength="30" placeholder="e.g., Priya">
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" class="form-input" id="member-note-input" value="${existing ? U().escapeHtml(existing.note || '') : ''}" placeholder="e.g., In a client call until 3pm">
      </div>
    `;
    const footer = [
      { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
      {
        label: existing ? 'Save' : 'Add',
        class: 'btn-primary',
        onClick: () => {
          const name = body.querySelector('#member-name-input').value.trim();
          if (!name) { MLO.Toast.error('Enter a name'); return; }
          const note = body.querySelector('#member-note-input').value.trim();
          if (existing) MLO.Storage.update(TEAM_COL, existing.id, { name, note });
          else MLO.Storage.insert(TEAM_COL, { name, note, status: 'active' });
          MLO.Modal.close();
          MLO.Router.renderCurrent();
        },
      },
    ];
    if (existing) footer.unshift({ label: 'Remove', class: 'btn-danger', onClick: () => { MLO.Storage.delete(TEAM_COL, existing.id); MLO.Modal.close(); MLO.Router.renderCurrent(); } });
    MLO.Modal.open({ title: existing ? 'Edit Member' : 'Add Team Member', body, footer });
  }

  function cycleStatus(id) {
    const m = MLO.Storage.findById(TEAM_COL, id);
    if (!m) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(m.status) + 1) % STATUS_CYCLE.length];
    MLO.Storage.update(TEAM_COL, id, { status: next });
    MLO.Router.renderCurrent();
  }

  function renderTeamTab() {
    const team = MLO.Storage.getCollection(TEAM_COL);
    if (!team.length) return emptyState('👥', 'No team members yet', 'Add your team to track who\'s active, on break, or out.');
    return `<div class="team-grid stagger">${team.map((m) => `
      <div class="team-member-card slide-up" data-edit-member="${m.id}">
        <div class="member-avatar" style="color:${U().colorFromSeed(m.name)};">${m.name.charAt(0).toUpperCase()}</div>
        <div class="member-name">${U().escapeHtml(m.name)}</div>
        ${m.note ? `<div class="text-xs text-muted mt-3" style="margin-top:4px;">${U().escapeHtml(m.note)}</div>` : ''}
        <span class="member-status status-${m.status}" data-cycle-status="${m.id}">${STATUS_LABEL[m.status]}</span>
      </div>`).join('')}</div>`;
  }

  /* ════════════════ DAILY REPORTS ════════════════ */
  function openReportModal() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="input-row">
        <div class="form-group" style="flex:1;">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" id="report-date-input" value="${U().toISODate(new Date())}">
        </div>
        <div class="form-group" style="flex:2;">
          <label class="form-label">Title</label>
          <input type="text" class="form-input" id="report-title-input" value="Daily Report" maxlength="60">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Content</label>
        <textarea class="form-textarea" id="report-content-input" style="min-height:140px;" placeholder="Summary of today's work, issues, follow-ups…"></textarea>
      </div>
    `;
    MLO.Modal.open({
      title: 'New Daily Report',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: 'Save Report',
          class: 'btn-primary',
          onClick: () => {
            const content = body.querySelector('#report-content-input').value.trim();
            if (!content) { MLO.Toast.error('Report content can\'t be empty'); return; }
            MLO.Storage.insert(REPORTS_COL, {
              date: body.querySelector('#report-date-input').value,
              title: body.querySelector('#report-title-input').value.trim() || 'Daily Report',
              content,
            });
            MLO.Toast.success('Report saved');
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function copyReport(report) {
    const text = `*${report.title}*\n${U().formatDateLong(report.date)}\n\n${report.content}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => MLO.Toast.success('Copied — ready to paste'))
        .catch(() => MLO.Toast.error('Could not copy'));
    } else {
      MLO.Toast.error('Clipboard not available');
    }
  }

  function renderReportsTab() {
    const reports = MLO.Storage.getCollection(REPORTS_COL).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!reports.length) return emptyState('📋', 'No reports yet', 'Log a daily report to keep a record of work and issues.');
    return reports.map((r) => `
      <div class="card mb-3" data-report-id="${r.id}">
        <div class="card-header" style="margin-bottom:8px;">
          <span class="card-title">${U().escapeHtml(r.title)}</span>
          <span class="text-xs text-muted">${U().formatDateShort(r.date)}</span>
        </div>
        <p class="text-sm" style="color:var(--txt-2);white-space:pre-wrap;">${U().escapeHtml(r.content.length > 180 ? r.content.slice(0, 180) + '…' : r.content)}</p>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-secondary btn-sm" data-copy-report="${r.id}">📋 Copy</button>
          <button class="btn btn-danger btn-sm" data-delete-report="${r.id}">Delete</button>
        </div>
      </div>`).join('');
  }

  /* ════════════════ OFFICE NOTES (lightweight) ════════════════ */
  function openQuickNoteModal() {
    const body = document.createElement('div');
    body.innerHTML = `<div class="form-group"><textarea class="form-textarea" id="qnote-input" style="min-height:100px;" placeholder="Quick note for the office…"></textarea></div>`;
    MLO.Modal.open({
      title: 'New Office Note',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: 'Add',
          class: 'btn-primary',
          onClick: () => {
            const text = body.querySelector('#qnote-input').value.trim();
            if (!text) { MLO.Toast.error('Note is empty'); return; }
            MLO.Storage.insert(NOTES_COL, { text });
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function renderOfficeNotesTab() {
    const notes = MLO.Storage.getCollection(NOTES_COL);
    if (!notes.length) return emptyState('🗒️', 'No office notes', 'Jot down quick reminders for the team.');
    return `<div class="notes-grid stagger">${notes.map((n, i) => `
      <div class="note-card note-color-${(i % 6) + 1} slide-up" data-note-id="${n.id}">
        <div class="note-card-body">${U().escapeHtml(n.text)}</div>
        <div class="note-card-footer">
          <span class="note-card-date">${U().timeAgo(n.createdAt)}</span>
          <button class="task-action-btn" data-delete-onote="${n.id}">🗑️</button>
        </div>
      </div>`).join('')}</div>`;
  }

  /* ════════════════ SHIFT PLANNER ════════════════ */
  function getWeekDates(anchorISO) {
    const d = new Date(anchorISO);
    d.setDate(d.getDate() - d.getDay());
    const arr = [];
    for (let i = 0; i < 7; i++) { arr.push(U().toISODate(d)); d.setDate(d.getDate() + 1); }
    return arr;
  }

  function openShiftModal() {
    const team = MLO.Storage.getCollection(TEAM_COL);
    let shiftType = 'Morning';
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Person</label>
        <input type="text" class="form-input" id="shift-person-input" list="team-names" placeholder="Name">
        <datalist id="team-names">${team.map((m) => `<option value="${U().escapeHtml(m.name)}">`).join('')}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" class="form-input" id="shift-date-input" value="${U().toISODate(new Date())}">
      </div>
      <div class="form-group">
        <label class="form-label">Shift</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${SHIFT_TYPES.map((s) => `<button type="button" class="chip ${s === shiftType ? 'active' : ''}" data-shift="${s}">${s}</button>`).join('')}
        </div>
      </div>
    `;
    body.querySelectorAll('[data-shift]').forEach((btn) => {
      btn.addEventListener('click', () => {
        shiftType = btn.dataset.shift;
        body.querySelectorAll('[data-shift]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    MLO.Modal.open({
      title: 'Add Shift',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: 'Add',
          class: 'btn-primary',
          onClick: () => {
            const person = body.querySelector('#shift-person-input').value.trim();
            if (!person) { MLO.Toast.error('Enter a person'); return; }
            MLO.Storage.insert(SHIFTS_COL, { person, date: body.querySelector('#shift-date-input').value, shiftType });
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function renderShiftsTab() {
    const week = getWeekDates(shiftWeekAnchor);
    const shifts = MLO.Storage.getCollection(SHIFTS_COL);

    const nav = `
      <div class="flex-between mb-3">
        <button class="icon-btn ripple" id="shift-prev-week">‹</button>
        <span class="text-sm font-bold">${U().formatDateShort(week[0])} – ${U().formatDateShort(week[6])}</span>
        <button class="icon-btn ripple" id="shift-next-week">›</button>
      </div>`;

    const days = week.map((iso) => {
      const dayShifts = shifts.filter((s) => s.date === iso);
      return `
        <div class="mb-3">
          <div class="text-xs text-muted font-bold" style="margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">${U().DAYS[new Date(iso).getDay()]}, ${U().formatDateShort(iso)}</div>
          ${dayShifts.length ? dayShifts.map((s) => `
            <div class="list-item" style="cursor:default;" data-shift-id="${s.id}">
              <span class="list-item-icon">🕒</span>
              <div class="list-item-main"><div class="list-item-title">${U().escapeHtml(s.person)}</div><div class="list-item-sub">${s.shiftType} Shift</div></div>
              <button class="task-action-btn" data-delete-shift="${s.id}">🗑️</button>
            </div>`).join('') : `<div class="text-xs text-muted" style="padding-left:4px;">No shifts assigned</div>`}
        </div>`;
    }).join('');

    return nav + days;
  }

  /* ════════════════ QUICK SHORTCUTS ════════════════ */
  function openShortcutModal() {
    let icon = SHORTCUT_ICONS[0];
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Label</label>
        <input type="text" class="form-input" id="sc-label-input" placeholder="e.g., Client Report Portal" maxlength="40">
      </div>
      <div class="form-group">
        <label class="form-label">URL</label>
        <input type="url" class="form-input" id="sc-url-input" placeholder="https://…">
      </div>
      <div class="form-group">
        <label class="form-label">Icon</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${SHORTCUT_ICONS.map((ic) => `<button type="button" class="chip ${ic === icon ? 'active' : ''}" data-icon="${ic}" style="font-size:16px;">${ic}</button>`).join('')}
        </div>
      </div>
    `;
    body.querySelectorAll('[data-icon]').forEach((btn) => {
      btn.addEventListener('click', () => { icon = btn.dataset.icon; body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('active', b === btn)); });
    });
    MLO.Modal.open({
      title: 'Add Shortcut',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: 'Add',
          class: 'btn-primary',
          onClick: () => {
            const label = body.querySelector('#sc-label-input').value.trim();
            let url = body.querySelector('#sc-url-input').value.trim();
            if (!label || !url) { MLO.Toast.error('Label and URL are required'); return; }
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            MLO.Storage.insert(SHORTCUTS_COL, { label, url, icon });
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function renderShortcutsTab() {
    const shortcuts = MLO.Storage.getCollection(SHORTCUTS_COL);
    if (!shortcuts.length) return emptyState('🔗', 'No shortcuts yet', 'Pin your most-used office tools, portals, and reports here.');
    return `<div class="dash-quick-grid stagger">${shortcuts.map((s) => `
      <div class="quick-action-card slide-up" style="position:relative;" data-open-shortcut="${s.id}">
        <span class="qa-icon">${s.icon}</span><span class="qa-label">${U().escapeHtml(s.label)}</span>
        <button class="task-action-btn" data-delete-shortcut="${s.id}" style="position:absolute;top:4px;right:4px;">✕</button>
      </div>`).join('')}</div>`;
  }

  /* ════════════════ SHARED HELPERS ════════════════ */
  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  /* ════════════════ MAIN RENDER ════════════════ */
  function render(container) {
    const tabRenderers = { team: renderTeamTab, reports: renderReportsTab, notes: renderOfficeNotesTab, shifts: renderShiftsTab, shortcuts: renderShortcutsTab };

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Office Workspace</div>
          <div class="module-page-sub">Team, reports & daily operations</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="office-add-btn">+ Add</button></div>
      </div>
      <div class="filter-tabs">
        ${TABS.map((t) => `<div class="chip ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="office-tab-content"></div>
    `;

    document.getElementById('office-tab-content').innerHTML = tabRenderers[currentTab]();
    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => { currentTab = el.dataset.tab; MLO.Router.renderCurrent(); });
    });
    container.querySelector('#office-add-btn')?.addEventListener('click', () => getAddHandler()());

    // Team
    container.querySelectorAll('[data-edit-member]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cycle-status]')) return;
      openTeamModal(MLO.Storage.findById(TEAM_COL, el.dataset.editMember));
    }));
    container.querySelectorAll('[data-cycle-status]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); cycleStatus(el.dataset.cycleStatus); }));

    // Reports
    container.querySelectorAll('[data-copy-report]').forEach((btn) => btn.addEventListener('click', () => copyReport(MLO.Storage.findById(REPORTS_COL, btn.dataset.copyReport))));
    container.querySelectorAll('[data-delete-report]').forEach((btn) => btn.addEventListener('click', () => { MLO.Storage.delete(REPORTS_COL, btn.dataset.deleteReport); MLO.Router.renderCurrent(); }));

    // Office notes
    container.querySelectorAll('[data-delete-onote]').forEach((btn) => btn.addEventListener('click', () => { MLO.Storage.delete(NOTES_COL, btn.dataset.deleteOnote); MLO.Router.renderCurrent(); }));

    // Shifts
    container.querySelector('#shift-prev-week')?.addEventListener('click', () => { const d = new Date(shiftWeekAnchor); d.setDate(d.getDate() - 7); shiftWeekAnchor = U().toISODate(d); MLO.Router.renderCurrent(); });
    container.querySelector('#shift-next-week')?.addEventListener('click', () => { const d = new Date(shiftWeekAnchor); d.setDate(d.getDate() + 7); shiftWeekAnchor = U().toISODate(d); MLO.Router.renderCurrent(); });
    container.querySelectorAll('[data-delete-shift]').forEach((btn) => btn.addEventListener('click', () => { MLO.Storage.delete(SHIFTS_COL, btn.dataset.deleteShift); MLO.Router.renderCurrent(); }));

    // Shortcuts
    container.querySelectorAll('[data-open-shortcut]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-shortcut]')) return;
      const s = MLO.Storage.findById(SHORTCUTS_COL, el.dataset.openShortcut);
      if (s) window.open(s.url, '_blank', 'noopener');
    }));
    container.querySelectorAll('[data-delete-shortcut]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); MLO.Storage.delete(SHORTCUTS_COL, btn.dataset.deleteShortcut); MLO.Router.renderCurrent(); }));
  }

  function getAddHandler() {
    return { team: openTeamModal, reports: openReportModal, notes: openQuickNoteModal, shifts: openShiftModal, shortcuts: openShortcutModal }[currentTab] || openTeamModal;
  }

  MLO.registerModule({
    id: 'office',
    label: 'Office',
    icon: '🏢',
    inBottomNav: false,
    render,
    getFabAction() {
      const labels = { team: 'Add Member', reports: 'New Report', notes: 'Add Note', shifts: 'Add Shift', shortcuts: 'Add Shortcut' };
      return { icon: '+', label: labels[currentTab], onClick: () => getAddHandler()() };
    },
    search(query) {
      const q = query.toLowerCase();
      const hits = [];
      MLO.Storage.getCollection(TEAM_COL).filter((m) => m.name.toLowerCase().includes(q)).forEach((m) => hits.push({ id: m.id, icon: '👤', title: m.name, sub: STATUS_LABEL[m.status] }));
      MLO.Storage.getCollection(SHORTCUTS_COL).filter((s) => s.label.toLowerCase().includes(q)).forEach((s) => hits.push({ id: s.id, icon: s.icon, title: s.label, sub: 'Shortcut' }));
      return hits;
    },
  });
})();
