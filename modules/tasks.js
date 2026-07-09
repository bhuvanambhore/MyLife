/* ═══════════════════════════════════════════════════════════════
   MODULE: TASKS
   To-do list with priority levels, categories, due dates, simple
   recurrence (auto-creates the next occurrence on completion), and
   a lightweight foreground reminder engine (Notification API).
   ─────────────────────────────────────────────────────────────
   Task shape: {
     id, title, notes, priority:'high'|'medium'|'low', category,
     dueDate:'YYYY-MM-DD'|null, recurring:'none'|'daily'|'weekly'|'monthly',
     reminderTime:'HH:MM'|null, completed:bool, completedAt, notifiedAt
   }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'tasks';
  const CATEGORIES = ['Personal', 'Work', 'Office', 'Health', 'Finance', 'Shopping', 'Errands', 'Other'];

  let currentFilter = 'active'; // active | all | completed | overdue
  let currentCategory = 'All';

  /* ── RECURRENCE ──────────────────────────────────────────── */
  function computeNextDueDate(dueISO, recurring) {
    const d = new Date(dueISO);
    if (recurring === 'daily') d.setDate(d.getDate() + 1);
    else if (recurring === 'weekly') d.setDate(d.getDate() + 7);
    else if (recurring === 'monthly') d.setMonth(d.getMonth() + 1);
    return U().toISODate(d);
  }

  function toggleComplete(id) {
    const task = MLO.Storage.findById(COLLECTION, id);
    if (!task) return;
    const completing = !task.completed;
    MLO.Storage.update(COLLECTION, id, { completed: completing, completedAt: completing ? Date.now() : null });

    if (completing && task.recurring && task.recurring !== 'none' && task.dueDate) {
      MLO.Storage.insert(COLLECTION, {
        title: task.title, notes: task.notes, priority: task.priority, category: task.category,
        dueDate: computeNextDueDate(task.dueDate, task.recurring), recurring: task.recurring,
        completed: false, reminderTime: task.reminderTime || null,
      });
    }
    U().vibrate(15);
  }

  /* ── REMINDER ENGINE (foreground; see security.js for the
        biometric-style native hook pattern this could extend) ── */
  function fireReminder(task) {
    MLO.Toast.warning(`Reminder: ${task.title}`, 5000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('My Life OS', { body: task.title, icon: 'assets/icons/icon-192.png' }); } catch (e) {}
    }
  }
  function checkReminders() {
    const now = new Date();
    const todayISO = U().toISODate(now);
    const hm = `${U().pad2(now.getHours())}:${U().pad2(now.getMinutes())}`;
    MLO.Storage.getCollection(COLLECTION).forEach((t) => {
      if (t.completed || !t.reminderTime || t.dueDate !== todayISO) return;
      if (t.reminderTime === hm && t.notifiedAt !== todayISO) {
        fireReminder(t);
        MLO.Storage.update(COLLECTION, t.id, { notifiedAt: todayISO });
      }
    });
  }
  setInterval(checkReminders, 20000);

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openFormModal(existing) {
    let priority = existing ? existing.priority : 'medium';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Task</label>
        <input type="text" class="form-input" id="task-title-input" placeholder="What needs to be done?" value="${existing ? U().escapeHtml(existing.title) : ''}" maxlength="120">
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="task-notes-input" placeholder="Any details…" style="min-height:70px;">${existing ? U().escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Priority</label>
        <div style="display:flex;gap:8px;">
          <button type="button" class="chip" data-pri="high" style="flex:1;">🔴 High</button>
          <button type="button" class="chip" data-pri="medium" style="flex:1;">🟡 Medium</button>
          <button type="button" class="chip" data-pri="low" style="flex:1;">🟢 Low</button>
        </div>
      </div>
      <div class="input-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="task-category-input">
            ${CATEGORIES.map((c) => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Due Date</label>
          <input type="date" class="form-input" id="task-due-input" value="${existing && existing.dueDate ? existing.dueDate : ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Repeat</label>
        <select class="form-select" id="task-recurring-input">
          <option value="none" ${!existing || existing.recurring === 'none' ? 'selected' : ''}>Does not repeat</option>
          <option value="daily" ${existing && existing.recurring === 'daily' ? 'selected' : ''}>Daily</option>
          <option value="weekly" ${existing && existing.recurring === 'weekly' ? 'selected' : ''}>Weekly</option>
          <option value="monthly" ${existing && existing.recurring === 'monthly' ? 'selected' : ''}>Monthly</option>
        </select>
      </div>
      <div class="form-group">
        <div class="toggle-wrap" id="reminder-toggle-wrap">
          <div class="toggle-switch ${existing && existing.reminderTime ? 'on' : ''}" id="reminder-toggle"></div>
          <span class="toggle-label">Remind me</span>
        </div>
        <input type="time" class="form-input mt-3 ${existing && existing.reminderTime ? '' : 'hidden'}" id="task-reminder-input" value="${existing && existing.reminderTime ? existing.reminderTime : '09:00'}">
      </div>
    `;

    body.querySelectorAll('[data-pri]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.pri === priority);
      btn.addEventListener('click', () => {
        priority = btn.dataset.pri;
        body.querySelectorAll('[data-pri]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    const remToggle = body.querySelector('#reminder-toggle');
    const remInput = body.querySelector('#task-reminder-input');
    body.querySelector('#reminder-toggle-wrap').addEventListener('click', () => {
      const on = !remToggle.classList.contains('on');
      remToggle.classList.toggle('on', on);
      remInput.classList.toggle('hidden', !on);
      if (on && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    });

    MLO.Modal.open({
      title: existing ? 'Edit Task' : 'New Task',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Add Task',
          class: 'btn-primary',
          onClick: () => {
            const title = body.querySelector('#task-title-input').value.trim();
            if (!title) { MLO.Toast.error('Task needs a title'); return; }
            const payload = {
              title,
              notes: body.querySelector('#task-notes-input').value.trim(),
              priority,
              category: body.querySelector('#task-category-input').value,
              dueDate: body.querySelector('#task-due-input').value || null,
              recurring: body.querySelector('#task-recurring-input').value,
              reminderTime: remToggle.classList.contains('on') ? remInput.value : null,
            };
            if (existing) {
              MLO.Storage.update(COLLECTION, existing.id, payload);
              MLO.Toast.success('Task updated');
            } else {
              MLO.Storage.insert(COLLECTION, Object.assign({ completed: false }, payload));
              MLO.Toast.success('Task added');
            }
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  async function confirmDelete(task) {
    const ok = await MLO.Modal.confirm({ title: 'Delete task?', message: `"${task.title}" will be removed permanently.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, task.id);
    MLO.Toast.success('Task deleted');
    MLO.Router.renderCurrent();
  }

  /* ── FILTERING ───────────────────────────────────────────── */
  function getFiltered() {
    const todayISO = U().toISODate(new Date());
    let list = MLO.Storage.getCollection(COLLECTION);

    if (currentCategory !== 'All') list = list.filter((t) => t.category === currentCategory);

    if (currentFilter === 'active') list = list.filter((t) => !t.completed);
    else if (currentFilter === 'completed') list = list.filter((t) => t.completed);
    else if (currentFilter === 'overdue') list = list.filter((t) => !t.completed && t.dueDate && t.dueDate < todayISO);

    return list;
  }

  function renderTaskRow(t) {
    const todayISO = U().toISODate(new Date());
    const overdue = !t.completed && t.dueDate && t.dueDate < todayISO;
    const recurIcon = t.recurring && t.recurring !== 'none' ? ' 🔁' : '';
    return `
      <div class="task-item ${t.completed ? 'completed' : ''}" data-task-id="${t.id}">
        <button class="task-check ${t.completed ? 'checked' : ''}" data-check="${t.id}"></button>
        <div class="task-body" data-edit="${t.id}">
          <div class="task-title">${U().escapeHtml(t.title)}${recurIcon}</div>
          <div class="task-meta">
            <span class="badge badge-${t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'green'}">${t.priority}</span>
            <span class="badge badge-gray">${U().escapeHtml(t.category)}</span>
            ${t.dueDate ? `<span class="task-due ${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : '📅 '}${U().formatDateShort(t.dueDate)}</span>` : ''}
            ${t.reminderTime ? `<span class="task-due">⏰ ${t.reminderTime}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-action-btn" data-delete="${t.id}">🗑️</button>
        </div>
      </div>`;
  }

  function render(container) {
    const all = MLO.Storage.getCollection(COLLECTION);
    const activeCount = all.filter((t) => !t.completed).length;
    const todayISO = U().toISODate(new Date());
    const overdueCount = all.filter((t) => !t.completed && t.dueDate && t.dueDate < todayISO).length;
    const categoriesInUse = ['All', ...new Set(all.map((t) => t.category).filter(Boolean))];

    const filtered = getFiltered();
    const overdue = filtered.filter((t) => !t.completed && t.dueDate && t.dueDate < todayISO);
    const today = filtered.filter((t) => !t.completed && t.dueDate === todayISO);
    const upcoming = filtered.filter((t) => !t.completed && t.dueDate && t.dueDate > todayISO);
    const noDate = filtered.filter((t) => !t.completed && !t.dueDate);
    const completed = filtered.filter((t) => t.completed);

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Tasks</div>
          <div class="module-page-sub">${activeCount} active${overdueCount ? ` · ${overdueCount} overdue` : ''}</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-task-btn">+ Add</button></div>
      </div>

      <div class="filter-tabs">
        ${['active', 'all', 'completed', 'overdue'].map((f) => `<div class="chip ${currentFilter === f ? 'active' : ''}" data-filter="${f}">${f.charAt(0).toUpperCase() + f.slice(1)}</div>`).join('')}
      </div>
      ${categoriesInUse.length > 1 ? `
      <div class="filter-tabs">
        ${categoriesInUse.map((c) => `<div class="chip ${currentCategory === c ? 'active' : ''}" data-category="${c}">${c}</div>`).join('')}
      </div>` : ''}

      <div id="tasks-sections"></div>
    `;

    const sections = document.getElementById('tasks-sections');
    let html = '';
    const section = (label, items) => items.length ? `<div class="section-title">${label} (${items.length})</div>${items.map(renderTaskRow).join('')}` : '';

    if (currentFilter === 'completed') {
      html = section('Completed', completed) || emptyHtml('No completed tasks yet');
    } else if (currentFilter === 'overdue') {
      html = section('Overdue', overdue) || emptyHtml('Nothing overdue — great job!');
    } else if (currentFilter === 'all') {
      html = section('Overdue', overdue) + section('Today', today) + section('Upcoming', upcoming) + section('No Due Date', noDate) + section('Completed', completed);
      if (!html) html = emptyHtml('No tasks yet — add your first one');
    } else {
      html = section('Overdue', overdue) + section('Today', today) + section('Upcoming', upcoming) + section('No Due Date', noDate);
      if (!html) html = emptyHtml('All caught up! Add a new task to get going.');
    }
    sections.innerHTML = html;

    bindEvents(container);
  }

  function emptyHtml(msg) {
    return `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-desc">${msg}</div></div>`;
  }

  function bindEvents(container) {
    container.querySelector('#add-task-btn')?.addEventListener('click', () => openFormModal());
    container.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('click', () => { currentFilter = el.dataset.filter; MLO.Router.renderCurrent(); });
    });
    container.querySelectorAll('[data-category]').forEach((el) => {
      el.addEventListener('click', () => { currentCategory = el.dataset.category; MLO.Router.renderCurrent(); });
    });
    container.querySelectorAll('[data-check]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggleComplete(btn.dataset.check); MLO.Router.renderCurrent(); });
    });
    container.querySelectorAll('[data-edit]').forEach((el) => {
      el.addEventListener('click', () => {
        const task = MLO.Storage.findById(COLLECTION, el.dataset.edit);
        if (task) openFormModal(task);
      });
    });
    container.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const task = MLO.Storage.findById(COLLECTION, btn.dataset.delete);
        if (task) confirmDelete(task);
      });
    });
  }

  MLO.registerModule({
    id: 'tasks',
    label: 'Tasks',
    icon: '✅',
    inBottomNav: true,
    render,
    getFabAction() { return { icon: '+', label: 'Add Task', onClick: () => openFormModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((t) => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))
        .map((t) => ({ id: t.id, icon: t.completed ? '✅' : '⬜', title: t.title, sub: t.category }));
    },
  });
})();
