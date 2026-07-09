/* ═══════════════════════════════════════════════════════════════
   MODULE: HABITS
   Daily habit tracker with streak counting, a 7-day dot tracker on
   each card, and a detail view with a monthly heat-grid + charts.
   ─────────────────────────────────────────────────────────────
   Habit record shape: { id, name, icon, history: ['YYYY-MM-DD',…] }
   `history` holds one ISO date string per day the habit was done.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'habits';

  const ICON_CHOICES = ['💧','📖','🏃','🧘','💤','🥗','💊','✍️','🎯','🚭','📵','🙏','🎵','🎨','💻','☕'];

  /* ── STREAK MATH (shared with Dashboard) ────────────────────── */
  function computeStreak(history) {
    if (!history || !history.length) return 0;
    const set = new Set(history);
    const cursor = new Date();
    if (!set.has(U().toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (set.has(U().toISODate(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function computeBestStreak(history) {
    if (!history || !history.length) return 0;
    const sorted = [...new Set(history)].sort();
    let best = 1, cur = 1;
    for (let i = 1; i < sorted.length; i++) {
      const diff = Math.round((new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000);
      if (diff === 1) { cur++; best = Math.max(best, cur); } else { cur = 1; }
    }
    return Math.max(best, 1);
  }

  function lastNDays(n) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      arr.push(U().toISODate(d));
    }
    return arr;
  }

  function toggleToday(id) {
    const habit = MLO.Storage.findById(COLLECTION, id);
    if (!habit) return null;
    const today = U().toISODate(new Date());
    const history = habit.history || [];
    const idx = history.indexOf(today);
    const nextHistory = idx > -1 ? history.filter((d) => d !== today) : [...history, today];
    U().vibrate(15);
    return MLO.Storage.update(COLLECTION, id, { history: nextHistory });
  }

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openAddModal(existing) {
    let selectedIcon = existing ? existing.icon : ICON_CHOICES[0];

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Habit Name</label>
        <input type="text" class="form-input" id="habit-name-input" placeholder="e.g., Drink Water" value="${existing ? U().escapeHtml(existing.name) : ''}" maxlength="40">
      </div>
      <div class="form-group">
        <label class="form-label">Icon</label>
        <div id="habit-icon-grid" style="display:flex;flex-wrap:wrap;gap:8px;">
          ${ICON_CHOICES.map((ic) => `<button type="button" class="chip ${ic === selectedIcon ? 'active' : ''}" data-icon="${ic}" style="font-size:18px;padding:8px 12px;">${ic}</button>`).join('')}
        </div>
      </div>
    `;
    body.querySelectorAll('[data-icon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedIcon = btn.dataset.icon;
        body.querySelectorAll('[data-icon]').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    MLO.Modal.open({
      title: existing ? 'Edit Habit' : 'Add Habit',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Create',
          class: 'btn-primary',
          onClick: () => {
            const name = body.querySelector('#habit-name-input').value.trim();
            if (!name) { MLO.Toast.error('Give your habit a name'); return; }
            if (existing) {
              MLO.Storage.update(COLLECTION, existing.id, { name, icon: selectedIcon });
              MLO.Toast.success('Habit updated');
            } else {
              MLO.Storage.insert(COLLECTION, { name, icon: selectedIcon, history: [] });
              MLO.Toast.success('Habit created');
            }
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  /* ── DETAIL / STATS MODAL ────────────────────────────────── */
  function openDetailModal(habit) {
    const streak = computeStreak(habit.history);
    const best = computeBestStreak(habit.history);
    const total = (habit.history || []).length;

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card"><div class="stat-value">${streak}</div><div class="stat-label">Current Streak</div></div>
        <div class="stat-card"><div class="stat-value">${best}</div><div class="stat-label">Best Streak</div></div>
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total Days</div></div>
        <div class="stat-card"><div class="stat-value">${monthCompletionPct(habit)}%</div><div class="stat-label">This Month</div></div>
      </div>
      <div class="chart-title">Last 14 Days</div>
      <canvas id="habit-detail-chart" data-height="120" style="width:100%;margin-bottom:var(--sp-4);"></canvas>
      <div class="chart-title">This Month</div>
      <div id="habit-month-grid" class="cal-grid" style="margin-bottom:var(--sp-2);"></div>
    `;

    MLO.Modal.open({
      title: `${habit.icon} ${habit.name}`,
      body,
      footer: [
        { label: 'Delete', class: 'btn-danger', onClick: () => confirmDelete(habit) },
        { label: 'Edit', class: 'btn-secondary', onClick: () => { MLO.Modal.close(); openAddModal(habit); } },
        { label: 'Close', class: 'btn-primary', onClick: () => MLO.Modal.close() },
      ],
    });

    const days = lastNDays(14);
    const set = new Set(habit.history || []);
    MLO.Charts.bar(document.getElementById('habit-detail-chart'), {
      labels: days.map((d) => String(new Date(d).getDate())),
      data: days.map((d) => (set.has(d) ? 1 : 0)),
    });

    renderMonthGrid(document.getElementById('habit-month-grid'), habit);
  }

  function monthCompletionPct(habit) {
    const now = new Date();
    const days = U().daysInMonth(now.getFullYear(), now.getMonth());
    const ym = `${now.getFullYear()}-${U().pad2(now.getMonth() + 1)}`;
    const doneThisMonth = (habit.history || []).filter((d) => d.startsWith(ym)).length;
    const elapsedDays = now.getDate();
    return Math.round((doneThisMonth / Math.min(elapsedDays, days)) * 100) || 0;
  }

  function renderMonthGrid(el, habit) {
    if (!el) return;
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const totalDays = U().daysInMonth(year, month);
    const firstDow = new Date(year, month, 1).getDay();
    const set = new Set(habit.history || []);
    const todayISO = U().toISODate(now);

    let html = U().DAYS_SHORT.map((d) => `<div class="cal-dow">${d[0]}</div>`).join('');
    for (let i = 0; i < firstDow; i++) html += `<div class="cal-day other-month"></div>`;
    for (let day = 1; day <= totalDays; day++) {
      const iso = `${year}-${U().pad2(month + 1)}-${U().pad2(day)}`;
      const classes = ['cal-day'];
      if (iso === todayISO) classes.push('today');
      if (set.has(iso)) classes.push('selected');
      html += `<div class="${classes.join(' ')}">${day}</div>`;
    }
    el.innerHTML = html;
  }

  async function confirmDelete(habit) {
    const ok = await MLO.Modal.confirm({
      title: 'Delete this habit?',
      message: `"${habit.name}" and its full history will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, habit.id);
    MLO.Toast.success('Habit deleted');
    MLO.Modal.close();
    MLO.Router.renderCurrent();
  }

  /* ── WEEKLY OVERVIEW CHART (all habits combined) ────────────── */
  function renderOverviewChart(habits) {
    const days = lastNDays(7);
    const data = days.map((d) => habits.filter((h) => (h.history || []).includes(d)).length);
    return { labels: days.map((d) => U().DAYS_SHORT[new Date(d).getDay()]), data };
  }

  /* ── MAIN RENDER ─────────────────────────────────────────── */
  function render(container) {
    const habits = MLO.Storage.getCollection(COLLECTION);
    const todayISO = U().toISODate(new Date());
    const doneToday = habits.filter((h) => (h.history || []).includes(todayISO)).length;
    const bestOverall = habits.reduce((m, h) => Math.max(m, computeBestStreak(h.history)), 0);

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Habits</div>
          <div class="module-page-sub">${doneToday}/${habits.length} done today</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-habit-btn">+ Add</button></div>
      </div>

      ${habits.length ? `
      <div class="stats-grid mb-4">
        <div class="stat-card"><div class="stat-value">${habits.length}</div><div class="stat-label">Active Habits</div></div>
        <div class="stat-card"><div class="stat-value">${doneToday}</div><div class="stat-label">Done Today</div></div>
        <div class="stat-card"><div class="stat-value">${bestOverall}</div><div class="stat-label">Best Streak</div></div>
        <div class="stat-card"><div class="stat-value">${habits.length ? Math.round((doneToday / habits.length) * 100) : 0}%</div><div class="stat-label">Today's Rate</div></div>
      </div>

      <div class="chart-card">
        <div class="chart-title">Weekly Overview</div>
        <canvas id="habits-overview-chart" data-height="140" style="width:100%;"></canvas>
      </div>

      <div class="section-title">Your Habits</div>
      <div id="habits-list" class="stagger"></div>
      ` : `
      <div class="empty-state">
        <div class="empty-icon">🌱</div>
        <div class="empty-title">No habits yet</div>
        <div class="empty-desc">Start with something small — drink water, read a page, stretch for a minute.</div>
        <button class="btn btn-primary" id="empty-add-habit-btn">+ Add Your First Habit</button>
      </div>`}
    `;

    if (habits.length) {
      const ov = renderOverviewChart(habits);
      MLO.Charts.bar(document.getElementById('habits-overview-chart'), ov);
      renderList(habits, todayISO);
    }

    container.querySelector('#add-habit-btn')?.addEventListener('click', () => openAddModal());
    container.querySelector('#empty-add-habit-btn')?.addEventListener('click', () => openAddModal());
  }

  function renderList(habits, todayISO) {
    const list = document.getElementById('habits-list');
    if (!list) return;
    const week = lastNDays(7);

    list.innerHTML = habits.map((h) => {
      const done = (h.history || []).includes(todayISO);
      const streak = computeStreak(h.history || []);
      const dots = week.map((d) => {
        const isToday = d === todayISO;
        const isDone = (h.history || []).includes(d);
        return `<span class="h-dot ${isDone ? 'done' : ''} ${isToday ? 'today' : ''}"></span>`;
      }).join('');

      return `
        <div class="habit-card slide-up ${done ? 'done' : ''}" data-habit-id="${h.id}">
          <div class="habit-header">
            <div class="habit-icon-wrap">${h.icon}</div>
            <div style="flex:1;" data-open-detail="${h.id}">
              <div class="habit-name">${U().escapeHtml(h.name)}</div>
              <div class="habit-streak">🔥 ${streak} day streak</div>
            </div>
            <button class="habit-check-btn ${done ? 'checked' : ''}" data-toggle="${h.id}">${done ? '✓' : ''}</button>
          </div>
          <div class="habit-dots">${dots}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToday(btn.dataset.toggle);
        MLO.Router.renderCurrent();
      });
    });
    list.querySelectorAll('[data-open-detail]').forEach((el) => {
      el.addEventListener('click', () => {
        const habit = MLO.Storage.findById(COLLECTION, el.dataset.openDetail);
        if (habit) openDetailModal(habit);
      });
    });
  }

  MLO.registerModule({
    id: 'habits',
    label: 'Habits',
    icon: '🌱',
    inBottomNav: false,
    render,
    getFabAction() { return { icon: '+', label: 'Add Habit', onClick: () => openAddModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((h) => h.name.toLowerCase().includes(q))
        .map((h) => ({ id: h.id, icon: h.icon, title: h.name, sub: `${computeStreak(h.history)} day streak` }));
    },
    toggleToday,
    computeStreak,
    computeBestStreak,
  });
})();
