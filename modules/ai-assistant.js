/* ═══════════════════════════════════════════════════════════════
   MODULE: AI ASSISTANT
   A fully offline, rule-based command parser — no network or API
   calls. It recognizes natural phrasing for common actions (add
   expense, create task, find notes, show habits, open a module…)
   and executes them directly against MLO.Storage. Conversation
   history persists locally like everything else in the app.
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'aiMessages';

  const QUICK_COMMANDS = ['Add expense 200 food', 'Create task buy groceries', 'Show habits', 'Find notes', 'Open MyTube', 'Help'];

  const CATEGORY_KEYWORDS = {
    food: 'Food', lunch: 'Food', dinner: 'Food', breakfast: 'Food', restaurant: 'Food', coffee: 'Food', groceries: 'Food',
    transport: 'Transport', uber: 'Transport', taxi: 'Transport', fuel: 'Transport', petrol: 'Transport', cab: 'Transport', bus: 'Transport',
    shopping: 'Shopping', clothes: 'Shopping', amazon: 'Shopping',
    bill: 'Bills', bills: 'Bills', electricity: 'Bills', rent: 'Bills', recharge: 'Bills', wifi: 'Bills',
    movie: 'Entertainment', entertainment: 'Entertainment', netflix: 'Entertainment', games: 'Entertainment',
    medicine: 'Health', doctor: 'Health', health: 'Health', pharmacy: 'Health',
    salary: 'Salary', business: 'Business', investment: 'Investment', stocks: 'Investment',
  };

  const HELP_TEXT = `Here's what I can do:
• "add expense 200 food" — log a transaction
• "create task buy milk tomorrow" — add a task
• "find notes project" — search your notes
• "show habits" / "show tasks" / "show goals"
• "open mytube" — jump to any module
All of this runs locally — no internet needed.`;

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; }

  function matchCategory(text) {
    const words = text.toLowerCase().split(/\s+/);
    for (const w of words) if (CATEGORY_KEYWORDS[w]) return CATEGORY_KEYWORDS[w];
    return null;
  }

  function findModuleByName(text) {
    const t = text.trim().toLowerCase();
    if (!t) return null;
    return Object.values(MLO.modules).find((m) => m.id.toLowerCase() === t || m.label.toLowerCase() === t)
      || Object.values(MLO.modules).find((m) => t.includes(m.id.toLowerCase()) || m.label.toLowerCase().includes(t));
  }

  /* ── INTENT PARSER ───────────────────────────────────────── */
  function parseCommand(raw) {
    const text = raw.trim();
    const lower = text.toLowerCase();

    // Open / navigate
    const openMatch = lower.match(/^(?:open|go to|show me)\s+(.+)/);
    if (openMatch) {
      const target = findModuleByName(openMatch[1]);
      if (target) return { reply: `Opening ${target.label}… 📲`, navigateTo: target.id };
    }

    // Add expense / income
    const txnMatch = lower.match(/^(add expense|add income|log expense|log income|spent|spend)\s+(\d+(?:\.\d+)?)\s*(.*)$/);
    if (txnMatch) {
      const type = /income/.test(txnMatch[1]) ? 'income' : 'expense';
      const amount = parseFloat(txnMatch[2]);
      const rest = txnMatch[3].replace(/^(for|on)\s+/, '').trim();
      const category = matchCategory(rest) || (type === 'income' ? 'Salary' : 'Other');
      MLO.Storage.insert('expenses', { type, amount, category, note: rest, date: U().toISODate(new Date()) });
      return { reply: `Added ${type} of ${U().formatCurrency(amount)}${rest ? ` for ${rest}` : ''}. ✅`, navigateTo: null };
    }

    // Create task
    const taskMatch = lower.match(/^(create task|add task|new task|remind me to)\s+(.+)/);
    if (taskMatch) {
      let title = taskMatch[2].trim();
      let dueDate = null;
      if (/\btomorrow\b/.test(title)) { const d = new Date(); d.setDate(d.getDate() + 1); dueDate = U().toISODate(d); title = title.replace(/\btomorrow\b/, '').trim(); }
      else if (/\btoday\b/.test(title)) { dueDate = U().toISODate(new Date()); title = title.replace(/\btoday\b/, '').trim(); }
      let priority = 'medium';
      if (/\b(urgent|high priority|asap)\b/.test(title)) { priority = 'high'; title = title.replace(/\b(urgent|high priority|asap)\b/, '').trim(); }
      title = title.replace(/\s+/g, ' ').trim();
      if (!title) return { reply: 'What\'s the task? Try: "create task buy groceries"' };
      MLO.Storage.insert('tasks', { title: capitalize(title), notes: '', priority, category: 'Personal', dueDate, recurring: 'none', reminderTime: null, completed: false });
      return { reply: `Task added: "${capitalize(title)}"${dueDate ? ` (due ${U().formatDateShort(dueDate)})` : ''} ✅` };
    }

    // Find / search notes
    const notesMatch = lower.match(/^(find|search)\s+notes?\s*(?:about|for)?\s*(.*)/);
    if (notesMatch) {
      const q = notesMatch[2].trim();
      let results = MLO.Storage.getCollection('notes');
      if (q) results = results.filter((n) => n.title.toLowerCase().includes(q) || stripHtml(n.body).toLowerCase().includes(q));
      if (!results.length) return { reply: q ? `No notes found for "${q}".` : 'You have no notes yet — create one in the Notes module.' };
      return { reply: `Found ${results.length} note${results.length === 1 ? '' : 's'}:\n${results.slice(0, 5).map((n) => '• ' + n.title).join('\n')}`, navigateTo: 'notes' };
    }

    // Show habits
    if (/^(show\s+habits?|habits?)\??$/.test(lower)) {
      const habits = MLO.Storage.getCollection('habits');
      if (!habits.length) return { reply: "You haven't added any habits yet — head to the Habits module to start one." };
      const todayISO = U().toISODate(new Date());
      const lines = habits.map((h) => `${(h.history || []).includes(todayISO) ? '✅' : '⬜'} ${h.icon} ${h.name}`);
      return { reply: `Today's habits:\n${lines.join('\n')}` };
    }

    // Show tasks
    if (/^(show\s+tasks?|tasks?)\??$/.test(lower)) {
      const tasks = MLO.Storage.getCollection('tasks').filter((t) => !t.completed);
      if (!tasks.length) return { reply: "No active tasks — you're all caught up! 🎉" };
      return { reply: `You have ${tasks.length} active task${tasks.length === 1 ? '' : 's'}:\n${tasks.slice(0, 5).map((t) => '• ' + t.title).join('\n')}`, navigateTo: 'tasks' };
    }

    // Show goals
    if (/^(show\s+goals?|goals?)\??$/.test(lower)) {
      const goals = MLO.Storage.getCollection('goals').filter((g) => !g.completed);
      if (!goals.length) return { reply: 'No active goals right now — set one in the Goals module.' };
      return { reply: `Active goals:\n${goals.slice(0, 5).map((g) => `• ${g.title} (${g.progress || 0}%)`).join('\n')}`, navigateTo: 'goals' };
    }

    // Help
    if (/^(help|what can you do|commands?)\??$/.test(lower)) return { reply: HELP_TEXT };

    return { reply: 'I didn\'t quite catch that. Try "add expense 200 food", "create task call mom tomorrow", "find notes project", "show habits", or "open mytube". Type "help" any time.' };
  }

  /* ── UI ───────────────────────────────────────────────────── */
  function scrollToBottom() {
    const el = document.getElementById('ai-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  function renderMessages() {
    const el = document.getElementById('ai-messages');
    if (!el) return;
    const initial = (MLO.Storage.get('profileName', 'U') || 'U').charAt(0).toUpperCase();
    const messages = MLO.Storage.getCollection(COLLECTION).slice().reverse();
    el.innerHTML = messages.map((m) => `
      <div class="ai-msg ${m.role}">
        <div class="ai-msg-avatar">${m.role === 'user' ? initial : '🤖'}</div>
        <div class="ai-msg-bubble">${U().escapeHtml(m.text).replace(/\n/g, '<br>')}</div>
      </div>`).join('');
  }

  function showTyping() {
    const el = document.getElementById('ai-messages');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'ai-msg bot';
    div.id = 'ai-typing-indicator';
    div.innerHTML = `<div class="ai-msg-avatar">🤖</div><div class="ai-msg-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>`;
    el.appendChild(div);
    scrollToBottom();
  }
  function hideTyping() { document.getElementById('ai-typing-indicator')?.remove(); }

  function sendMessage(rawText) {
    const text = rawText.trim();
    if (!text) return;
    MLO.Storage.insert(COLLECTION, { role: 'user', text });
    renderMessages();
    scrollToBottom();
    showTyping();
    setTimeout(() => {
      hideTyping();
      const result = parseCommand(text);
      MLO.Storage.insert(COLLECTION, { role: 'bot', text: result.reply });
      renderMessages();
      scrollToBottom();
      if (result.navigateTo) setTimeout(() => MLO.Router.navigate(result.navigateTo), 700);
    }, 400);
  }

  function render(container) {
    if (!MLO.Storage.getCollection(COLLECTION).length) {
      MLO.Storage.insert(COLLECTION, { role: 'bot', text: "Hi! I'm your offline assistant — I can add expenses, create tasks, find notes, check habits, and jump to any module, all without internet. Try a command below or type \"help\"." });
    }

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">AI Assistant</div>
          <div class="module-page-sub">Works fully offline</div>
        </div>
        <div class="module-actions"><button class="btn btn-ghost btn-sm" id="clear-chat-btn">Clear</button></div>
      </div>
      <div class="ai-chat">
        <div class="ai-commands">
          ${QUICK_COMMANDS.map((c) => `<div class="ai-cmd-chip" data-cmd="${U().escapeHtml(c)}">${U().escapeHtml(c)}</div>`).join('')}
        </div>
        <div class="ai-messages" id="ai-messages"></div>
        <div class="ai-input-area">
          <input type="text" class="ai-input" id="ai-text-input" placeholder="Type a command…" autocomplete="off">
          <button class="ai-send-btn" id="ai-send-btn" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    `;

    renderMessages();
    scrollToBottom();
    bindEvents(container);
  }

  function bindEvents(container) {
    const input = container.querySelector('#ai-text-input');
    container.querySelector('#ai-send-btn').addEventListener('click', () => { sendMessage(input.value); input.value = ''; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { sendMessage(input.value); input.value = ''; } });
    container.querySelectorAll('[data-cmd]').forEach((chip) => chip.addEventListener('click', () => { input.value = chip.dataset.cmd; input.focus(); }));
    container.querySelector('#clear-chat-btn')?.addEventListener('click', async () => {
      const ok = await MLO.Modal.confirm({ title: 'Clear conversation?', message: 'This removes all chat history with the assistant.', confirmLabel: 'Clear', danger: true });
      if (!ok) return;
      MLO.Storage.setCollection(COLLECTION, []);
      MLO.Router.renderCurrent();
    });
  }

  MLO.registerModule({
    id: 'ai-assistant',
    label: 'AI Assistant',
    icon: '🤖',
    inBottomNav: false,
    render,
  });
})();
