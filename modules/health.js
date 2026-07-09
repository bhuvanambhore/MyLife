/* ═══════════════════════════════════════════════════════════════
   MODULE: HEALTH
   Sub-tabs: Overview · Water · Activity (steps + exercise) ·
             Sleep · Weight & BMI
   ─────────────────────────────────────────────────────────────
   One row per day in `healthLogs`: { id, date, water, steps,
   sleepHours, weight }. Exercise sessions live in their own
   `exerciseLogs` list since a day can have more than one workout.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const LOGS_COL = 'healthLogs';
  const EXERCISE_COL = 'exerciseLogs';
  const EXERCISE_TYPES = ['Running', 'Walking', 'Cycling', 'Yoga', 'Gym', 'Swimming', 'Sports', 'Other'];

  let currentTab = 'overview';

  function lastNDays(n) {
    const arr = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); arr.push(U().toISODate(d)); }
    return arr;
  }

  function getLog(dateISO) { return MLO.Storage.find(LOGS_COL, (l) => l.date === dateISO)[0] || null; }
  function upsertLog(dateISO, patch) {
    const existing = getLog(dateISO);
    if (existing) return MLO.Storage.update(LOGS_COL, existing.id, patch);
    return MLO.Storage.insert(LOGS_COL, Object.assign({ date: dateISO }, patch));
  }

  function computeBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm) return null;
    const hM = heightCm / 100;
    return weightKg / (hM * hM);
  }
  function bmiCategory(bmi) {
    if (bmi < 18.5) return { label: 'Underweight', color: 'var(--clr-info)' };
    if (bmi < 25) return { label: 'Normal', color: 'var(--clr-success)' };
    if (bmi < 30) return { label: 'Overweight', color: 'var(--clr-warning)' };
    return { label: 'Obese', color: 'var(--clr-error)' };
  }

  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  /* ════════════════ OVERVIEW ════════════════ */
  function renderOverviewTab() {
    const log = getLog(U().toISODate(new Date())) || {};
    const waterTarget = MLO.Storage.get('waterTarget', 8);
    return `
      <div class="health-grid stagger">
        <div class="stat-card slide-up" data-goto="water" style="cursor:pointer;"><div class="stat-value">${log.water || 0}/${waterTarget}</div><div class="stat-label">💧 Water</div></div>
        <div class="stat-card slide-up" data-goto="activity" style="cursor:pointer;"><div class="stat-value">${U().formatNumber(log.steps || 0)}</div><div class="stat-label">👣 Steps</div></div>
        <div class="stat-card slide-up" data-goto="sleep" style="cursor:pointer;"><div class="stat-value">${log.sleepHours || 0}h</div><div class="stat-label">😴 Sleep</div></div>
        <div class="stat-card slide-up" data-goto="weight" style="cursor:pointer;"><div class="stat-value">${log.weight ? log.weight + 'kg' : '—'}</div><div class="stat-label">⚖️ Weight</div></div>
      </div>
      <p class="text-xs text-muted text-center mt-4">Tap any card to log today's numbers</p>
    `;
  }

  /* ════════════════ WATER ════════════════ */
  function renderWaterTab() {
    const todayISO = U().toISODate(new Date());
    const count = (getLog(todayISO) || {}).water || 0;
    const target = MLO.Storage.get('waterTarget', 8);

    return `
      <div class="water-tracker">
        <div class="health-ring-label">${count} / ${target} cups</div>
        <div class="water-cups">
          ${Array.from({ length: target }).map((_, i) => `<div class="water-cup ${i < count ? 'filled' : ''}" data-cup="${i}">💧</div>`).join('')}
        </div>
        <div class="flex gap-2 mt-4" style="justify-content:center;">
          <button class="btn btn-ghost btn-sm" id="water-target-minus">Target −</button>
          <button class="btn btn-ghost btn-sm" id="water-target-plus">Target +</button>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Last 7 Days</div>
        <canvas id="water-week-chart" data-height="140" style="width:100%;"></canvas>
      </div>
    `;
  }

  /* ════════════════ ACTIVITY (steps + exercise) ════════════════ */
  function openExerciseModal() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Type</label>
        <input type="text" class="form-input" id="ex-type-input" list="ex-types" placeholder="e.g., Running">
        <datalist id="ex-types">${EXERCISE_TYPES.map((t) => `<option value="${t}">`).join('')}</datalist>
      </div>
      <div class="input-row">
        <div class="form-group">
          <label class="form-label">Duration (min)</label>
          <input type="number" class="form-input" id="ex-duration-input" min="1" placeholder="30">
        </div>
        <div class="form-group">
          <label class="form-label">Calories (optional)</label>
          <input type="number" class="form-input" id="ex-calories-input" placeholder="200">
        </div>
      </div>
    `;
    MLO.Modal.open({
      title: 'Log Exercise',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: 'Save', class: 'btn-primary',
          onClick: () => {
            const type = body.querySelector('#ex-type-input').value.trim();
            const duration = parseInt(body.querySelector('#ex-duration-input').value, 10);
            if (!type || !duration) { MLO.Toast.error('Type and duration are required'); return; }
            MLO.Storage.insert(EXERCISE_COL, {
              type, duration,
              calories: parseInt(body.querySelector('#ex-calories-input').value, 10) || null,
              date: U().toISODate(new Date()),
            });
            MLO.Toast.success('Workout logged');
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function renderActivityTab() {
    const todayISO = U().toISODate(new Date());
    const log = getLog(todayISO) || {};
    const stepsTarget = MLO.Storage.get('stepsTarget', 8000);
    const steps = log.steps || 0;
    const pct = Math.min(100, Math.round((steps / stepsTarget) * 100));
    const exercises = MLO.Storage.getCollection(EXERCISE_COL).filter((e) => e.date === todayISO);

    return `
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Steps Today</span><span class="text-accent font-bold">${U().formatNumber(steps)}</span></div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
        <div class="text-xs text-muted mt-3">${pct}% of ${U().formatNumber(stepsTarget)} step goal</div>
        <div class="input-row mt-4">
          <input type="number" class="form-input" id="steps-input" placeholder="Log steps" value="${steps || ''}">
          <button class="btn btn-primary" id="save-steps-btn">Save</button>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Steps — Last 7 Days</div>
        <canvas id="steps-week-chart" data-height="140" style="width:100%;"></canvas>
      </div>
      <div class="section-title">Today's Exercise</div>
      ${exercises.length ? exercises.map((ex) => `
        <div class="list-item" style="cursor:default;">
          <span class="list-item-icon">🏋️</span>
          <div class="list-item-main"><div class="list-item-title">${U().escapeHtml(ex.type)}</div><div class="list-item-sub">${ex.duration} min${ex.calories ? ` · ${ex.calories} cal` : ''}</div></div>
          <button class="task-action-btn" data-delete-exercise="${ex.id}">🗑️</button>
        </div>`).join('') : emptyState('🏋️', 'No workouts logged', "Tap + to add today's exercise.")}
    `;
  }

  /* ════════════════ SLEEP ════════════════ */
  function renderSleepTab() {
    const todayISO = U().toISODate(new Date());
    const hours = (getLog(todayISO) || {}).sleepHours || 0;
    const target = MLO.Storage.get('sleepTarget', 8);

    return `
      <div class="card mb-4 text-center">
        <div class="health-ring-wrap">
          <span style="font-size:36px;">😴</span>
          <div class="health-ring-label">${hours}h</div>
          <div class="health-ring-sub">of ${target}h target</div>
        </div>
        <div class="input-row mt-4">
          <input type="number" step="0.5" min="0" max="16" class="form-input" id="sleep-input" placeholder="Hours slept" value="${hours || ''}">
          <button class="btn btn-primary" id="save-sleep-btn">Save</button>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Sleep — Last 7 Days</div>
        <canvas id="sleep-week-chart" data-height="140" style="width:100%;"></canvas>
      </div>
    `;
  }

  /* ════════════════ WEIGHT & BMI ════════════════ */
  function renderWeightTab() {
    const profile = MLO.Storage.get('healthProfile', { heightCm: 0 });
    const logs = MLO.Storage.getCollection(LOGS_COL).filter((l) => l.weight).sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = logs[0];
    const bmi = latest && profile.heightCm ? computeBMI(latest.weight, profile.heightCm) : null;
    const cat = bmi ? bmiCategory(bmi) : null;

    return `
      <div class="card mb-4">
        <div class="input-row" style="align-items:flex-end;">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <label class="form-label">Log Weight (kg)</label>
            <input type="number" step="0.1" class="form-input" id="weight-input" placeholder="e.g., 70.5">
          </div>
          <button class="btn btn-primary" id="save-weight-btn">Save</button>
        </div>
      </div>

      <div class="card mb-4">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Height (cm) — needed for BMI</label>
          <div class="input-row">
            <input type="number" class="form-input" id="height-input" value="${profile.heightCm || ''}" placeholder="e.g., 175">
            <button class="btn btn-secondary" id="save-height-btn">Save</button>
          </div>
        </div>
      </div>

      ${bmi ? `
      <div class="card mb-4 text-center">
        <div class="health-ring-label" style="color:${cat.color};">${bmi.toFixed(1)}</div>
        <div class="health-ring-sub">BMI · <span style="color:${cat.color};font-weight:700;">${cat.label}</span></div>
      </div>` : `<p class="text-xs text-muted text-center mb-4">Add your height and a weight entry to see your BMI</p>`}

      ${logs.length > 1 ? `<div class="chart-card"><div class="chart-title">Weight Trend</div><canvas id="weight-trend-chart" data-height="140" style="width:100%;"></canvas></div>` : ''}

      <div class="section-title">History</div>
      ${logs.length ? logs.slice(0, 10).map((l) => `
        <div class="list-item" style="cursor:default;">
          <span class="list-item-icon">⚖️</span>
          <div class="list-item-main"><div class="list-item-title">${l.weight} kg</div><div class="list-item-sub">${U().formatDateShort(l.date)}</div></div>
        </div>`).join('') : emptyState('⚖️', 'No weight logged yet', 'Log your weight to start tracking trends and BMI.')}
    `;
  }

  /* ════════════════ MAIN RENDER ════════════════ */
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'water', label: 'Water' },
    { id: 'activity', label: 'Activity' },
    { id: 'sleep', label: 'Sleep' },
    { id: 'weight', label: 'Weight' },
  ];

  function render(container) {
    const renderers = { overview: renderOverviewTab, water: renderWaterTab, activity: renderActivityTab, sleep: renderSleepTab, weight: renderWeightTab };

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Health</div>
          <div class="module-page-sub">Stay on top of your wellbeing</div>
        </div>
      </div>
      <div class="filter-tabs">
        ${TABS.map((t) => `<div class="chip ${currentTab === t.id ? 'active' : ''}" data-health-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="health-tab-content">${renderers[currentTab]()}</div>
    `;

    afterRenderHook();
    bindEvents(container);
  }

  function afterRenderHook() {
    const week = lastNDays(7);
    const dowLabels = week.map((d) => U().DAYS_SHORT[new Date(d).getDay()]);

    if (currentTab === 'water') {
      MLO.Charts.bar(document.getElementById('water-week-chart'), { labels: dowLabels, data: week.map((d) => (getLog(d) || {}).water || 0) });
    }
    if (currentTab === 'activity') {
      MLO.Charts.bar(document.getElementById('steps-week-chart'), { labels: dowLabels, data: week.map((d) => (getLog(d) || {}).steps || 0), color: '#3B82F6' });
    }
    if (currentTab === 'sleep') {
      MLO.Charts.line(document.getElementById('sleep-week-chart'), { labels: dowLabels, data: week.map((d) => (getLog(d) || {}).sleepHours || 0), color: '#8B5CF6' });
    }
    if (currentTab === 'weight') {
      const logs = MLO.Storage.getCollection(LOGS_COL).filter((l) => l.weight).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-10);
      if (logs.length > 1) MLO.Charts.line(document.getElementById('weight-trend-chart'), { labels: logs.map((l) => U().formatDateShort(l.date).split(',')[0]), data: logs.map((l) => l.weight), color: '#10B981' });
    }
  }

  function bindEvents(container) {
    container.querySelectorAll('[data-health-tab]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.healthTab; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-goto]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.goto; MLO.Router.renderCurrent(); }));

    // Water
    container.querySelectorAll('[data-cup]').forEach((cup) => cup.addEventListener('click', () => {
      const i = Number(cup.dataset.cup);
      const todayISO = U().toISODate(new Date());
      const current = (getLog(todayISO) || {}).water || 0;
      upsertLog(todayISO, { water: current === i + 1 ? i : i + 1 });
      U().vibrate(10);
      MLO.Router.renderCurrent();
    }));
    container.querySelector('#water-target-plus')?.addEventListener('click', () => { MLO.Storage.set('waterTarget', Math.min(20, MLO.Storage.get('waterTarget', 8) + 1)); MLO.Router.renderCurrent(); });
    container.querySelector('#water-target-minus')?.addEventListener('click', () => { MLO.Storage.set('waterTarget', Math.max(1, MLO.Storage.get('waterTarget', 8) - 1)); MLO.Router.renderCurrent(); });

    // Activity
    container.querySelector('#save-steps-btn')?.addEventListener('click', () => {
      const val = parseInt(container.querySelector('#steps-input').value, 10) || 0;
      upsertLog(U().toISODate(new Date()), { steps: val });
      MLO.Toast.success('Steps saved');
      MLO.Router.renderCurrent();
    });
    container.querySelectorAll('[data-delete-exercise]').forEach((btn) => btn.addEventListener('click', () => { MLO.Storage.delete(EXERCISE_COL, btn.dataset.deleteExercise); MLO.Router.renderCurrent(); }));

    // Sleep
    container.querySelector('#save-sleep-btn')?.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#sleep-input').value) || 0;
      upsertLog(U().toISODate(new Date()), { sleepHours: val });
      MLO.Toast.success('Sleep saved');
      MLO.Router.renderCurrent();
    });

    // Weight
    container.querySelector('#save-weight-btn')?.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#weight-input').value);
      if (!val || val <= 0) { MLO.Toast.error('Enter a valid weight'); return; }
      upsertLog(U().toISODate(new Date()), { weight: val });
      MLO.Toast.success('Weight logged');
      MLO.Router.renderCurrent();
    });
    container.querySelector('#save-height-btn')?.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#height-input').value) || 0;
      MLO.Storage.set('healthProfile', { heightCm: val });
      MLO.Toast.success('Height saved');
      MLO.Router.renderCurrent();
    });
  }

  MLO.registerModule({
    id: 'health',
    label: 'Health',
    icon: '❤️',
    inBottomNav: false,
    render,
    getFabAction() {
      if (currentTab !== 'activity') return null;
      return { icon: '+', label: 'Log Exercise', onClick: openExerciseModal };
    },
  });
})();
