/* ═══════════════════════════════════════════════════════════════
   MODULE: DASHBOARD
   The landing screen — greeting, live clock, weather placeholder,
   combined daily progress (tasks + habits), quick actions, and
   live widgets pulling from Habits / Tasks / Expenses / Goals.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;

  let clockTimer = null;

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Still Up';
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    if (h < 21) return 'Good Evening';
    return 'Good Night';
  }

  /* ── DATA AGGREGATION ────────────────────────────────────── */
  function getTodayStats() {
    const todayISO = U().toISODate(new Date());

    const tasks = MLO.Storage.getCollection('tasks');
    const tasksToday = tasks.filter((t) => t.dueDate === todayISO);
    const tasksTodayDone = tasksToday.filter((t) => t.completed).length;

    const habits = MLO.Storage.getCollection('habits');
    const habitsDone = habits.filter((h) => (h.history || []).includes(todayISO)).length;

    const events = MLO.Storage.getCollection('events');
    const eventsToday = events.filter((e) => e.date === todayISO).length;

    const totalItems = tasksToday.length + habits.length;
    const doneItems = tasksTodayDone + habitsDone;
    const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

    return { todayISO, tasks, tasksToday, tasksTodayDone, habits, habitsDone, eventsToday, totalItems, doneItems, pct };
  }

  function getUpcomingTasks() {
    const tasks = MLO.Storage.getCollection('tasks').filter((t) => !t.completed && t.dueDate);
    return tasks.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 4);
  }

  function getMonthExpenseSnapshot() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${U().pad2(now.getMonth() + 1)}`;
    const txns = MLO.Storage.getCollection('expenses').filter((t) => t.date.startsWith(ym));
    const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
  }

  function getGoalsSnippet() {
    return MLO.Storage.getCollection('goals').sort((a, b) => (b.progress || 0) - (a.progress || 0) === 0 ? 0 : (a.progress || 0) - (b.progress || 0)).slice(0, 2);
  }

  /* ── RENDER ──────────────────────────────────────────────── */
  function render(container) {
    const name = MLO.Storage.get('profileName', 'Bhuvan');
    const stats = getTodayStats();
    const upcoming = getUpcomingTasks();
    const expSnap = getMonthExpenseSnapshot();
    const goals = getGoalsSnippet();

    container.innerHTML = `
      <div class="dash-greeting-card slide-up">
        <div class="dash-greeting">${getGreeting()}, ${U().escapeHtml(name)} 👋</div>
        <div class="dash-date" id="dash-date"></div>
        <div class="dash-time" id="dash-clock"></div>
        <div class="dash-weather" id="dash-weather">
          <span>🌤️</span><span>Weather — tap to connect a provider</span>
        </div>
      </div>

      <div class="card mb-4 slide-up">
        <div class="card-header">
          <span class="card-title">Today's Progress</span>
          <span class="text-accent font-bold">${stats.pct}%</span>
        </div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${stats.pct}%"></div></div>
        <div class="text-xs text-muted mt-3">${stats.doneItems} of ${stats.totalItems || 0} items done today</div>
      </div>

      <div class="dash-today-row stagger">
        <div class="today-stat slide-up"><div class="today-stat-val">${stats.tasksTodayDone}/${stats.tasksToday.length}</div><div class="today-stat-label">Tasks</div></div>
        <div class="today-stat slide-up"><div class="today-stat-val">${stats.habitsDone}/${stats.habits.length}</div><div class="today-stat-label">Habits</div></div>
        <div class="today-stat slide-up"><div class="today-stat-val">${stats.eventsToday}</div><div class="today-stat-label">Events</div></div>
      </div>

      <div class="section-title">Quick Actions</div>
      <div class="dash-quick-grid stagger">
        <div class="quick-action-card slide-up" data-qa="tasks"><span class="qa-icon">✅</span><span class="qa-label">Add Task</span></div>
        <div class="quick-action-card slide-up" data-qa="expenses"><span class="qa-icon">💰</span><span class="qa-label">Add Expense</span></div>
        <div class="quick-action-card slide-up" data-qa="notes"><span class="qa-icon">📝</span><span class="qa-label">New Note</span></div>
        <div class="quick-action-card slide-up" data-qa="ai-assistant"><span class="qa-icon">🤖</span><span class="qa-label">Ask AI</span></div>
      </div>

      <div class="card-header" style="margin-top:var(--sp-2);">
        <span class="section-title" style="margin:0;">Today's Habits</span>
        <span class="text-xs text-accent" data-nav="habits" style="cursor:pointer;">View all ›</span>
      </div>
      <div id="dash-habits-widget" class="mb-4"></div>

      <div class="card-header">
        <span class="section-title" style="margin:0;">Upcoming Tasks</span>
        <span class="text-xs text-accent" data-nav="tasks" style="cursor:pointer;">View all ›</span>
      </div>
      <div id="dash-tasks-widget" class="mb-4"></div>

      <div class="card-header">
        <span class="section-title" style="margin:0;">This Month</span>
        <span class="text-xs text-accent" data-nav="expenses" style="cursor:pointer;">Details ›</span>
      </div>
      <div class="expense-summary mb-4">
        <div class="exp-sum-card"><div class="exp-sum-val income">${U().formatCurrency(expSnap.income)}</div><div class="exp-sum-label">Income</div></div>
        <div class="exp-sum-card"><div class="exp-sum-val expense">${U().formatCurrency(expSnap.expense)}</div><div class="exp-sum-label">Spent</div></div>
        <div class="exp-sum-card"><div class="exp-sum-val balance">${U().formatCurrency(expSnap.balance)}</div><div class="exp-sum-label">Balance</div></div>
      </div>

      ${goals.length ? `
      <div class="card-header">
        <span class="section-title" style="margin:0;">Goal Progress</span>
        <span class="text-xs text-accent" data-nav="goals" style="cursor:pointer;">View all ›</span>
      </div>
      <div id="dash-goals-widget" class="mb-4"></div>` : ''}
    `;

    renderHabitsWidget(stats.habits, stats.todayISO);
    renderTasksWidget(upcoming);
    if (goals.length) renderGoalsWidget(goals);
    startClock();
    bindEvents(container);
  }

  function renderHabitsWidget(habits, todayISO) {
    const el = document.getElementById('dash-habits-widget');
    if (!el) return;
    if (!habits.length) {
      el.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) var(--sp-4);"><div class="empty-icon">🌱</div><div class="empty-desc">No habits yet — add one to start a streak.</div></div>`;
      return;
    }
    el.innerHTML = habits.slice(0, 4).map((h) => {
      const done = (h.history || []).includes(todayISO);
      const streak = MLO.modules.habits ? MLO.modules.habits.computeStreak(h.history || []) : 0;
      return `
        <div class="dash-habit-item">
          <span class="dash-habit-icon">${h.icon}</span>
          <div class="dash-habit-info">
            <div class="dash-habit-name">${U().escapeHtml(h.name)}</div>
            <div class="dash-habit-streak">🔥 ${streak} day streak</div>
          </div>
          <button class="habit-check-btn ${done ? 'checked' : ''}" data-habit-id="${h.id}">${done ? '✓' : ''}</button>
        </div>`;
    }).join('');

    el.querySelectorAll('[data-habit-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!MLO.modules.habits) return;
        MLO.modules.habits.toggleToday(btn.dataset.habitId);
        MLO.Router.renderCurrent();
      });
    });
  }

  function renderTasksWidget(tasks) {
    const el = document.getElementById('dash-tasks-widget');
    if (!el) return;
    if (!tasks.length) {
      el.innerHTML = `<div class="empty-state" style="padding:var(--sp-6) var(--sp-4);"><div class="empty-icon">🎉</div><div class="empty-desc">Nothing due — you're all caught up.</div></div>`;
      return;
    }
    const todayISO = U().toISODate(new Date());
    el.innerHTML = tasks.map((t) => {
      const overdue = t.dueDate < todayISO;
      return `
        <div class="dash-task-item" data-task-id="${t.id}">
          <span class="dash-task-pri pri-${t.priority}"></span>
          <span class="dash-task-text">${U().escapeHtml(t.title)}</span>
          <span class="dash-task-due ${overdue ? 'task-due overdue' : ''}">${overdue ? 'Overdue' : U().formatDateShort(t.dueDate)}</span>
        </div>`;
    }).join('');
    el.querySelectorAll('[data-task-id]').forEach((row) => {
      row.addEventListener('click', () => MLO.Router.navigate('tasks'));
    });
  }

  function renderGoalsWidget(goals) {
    const el = document.getElementById('dash-goals-widget');
    if (!el) return;
    el.innerHTML = goals.map((g) => `
      <div class="goal-item" style="margin-bottom:var(--sp-2);">
        <div class="goal-header"><span class="goal-title">${U().escapeHtml(g.title)}</span><span class="badge badge-purple">${g.type}</span></div>
        <div class="goal-progress-row">
          <div class="progress-bar-track" style="flex:1;"><div class="progress-bar-fill" style="width:${g.progress || 0}%"></div></div>
          <span class="goal-pct">${g.progress || 0}%</span>
        </div>
      </div>
    `).join('');
  }

  function startClock() {
    clearInterval(clockTimer);
    function tick() {
      const d = document.getElementById('dash-date');
      const c = document.getElementById('dash-clock');
      if (!d || !c) { clearInterval(clockTimer); return; }
      const now = new Date();
      d.textContent = U().formatDateFull(now);
      c.textContent = U().formatTime(now);
    }
    tick();
    clockTimer = setInterval(tick, 30000);
  }

  function bindEvents(container) {
    container.querySelectorAll('[data-qa]').forEach((card) => {
      card.addEventListener('click', () => quickAction(card.dataset.qa));
    });
    container.querySelectorAll('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => MLO.Router.navigate(el.dataset.nav));
    });
    const weather = document.getElementById('dash-weather');
    if (weather) weather.addEventListener('click', () => MLO.Toast.info('Weather sync is ready for a provider — add an API key in a future update'));
  }

  function quickAction(moduleId) {
    MLO.Router.navigate(moduleId);
    setTimeout(() => {
      const mod = MLO.modules[moduleId];
      const action = mod && typeof mod.getFabAction === 'function' ? mod.getFabAction() : null;
      if (action) action.onClick();
    }, 80);
  }

  MLO.registerModule({
    id: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    inBottomNav: true,
    render,
    onShow() { /* clock already started in render */ },
  });
})();
