/* ═══════════════════════════════════════════════════════════════
   MODULE: EXPENSES
   Sub-tabs: Overview · Transactions · Budget · Savings · Reports
   ─────────────────────────────────────────────────────────────
   Transaction shape: { id, type:'income'|'expense', amount,
                         category, note, date:'YYYY-MM-DD' }
   Budget:  { monthlyLimit, categoryLimits:{category:number} }
   Savings: { target, saved, log:[{id,amount,note,date}] }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const TXN_COL = 'expenses';

  const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Education', 'Salary', 'Business', 'Investment', 'Other'];
  const CAT_ICON = { Food: '🍔', Transport: '🚗', Shopping: '🛍️', Bills: '🧾', Entertainment: '🎬', Health: '💊', Education: '📚', Salary: '💼', Business: '📈', Investment: '📊', Other: '💰' };
  const CAT_COLOR = { Food: '#F59E0B', Transport: '#3B82F6', Shopping: '#EC4899', Bills: '#EF4444', Entertainment: '#8B5CF6', Health: '#10B981', Education: '#06B6D4', Salary: '#10B981', Business: '#8B5CF6', Investment: '#3B82F6', Other: '#64748B' };

  let currentTab = 'overview';
  let txnFilter = 'all'; // all | income | expense

  /* ── DATA HELPERS ────────────────────────────────────────── */
  function monthKey(d) { d = new Date(d); return `${d.getFullYear()}-${U().pad2(d.getMonth() + 1)}`; }
  function txnsForMonth(ym) { return MLO.Storage.getCollection(TXN_COL).filter((t) => t.date.startsWith(ym)); }
  function summarize(txns) {
    const income = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, net: income - expense };
  }
  function getBudget() { return MLO.Storage.get('budget', { monthlyLimit: 0, categoryLimits: {} }); }
  function saveBudget(patch) { MLO.Storage.set('budget', Object.assign({}, getBudget(), patch)); }
  function getSavings() { return MLO.Storage.get('savings', { target: 0, saved: 0, log: [] }); }
  function saveSavings(patch) { MLO.Storage.set('savings', Object.assign({}, getSavings(), patch)); }

  /* ── ADD TRANSACTION MODAL ───────────────────────────────── */
  function openTxnModal(existing) {
    let type = existing ? existing.type : 'expense';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <div style="display:flex;gap:8px;">
          <button type="button" class="chip" data-type="expense" style="flex:1;">💸 Expense</button>
          <button type="button" class="chip" data-type="income" style="flex:1;">💵 Income</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" inputmode="decimal" class="form-input" id="txn-amount-input" placeholder="0" value="${existing ? existing.amount : ''}" min="0" step="0.01">
      </div>
      <div class="input-row">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="txn-category-input">
            ${CATEGORIES.map((c) => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${CAT_ICON[c]} ${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" id="txn-date-input" value="${existing ? existing.date : U().toISODate(new Date())}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" class="form-input" id="txn-note-input" value="${existing ? U().escapeHtml(existing.note || '') : ''}" placeholder="e.g., Lunch with team">
      </div>
    `;
    function syncType() { body.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b.dataset.type === type)); }
    body.querySelectorAll('[data-type]').forEach((btn) => btn.addEventListener('click', () => { type = btn.dataset.type; syncType(); }));
    syncType();

    MLO.Modal.open({
      title: existing ? 'Edit Transaction' : 'Add Transaction',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Add',
          class: 'btn-primary',
          onClick: () => {
            const amount = parseFloat(body.querySelector('#txn-amount-input').value);
            if (!amount || amount <= 0) { MLO.Toast.error('Enter a valid amount'); return; }
            const payload = {
              type, amount,
              category: body.querySelector('#txn-category-input').value,
              date: body.querySelector('#txn-date-input').value,
              note: body.querySelector('#txn-note-input').value.trim(),
            };
            if (existing) MLO.Storage.update(TXN_COL, existing.id, payload);
            else MLO.Storage.insert(TXN_COL, payload);
            MLO.Toast.success(existing ? 'Transaction updated' : 'Transaction added');
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  async function confirmDeleteTxn(t) {
    const ok = await MLO.Modal.confirm({ title: 'Delete transaction?', message: `${U().formatCurrency(t.amount)} · ${t.category}`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(TXN_COL, t.id);
    MLO.Router.renderCurrent();
  }

  /* ── TRANSACTION ROW ─────────────────────────────────────── */
  function txnRow(t) {
    return `
      <div class="txn-item" data-txn-id="${t.id}">
        <div class="txn-cat-icon">${CAT_ICON[t.category] || '💰'}</div>
        <div style="flex:1;min-width:0;">
          <div class="txn-name">${U().escapeHtml(t.note || t.category)}</div>
          <div class="txn-date">${t.category} · ${U().formatDateShort(t.date)}</div>
        </div>
        <div class="txn-amount ${t.type === 'income' ? 'credit' : 'debit'}">${t.type === 'income' ? '+' : '−'}${U().formatCurrency(t.amount)}</div>
        <button class="task-action-btn" data-delete-txn="${t.id}">🗑️</button>
      </div>`;
  }

  /* ════════════════ OVERVIEW TAB ════════════════ */
  function renderOverviewTab() {
    const now = new Date();
    const ym = monthKey(now);
    const monthTxns = txnsForMonth(ym);
    const sum = summarize(monthTxns);
    const recent = MLO.Storage.getCollection(TXN_COL).slice(0, 5);
    const expenseByCategory = CATEGORIES
      .map((c) => ({ label: c, value: monthTxns.filter((t) => t.type === 'expense' && t.category === c).reduce((s, t) => s + Number(t.amount), 0), color: CAT_COLOR[c] }))
      .filter((c) => c.value > 0);

    return `
      <div class="expense-summary mb-4">
        <div class="exp-sum-card"><div class="exp-sum-val income">${U().formatCurrency(sum.income)}</div><div class="exp-sum-label">Income</div></div>
        <div class="exp-sum-card"><div class="exp-sum-val expense">${U().formatCurrency(sum.expense)}</div><div class="exp-sum-label">Expense</div></div>
        <div class="exp-sum-card"><div class="exp-sum-val balance">${U().formatCurrency(sum.net)}</div><div class="exp-sum-label">Net</div></div>
      </div>

      ${expenseByCategory.length ? `
      <div class="chart-card">
        <div class="chart-title">Spending by Category — ${U().MONTHS[now.getMonth()]}</div>
        <div class="flex-center"><canvas id="exp-donut-chart" data-height="180" style="width:180px;"></canvas></div>
        <div class="flex stagger" style="flex-wrap:wrap;gap:8px;margin-top:var(--sp-3);justify-content:center;">
          ${expenseByCategory.map((c) => `<span class="badge" style="background:${c.color}22;color:${c.color};">${CAT_ICON[c.label]} ${c.label} · ${U().formatCurrency(c.value)}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="card-header" style="margin-top:var(--sp-2);">
        <span class="section-title" style="margin:0;">Recent Transactions</span>
        <span class="text-xs text-accent" data-goto-tab="transactions" style="cursor:pointer;">View all ›</span>
      </div>
      ${recent.length ? recent.map(txnRow).join('') : emptyState('💳', 'No transactions yet', 'Add your first income or expense.')}
    `;
  }

  /* ════════════════ TRANSACTIONS TAB ════════════════ */
  function renderTransactionsTab() {
    let txns = MLO.Storage.getCollection(TXN_COL);
    if (txnFilter !== 'all') txns = txns.filter((t) => t.type === txnFilter);

    return `
      <div class="filter-tabs">
        ${['all', 'income', 'expense'].map((f) => `<div class="chip ${txnFilter === f ? 'active' : ''}" data-txn-filter="${f}">${f.charAt(0).toUpperCase() + f.slice(1)}</div>`).join('')}
      </div>
      ${txns.length ? txns.map(txnRow).join('') : emptyState('💳', 'Nothing here', 'No transactions match this filter.')}
    `;
  }

  /* ════════════════ BUDGET TAB ════════════════ */
  function renderBudgetTab() {
    const budget = getBudget();
    const ym = monthKey(new Date());
    const spent = txnsForMonth(ym).filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const pct = budget.monthlyLimit ? Math.min(100, Math.round((spent / budget.monthlyLimit) * 100)) : 0;
    const over = budget.monthlyLimit && spent > budget.monthlyLimit;

    const catRows = Object.entries(budget.categoryLimits || {}).map(([cat, limit]) => {
      const catSpent = txnsForMonth(ym).filter((t) => t.type === 'expense' && t.category === cat).reduce((s, t) => s + Number(t.amount), 0);
      const catPct = limit ? Math.min(100, Math.round((catSpent / limit) * 100)) : 0;
      return `
        <div class="card mb-3">
          <div class="flex-between mb-3"><span class="font-bold text-sm">${CAT_ICON[cat]} ${cat}</span><button class="task-action-btn" data-remove-cat-limit="${cat}">🗑️</button></div>
          <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${catPct}%;${catSpent > limit ? 'background:var(--clr-error);' : ''}"></div></div>
          <div class="text-xs text-muted mt-3">${U().formatCurrency(catSpent)} of ${U().formatCurrency(limit)}</div>
        </div>`;
    }).join('');

    return `
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Monthly Budget</span></div>
        <div class="input-row" style="align-items:flex-end;">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <input type="number" class="form-input" id="budget-limit-input" placeholder="Set monthly limit" value="${budget.monthlyLimit || ''}">
          </div>
          <button class="btn btn-primary" id="save-budget-btn">Save</button>
        </div>
        ${budget.monthlyLimit ? `
        <div class="progress-bar-track mt-4"><div class="progress-bar-fill" style="width:${pct}%;${over ? 'background:var(--clr-error);' : ''}"></div></div>
        <div class="text-xs mt-3 ${over ? '' : 'text-muted'}" style="${over ? 'color:var(--clr-error);font-weight:700;' : ''}">${U().formatCurrency(spent)} of ${U().formatCurrency(budget.monthlyLimit)} spent ${over ? '— over budget!' : `(${pct}%)`}</div>
        ` : ''}
      </div>

      <div class="section-title">Category Limits</div>
      <div class="card mb-4">
        <div class="input-row" style="align-items:flex-end;">
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <select class="form-select" id="cat-limit-select">${CATEGORIES.map((c) => `<option value="${c}">${CAT_ICON[c]} ${c}</option>`).join('')}</select>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0;">
            <input type="number" class="form-input" id="cat-limit-amount" placeholder="Limit">
          </div>
          <button class="btn btn-secondary" id="add-cat-limit-btn">Add</button>
        </div>
      </div>
      ${catRows || emptyState('🎯', 'No category limits', 'Set a spending limit per category to stay on track.')}
    `;
  }

  /* ════════════════ SAVINGS TAB ════════════════ */
  function openSavingsAdjustModal(mode) {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Amount</label>
        <input type="number" class="form-input" id="savings-amount-input" placeholder="0" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Note (optional)</label>
        <input type="text" class="form-input" id="savings-note-input" placeholder="e.g., Bonus saved">
      </div>
    `;
    MLO.Modal.open({
      title: mode === 'add' ? 'Add to Savings' : 'Withdraw from Savings',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: mode === 'add' ? 'Add' : 'Withdraw',
          class: 'btn-primary',
          onClick: () => {
            const amount = parseFloat(body.querySelector('#savings-amount-input').value);
            if (!amount || amount <= 0) { MLO.Toast.error('Enter a valid amount'); return; }
            const s = getSavings();
            const delta = mode === 'add' ? amount : -amount;
            const log = [{ id: U().uid(), amount: delta, note: body.querySelector('#savings-note-input').value.trim(), date: U().toISODate(new Date()) }, ...(s.log || [])].slice(0, 50);
            saveSavings({ saved: Math.max(0, (s.saved || 0) + delta), log });
            MLO.Toast.success(mode === 'add' ? 'Added to savings' : 'Withdrawn from savings');
            MLO.Modal.close();
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  function renderSavingsTab() {
    const s = getSavings();
    const pct = s.target ? Math.min(100, Math.round((s.saved / s.target) * 100)) : 0;

    return `
      <div class="card mb-4 text-center">
        <div class="health-ring-wrap">
          <span style="font-size:36px;">🐷</span>
          <div class="health-ring-label">${U().formatCurrency(s.saved)}</div>
          <div class="health-ring-sub">saved${s.target ? ` of ${U().formatCurrency(s.target)} goal` : ''}</div>
        </div>
        ${s.target ? `<div class="progress-bar-track mt-4"><div class="progress-bar-fill" style="width:${pct}%"></div></div><div class="text-xs text-muted mt-3">${pct}% there</div>` : ''}
        <div class="flex gap-3 mt-4" style="justify-content:center;">
          <button class="btn btn-primary btn-sm" id="add-savings-btn">+ Add</button>
          <button class="btn btn-ghost btn-sm" id="withdraw-savings-btn">− Withdraw</button>
        </div>
      </div>

      <div class="card mb-4">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Savings Target</label>
          <div class="input-row">
            <input type="number" class="form-input" id="savings-target-input" value="${s.target || ''}" placeholder="e.g., 50000">
            <button class="btn btn-secondary" id="save-target-btn">Save</button>
          </div>
        </div>
      </div>

      <div class="section-title">Recent Activity</div>
      ${(s.log || []).length ? s.log.slice(0, 8).map((l) => `
        <div class="list-item" style="cursor:default;">
          <span class="list-item-icon">${l.amount >= 0 ? '➕' : '➖'}</span>
          <div class="list-item-main"><div class="list-item-title">${l.note || (l.amount >= 0 ? 'Added to savings' : 'Withdrawn')}</div><div class="list-item-sub">${U().formatDateShort(l.date)}</div></div>
          <span class="font-bold ${l.amount >= 0 ? 'text-accent' : ''}" style="${l.amount < 0 ? 'color:var(--clr-error);' : ''}">${l.amount >= 0 ? '+' : ''}${U().formatCurrency(l.amount)}</span>
        </div>`).join('') : emptyState('💰', 'No activity yet', 'Add to your savings to start tracking progress.')}
    `;
  }

  /* ════════════════ REPORTS TAB ════════════════ */
  function lastNMonths(n) {
    const arr = [];
    const d = new Date();
    d.setDate(1);
    for (let i = n - 1; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      arr.push(monthKey(m));
    }
    return arr;
  }

  function renderReportsTab() {
    const months = lastNMonths(6);
    const summaries = months.map((ym) => ({ ym, ...summarize(txnsForMonth(ym)) }));

    return `
      <div class="chart-card">
        <div class="chart-title">Net Trend — Last 6 Months</div>
        <canvas id="exp-trend-chart" data-height="160" style="width:100%;"></canvas>
      </div>
      <div class="section-title">Monthly Breakdown</div>
      ${summaries.slice().reverse().map((s) => `
        <div class="card mb-3">
          <div class="flex-between">
            <span class="font-bold text-sm">${U().MONTHS[Number(s.ym.split('-')[1]) - 1]} ${s.ym.split('-')[0]}</span>
            <span class="font-bold ${s.net >= 0 ? 'text-accent' : ''}" style="${s.net < 0 ? 'color:var(--clr-error);' : ''}">${U().formatCurrency(s.net)}</span>
          </div>
          <div class="flex gap-3 mt-3 text-xs text-muted">
            <span>↑ Income ${U().formatCurrency(s.income)}</span>
            <span>↓ Expense ${U().formatCurrency(s.expense)}</span>
          </div>
        </div>`).join('')}
    `;
  }

  /* ════════════════ SHARED ════════════════ */
  function emptyState(icon, title, desc) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-desc">${desc}</div></div>`;
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'budget', label: 'Budget' },
    { id: 'savings', label: 'Savings' },
    { id: 'reports', label: 'Reports' },
  ];

  function render(container) {
    const renderers = { overview: renderOverviewTab, transactions: renderTransactionsTab, budget: renderBudgetTab, savings: renderSavingsTab, reports: renderReportsTab };

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Expenses</div>
          <div class="module-page-sub">Track income, spending & savings</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-txn-btn">+ Add</button></div>
      </div>
      <div class="filter-tabs">
        ${TABS.map((t) => `<div class="chip ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>`).join('')}
      </div>
      <div id="expenses-tab-content"></div>
    `;

    document.getElementById('expenses-tab-content').innerHTML = renderers[currentTab]();

    if (currentTab === 'overview') {
      const now = new Date();
      const monthTxns = txnsForMonth(monthKey(now));
      const breakdown = CATEGORIES.map((c) => ({ value: monthTxns.filter((t) => t.type === 'expense' && t.category === c).reduce((s, t) => s + Number(t.amount), 0), color: CAT_COLOR[c] })).filter((c) => c.value > 0);
      const total = breakdown.reduce((s, c) => s + c.value, 0);
      if (breakdown.length) MLO.Charts.donut(document.getElementById('exp-donut-chart'), { segments: breakdown, centerValue: U().formatCurrency(total), centerLabel: 'spent' });
    }
    if (currentTab === 'reports') {
      const months = lastNMonths(6);
      const nets = months.map((ym) => summarize(txnsForMonth(ym)).net);
      MLO.Charts.line(document.getElementById('exp-trend-chart'), { labels: months.map((m) => U().MONTHS_SHORT[Number(m.split('-')[1]) - 1]), data: nets });
    }

    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelector('#add-txn-btn')?.addEventListener('click', () => openTxnModal());
    container.querySelectorAll('[data-tab]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.tab; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-goto-tab]').forEach((el) => el.addEventListener('click', () => { currentTab = el.dataset.gotoTab; MLO.Router.renderCurrent(); }));
    container.querySelectorAll('[data-txn-filter]').forEach((el) => el.addEventListener('click', () => { txnFilter = el.dataset.txnFilter; MLO.Router.renderCurrent(); }));

    container.querySelectorAll('[data-txn-id]').forEach((row) => row.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-txn]')) return;
      openTxnModal(MLO.Storage.findById(TXN_COL, row.dataset.txnId));
    }));
    container.querySelectorAll('[data-delete-txn]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeleteTxn(MLO.Storage.findById(TXN_COL, btn.dataset.deleteTxn)); }));

    container.querySelector('#save-budget-btn')?.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#budget-limit-input').value) || 0;
      saveBudget({ monthlyLimit: val });
      MLO.Toast.success('Budget saved');
      MLO.Router.renderCurrent();
    });
    container.querySelector('#add-cat-limit-btn')?.addEventListener('click', () => {
      const cat = container.querySelector('#cat-limit-select').value;
      const amt = parseFloat(container.querySelector('#cat-limit-amount').value);
      if (!amt || amt <= 0) { MLO.Toast.error('Enter a valid limit'); return; }
      const b = getBudget();
      b.categoryLimits[cat] = amt;
      saveBudget(b);
      MLO.Router.renderCurrent();
    });
    container.querySelectorAll('[data-remove-cat-limit]').forEach((btn) => btn.addEventListener('click', () => {
      const b = getBudget();
      delete b.categoryLimits[btn.dataset.removeCatLimit];
      saveBudget(b);
      MLO.Router.renderCurrent();
    }));

    container.querySelector('#add-savings-btn')?.addEventListener('click', () => openSavingsAdjustModal('add'));
    container.querySelector('#withdraw-savings-btn')?.addEventListener('click', () => openSavingsAdjustModal('withdraw'));
    container.querySelector('#save-target-btn')?.addEventListener('click', () => {
      const val = parseFloat(container.querySelector('#savings-target-input').value) || 0;
      saveSavings({ target: val });
      MLO.Toast.success('Target updated');
      MLO.Router.renderCurrent();
    });
  }

  MLO.registerModule({
    id: 'expenses',
    label: 'Expenses',
    icon: '💰',
    inBottomNav: false,
    render,
    getFabAction() { return { icon: '+', label: 'Add Transaction', onClick: () => openTxnModal() }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(TXN_COL)
        .filter((t) => (t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
        .map((t) => ({ id: t.id, icon: CAT_ICON[t.category], title: t.note || t.category, sub: U().formatCurrency(t.amount) }));
    },
  });
})();
