/* ═══════════════════════════════════════════════════════════════
   MODULE: ANALYTICS
   A charts hub pulling from every other module's data: Habits,
   Expenses, Learning (derived from MyTube watch activity),
   Productivity (tasks + habits composite), and Health.
   Read-only — no writes happen from this module.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;

  let currentTab = 'overview';
  const CAT_COLOR = { Food: '#F59E0B', Transport: '#3B82F6', Shopping: '#EC4899', Bills: '#EF4444', Entertainment: '#8B5CF6', Health: '#10B981', Education: '#06B6D4', Salary: '#10B981', Business: '#8B5CF6', Investment: '#3B82F6', Other: '#64748B' };

  function lastNDays(n) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); arr.push(U().toISODate(d)); }
    return arr;
  }
  function monthKey(d) { d = new Date(d); return `${d.getFullYear()}-${U().pad2(d.getMonth() + 1)}`; }
  function lastNMonths(n) {
    const arr = []; const base = new Date(); base.setDate(1);
    for (let i = n - 1; i >= 0; i--) arr.push(monthKey(new Date(base.getFullYear(), base.getMonth() - i, 1)));
    return arr;
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  /* ════════════════ OVERVIEW ════════════════ */
  function computeProductivityScore() {
    const days7 = lastNDays(7);
    const tasks = MLO.Storage.getCollection('tasks');
    const tasksInRange = tasks.filter((t) => t.dueDate && days7.includes(t.dueDate));
    const taskRate = tasksInRange.length ? Math.round((tasksInRange.filter((t) => t.completed).length / tasksInRange.length) * 100) : null;

    const habits = MLO.Storage.getCollection('habits');
    let habitRate = null;
    if (habits.length) {
      const totalDone = days7.reduce((sum, d) => sum + habits.filter((h) => (h.history || []).includes(d)).length, 0);
      habitRate = Math.round((totalDone / (habits.length * 7)) * 100);
    }
    const rates = [taskRate, habitRate].filter((r) => r !== null);
    return rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  }

  function renderOverviewTab() {
    const days7 = lastNDays(7);
    const habits = MLO.Storage.getCollection('habits');
    const habitRate = habits.length ? Math.round((days7.reduce((s, d) => s + habits.filter((h) => (h.history || []).includes(d)).length, 0) / (habits.length * 7)) * 100) : 0;

    const tasksDone7d = MLO.Storage.getCollection('tasks').filter((t) => t.completed && t.completedAt && U().toISODate(t.completedAt) >= days7[0]).length;

    const ym = monthKey(new Date());
    const monthTxns = MLO.Storage.getCollection('expenses').filter((t) => t.date.startsWith(ym));
    const net = monthTxns.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);

    const videosWatched = MLO.Storage.getCollection('tubeVideos').filter((v) => v.status === 'watched').length;
    const score = computeProductivityScore();

    return `
      <div class="stats-grid stagger mb-4">
        <div class="stat-card slide-up"><div class="stat-value">${habitRate}%</div><div class="stat-label">Habit Rate (7d)</div></div>
        <div class="stat-card slide-up"><div class="stat-value">${tasksDone7d}</div><div class="stat-label">Tasks Done (7d)</div></div>
        <div class="stat-card slide-up"><div class="stat-value">${U().formatCurrency(net)}</div><div class="stat-label">Net This Month</div></div>
        <div class="stat-card slide-up"><div class="stat-value">${videosWatched}</div><div class="stat-label">Videos Watched</div></div>
      </div>
      ${score !== null ? `
      <div class="card mb-4 text-center">
        <div class="health-ring-label" style="color:var(--clr-primary-light);">${score}</div>
        <div class="health-ring-sub">Productivity Score (last 7 days)</div>
      </div>` : ''}
      <p class="text-xs text-muted text-center">Explore the tabs above for detailed charts on each area.</p>
    `;
  }

  /* ════════════════ HABITS ════════════════ */
  function renderHabitsTab() {
    const habits = MLO.Storage.getCollection('habits');
    if (!habits.length) return emptyState('🌱', 'No habit data yet', 'Add habits to see completion trends here.');

    const days30 = lastNDays(30);
    const ratesByHabit = habits.map((h) => ({
      name: h.name, icon: h.icon,
      rate: Math.round((days30.filter((d) => (h.history || []).includes(d)).length / 30) * 100),
    })).sort((a, b) => b.rate - a.rate);

    return `
      <div class="chart-card">
        <div class="chart-title">Total Completions — Last 30 Days</div>
        <canvas id="an-habits-chart" data-height="150" style="width:100%;"></canvas>
      </div>
      <div class="section-title">Completion Rate by Habit (30d)</div>
      ${ratesByHabit.map((h) => `
        <div class="card mb-3">
          <div class="flex-between mb-3"><span class="text-sm font-bold">${h.icon} ${U().escapeHtml(h.name)}</span><span class="text-accent font-bold">${h.rate}%</span></div>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${h.rate}%"></div></div>
        </div>`).join('')}
    `;
  }

  /* ════════════════ EXPENSES ════════════════ */
  function renderExpensesTab() {
    const txns = MLO.Storage.getCollection('expenses');
    if (!txns.length) return emptyState('💰', 'No expense data yet', 'Log income or expenses to see charts here.');

    const ym = monthKey(new Date());
    const monthTxns = txns.filter((t) => t.date.startsWith(ym));
    const byCategory = {};
    monthTxns.filter((t) => t.type === 'expense').forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount); });
    const segments = Object.entries(byCategory).map(([label, value]) => ({ label, value, color: CAT_COLOR[label] || '#8B5CF6' }));

    return `
      ${segments.length ? `
      <div class="chart-card">
        <div class="chart-title">This Month's Spending</div>
        <div class="flex-center"><canvas id="an-exp-donut" data-height="180" style="width:180px;"></canvas></div>
      </div>` : ''}
      <div class="chart-card">
        <div class="chart-title">Net Trend — Last 6 Months</div>
        <canvas id="an-exp-trend" data-height="150" style="width:100%;"></canvas>
      </div>
    `;
  }

  /* ════════════════ LEARNING (MyTube) ════════════════ */
  function renderLearningTab() {
    const videos = MLO.Storage.getCollection('tubeVideos');
    if (!videos.length) return emptyState('📺', 'No learning data yet', 'Save videos in MyTube to track learning progress.');

    const watched = videos.filter((v) => v.status === 'watched').length;
    const inProgress = videos.filter((v) => v.status === 'in-progress').length;
    const notStarted = videos.filter((v) => v.status === 'unwatched').length;

    return `
      <div class="stats-grid mb-4">
        <div class="stat-card"><div class="stat-value">${videos.length}</div><div class="stat-label">Saved</div></div>
        <div class="stat-card"><div class="stat-value">${watched}</div><div class="stat-label">Watched</div></div>
        <div class="stat-card"><div class="stat-value">${inProgress}</div><div class="stat-label">In Progress</div></div>
        <div class="stat-card"><div class="stat-value">${notStarted}</div><div class="stat-label">Not Started</div></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Watch Status</div>
        <div class="flex-center"><canvas id="an-learning-donut" data-height="180" style="width:180px;"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Videos Watched — Last 6 Weeks</div>
        <canvas id="an-learning-weeks" data-height="140" style="width:100%;"></canvas>
      </div>
    `;
  }

  function videosWatchedPerWeek(n) {
    const videos = MLO.Storage.getCollection('tubeVideos').filter((v) => v.watchedAt);
    const labels = [], data = [];
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i * 7 - start.getDay());
      const end = new Date(start); end.setDate(end.getDate() + 7);
      data.push(videos.filter((v) => v.watchedAt >= start.getTime() && v.watchedAt < end.getTime()).length);
      labels.push(`${start.getMonth() + 1}/${start.getDate()}`);
    }
    return { labels, data };
  }

  /* ════════════════ PRODUCTIVITY ════════════════ */
  function renderProductivityTab() {
    const score = computeProductivityScore();
    return `
      ${score !== null ? `
      <div class="card mb-4 text-center">
        <div class="health-ring-label" style="color:var(--clr-primary-light);">${score}</div>
        <div class="health-ring-sub">Productivity Score</div>
      </div>` : emptyState('📈', 'Not enough data yet', 'Add tasks and habits to see your productivity score.')}
      <div class="chart-card">
        <div class="chart-title">Tasks Completed — Last 14 Days</div>
        <canvas id="an-prod-tasks" data-height="140" style="width:100%;"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Habit Completion Rate — Last 14 Days</div>
        <canvas id="an-prod-habits" data-height="140" style="width:100%;"></canvas>
      </div>
    `;
  }

  function tasksCompletedPerDay(days) {
    const tasks = MLO.Storage.getCollection('tasks').filter((t) => t.completed && t.completedAt);
    return days.map((d) => tasks.filter((t) => U().toISODate(t.completedAt) === d).length);
  }
  function habitRatePerDay(days) {
    const habits = MLO.Storage.getCollection('habits');
    if (!habits.length) return days.map(() => 0);
    return days.map((d) => Math.round((habits.filter((h) => (h.history || []).includes(d)).length / habits.length) * 100));
  }

  /* ════════════════ HEALTH ════════════════ */
  function renderHealthTab() {
    const logs = MLO.Storage.getCollection('healthLogs');
    if (!logs.length) return emptyState('❤️', 'No health data yet', 'Log water, steps, or sleep in the Health module.');
    return `
      <div class="chart-card">
        <div class="chart-title">Water — Last 7 Days</div>
        <canvas id="an-health-water" data-height="130" style="width:100%;"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Steps — Last 7 Days</div>
        <canvas id="an-health-steps" data-height="130" style="width:100%;"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-title">Sleep — Last 7 Days</div>
        <canvas id="an-health-sleep" data-height="130" style="width:100%;"></canvas>
      </div>
    `;
  }

  /* ════════════════ MAIN RENDER ════════════════ */
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'habits', label: 'Habits' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'learning', label: 'Learning' },
    { id: 'productivity', label: 'Productivity' },
    { id: 'health', label: 'Health' },
  ];

  function render(container) {
    const renderers = { overview: renderOverviewTab, habits: renderHabitsTab, expenses: renderExpensesTab, learning: renderLearningTab, productivity: renderProductivityTab, health: renderHealthTab };

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Analytics</div>
          <div class="module-page-sub">Your data, visualized</div>
        </div>
      </div>
      <div class="filter-tabs">
        ${TABS.map((t) => `<div class="chip ${currentTab === t.id ? 'active' : ''}" data-an-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="an-tab-content">${renderers[currentTab]()}</div>
    `;

    drawCharts();
    container.querySelectorAll('[data-an-tab]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.anTab; MLO.Router.renderCurrent(); }));
  }

  function drawCharts() {
    const days7 = lastNDays(7);
    const dow7 = days7.map((d) => U().DAYS_SHORT[new Date(d).getDay()]);
    const days30 = lastNDays(30);
    const days14 = lastNDays(14);

    if (currentTab === 'habits') {
      const habits = MLO.Storage.getCollection('habits');
      MLO.Charts.bar(document.getElementById('an-habits-chart'), { labels: days30.map((d) => String(new Date(d).getDate())), data: days30.map((d) => habits.filter((h) => (h.history || []).includes(d)).length) });
    }
    if (currentTab === 'expenses') {
      const ym = monthKey(new Date());
      const monthTxns = MLO.Storage.getCollection('expenses').filter((t) => t.date.startsWith(ym));
      const byCategory = {};
      monthTxns.filter((t) => t.type === 'expense').forEach((t) => { byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount); });
      const segments = Object.entries(byCategory).map(([label, value]) => ({ value, color: CAT_COLOR[label] || '#8B5CF6' }));
      const total = segments.reduce((s, c) => s + c.value, 0);
      if (segments.length) MLO.Charts.donut(document.getElementById('an-exp-donut'), { segments, centerValue: U().formatCurrency(total), centerLabel: 'spent' });

      const months = lastNMonths(6);
      const nets = months.map((m) => {
        const t = MLO.Storage.getCollection('expenses').filter((x) => x.date.startsWith(m));
        return t.reduce((s, x) => s + (x.type === 'income' ? Number(x.amount) : -Number(x.amount)), 0);
      });
      MLO.Charts.line(document.getElementById('an-exp-trend'), { labels: months.map((m) => U().MONTHS_SHORT[Number(m.split('-')[1]) - 1]), data: nets });
    }
    if (currentTab === 'learning') {
      const videos = MLO.Storage.getCollection('tubeVideos');
      const segments = [
        { value: videos.filter((v) => v.status === 'watched').length, color: '#10B981' },
        { value: videos.filter((v) => v.status === 'in-progress').length, color: '#F59E0B' },
        { value: videos.filter((v) => v.status === 'unwatched').length, color: '#64748B' },
      ].filter((s) => s.value > 0);
      if (segments.length) MLO.Charts.donut(document.getElementById('an-learning-donut'), { segments, centerValue: String(videos.length), centerLabel: 'videos' });
      const wk = videosWatchedPerWeek(6);
      MLO.Charts.bar(document.getElementById('an-learning-weeks'), wk);
    }
    if (currentTab === 'productivity') {
      MLO.Charts.line(document.getElementById('an-prod-tasks'), { labels: days14.map((d) => String(new Date(d).getDate())), data: tasksCompletedPerDay(days14), color: '#3B82F6' });
      MLO.Charts.bar(document.getElementById('an-prod-habits'), { labels: days14.map((d) => String(new Date(d).getDate())), data: habitRatePerDay(days14) });
    }
    if (currentTab === 'health') {
      const logs = MLO.Storage.getCollection('healthLogs');
      const getLog = (d) => logs.find((l) => l.date === d) || {};
      MLO.Charts.bar(document.getElementById('an-health-water'), { labels: dow7, data: days7.map((d) => getLog(d).water || 0), color: '#3B82F6' });
      MLO.Charts.bar(document.getElementById('an-health-steps'), { labels: dow7, data: days7.map((d) => getLog(d).steps || 0), color: '#10B981' });
      MLO.Charts.line(document.getElementById('an-health-sleep'), { labels: dow7, data: days7.map((d) => getLog(d).sleepHours || 0), color: '#8B5CF6' });
    }
  }

  MLO.registerModule({
    id: 'analytics',
    label: 'Analytics',
    icon: '📊',
    inBottomNav: false,
    render,
  });
})();
