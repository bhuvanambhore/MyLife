/* ═══════════════════════════════════════════════════════════════
   MODULE: CALENDAR
   Month and week views over a single `events` collection. Birthdays
   use recurringYearly so they reappear every year on the same
   month/day regardless of the stored year.
   ─────────────────────────────────────────────────────────────
   Event shape: { id, title, date:'YYYY-MM-DD', time:'HH:MM'|null,
                  type:'event'|'meeting'|'birthday', notes,
                  recurringYearly:bool }
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});
  const U = () => MLO.Util;
  const COLLECTION = 'events';
  const TYPE_ICON = { event: '📅', meeting: '👥', birthday: '🎂' };

  let viewMode = 'month'; // month | week
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDate = U().toISODate(new Date());
  let weekAnchor = U().toISODate(new Date()); // any date inside the visible week

  function eventOccursOn(ev, dateISO) {
    if (ev.recurringYearly) {
      return ev.date.slice(5) === dateISO.slice(5); // compare MM-DD
    }
    return ev.date === dateISO;
  }

  function eventsOnDate(dateISO) {
    return MLO.Storage.getCollection(COLLECTION)
      .filter((ev) => eventOccursOn(ev, dateISO))
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }

  function dateHasEvent(dateISO) {
    return MLO.Storage.getCollection(COLLECTION).some((ev) => eventOccursOn(ev, dateISO));
  }

  /* ── ADD / EDIT MODAL ────────────────────────────────────── */
  function openFormModal(existing, presetDate) {
    let type = existing ? existing.type : 'event';

    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Title</label>
        <input type="text" class="form-input" id="ev-title-input" placeholder="e.g., Team standup" value="${existing ? U().escapeHtml(existing.title) : ''}" maxlength="80">
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <div style="display:flex;gap:8px;">
          <button type="button" class="chip" data-type="event" style="flex:1;">📅 Event</button>
          <button type="button" class="chip" data-type="meeting" style="flex:1;">👥 Meeting</button>
          <button type="button" class="chip" data-type="birthday" style="flex:1;">🎂 Birthday</button>
        </div>
      </div>
      <div class="input-row">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" class="form-input" id="ev-date-input" value="${existing ? existing.date : (presetDate || selectedDate)}">
        </div>
        <div class="form-group">
          <label class="form-label">Time (optional)</label>
          <input type="time" class="form-input" id="ev-time-input" value="${existing && existing.time ? existing.time : ''}">
        </div>
      </div>
      <div class="form-group">
        <div class="toggle-wrap" id="ev-recur-wrap">
          <div class="toggle-switch ${existing && existing.recurringYearly ? 'on' : ''}" id="ev-recur-toggle"></div>
          <span class="toggle-label">Repeats every year</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes (optional)</label>
        <textarea class="form-textarea" id="ev-notes-input" style="min-height:60px;">${existing ? U().escapeHtml(existing.notes || '') : ''}</textarea>
      </div>
    `;

    function syncTypeChips() {
      body.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    }
    body.querySelectorAll('[data-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        type = btn.dataset.type;
        syncTypeChips();
        if (type === 'birthday') body.querySelector('#ev-recur-toggle').classList.add('on');
      });
    });
    syncTypeChips();

    body.querySelector('#ev-recur-wrap').addEventListener('click', () => {
      body.querySelector('#ev-recur-toggle').classList.toggle('on');
    });

    MLO.Modal.open({
      title: existing ? 'Edit Event' : 'New Event',
      body,
      footer: [
        { label: 'Cancel', class: 'btn-ghost', onClick: () => MLO.Modal.close() },
        {
          label: existing ? 'Save' : 'Add',
          class: 'btn-primary',
          onClick: () => {
            const title = body.querySelector('#ev-title-input').value.trim();
            const date = body.querySelector('#ev-date-input').value;
            if (!title || !date) { MLO.Toast.error('Title and date are required'); return; }
            const payload = {
              title, type, date,
              time: body.querySelector('#ev-time-input').value || null,
              recurringYearly: body.querySelector('#ev-recur-toggle').classList.contains('on'),
              notes: body.querySelector('#ev-notes-input').value.trim(),
            };
            if (existing) { MLO.Storage.update(COLLECTION, existing.id, payload); MLO.Toast.success('Event updated'); }
            else { MLO.Storage.insert(COLLECTION, payload); MLO.Toast.success('Event added'); }
            MLO.Modal.close();
            selectedDate = date;
            MLO.Router.renderCurrent();
          },
        },
      ],
    });
  }

  async function confirmDelete(ev) {
    const ok = await MLO.Modal.confirm({ title: 'Delete event?', message: `"${ev.title}" will be removed.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    MLO.Storage.delete(COLLECTION, ev.id);
    MLO.Toast.success('Event deleted');
    MLO.Router.renderCurrent();
  }

  /* ── MONTH VIEW ──────────────────────────────────────────── */
  function renderMonthGrid() {
    const totalDays = U().daysInMonth(viewYear, viewMonth);
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const todayISO = U().toISODate(new Date());

    let html = U().DAYS_SHORT.map((d) => `<div class="cal-dow">${d}</div>`).join('');

    const prevMonthDays = U().daysInMonth(viewYear, viewMonth - 1 < 0 ? 11 : viewMonth - 1);
    for (let i = firstDow - 1; i >= 0; i--) {
      html += `<div class="cal-day other-month">${prevMonthDays - i}</div>`;
    }
    for (let day = 1; day <= totalDays; day++) {
      const iso = `${viewYear}-${U().pad2(viewMonth + 1)}-${U().pad2(day)}`;
      const classes = ['cal-day'];
      if (iso === todayISO) classes.push('today');
      if (iso === selectedDate) classes.push('selected');
      if (dateHasEvent(iso)) classes.push('has-event');
      html += `<div class="${classes.join(' ')}" data-date="${iso}">${day}</div>`;
    }
    const totalCells = firstDow + totalDays;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailing; i++) html += `<div class="cal-day other-month">${i}</div>`;

    return html;
  }

  /* ── WEEK VIEW ───────────────────────────────────────────── */
  function getWeekDates(anchorISO) {
    const d = new Date(anchorISO);
    const dow = d.getDay();
    d.setDate(d.getDate() - dow);
    const arr = [];
    for (let i = 0; i < 7; i++) { arr.push(U().toISODate(d)); d.setDate(d.getDate() + 1); }
    return arr;
  }

  function renderWeekStrip() {
    const week = getWeekDates(weekAnchor);
    const todayISO = U().toISODate(new Date());
    return `<div class="cal-grid" style="grid-template-columns:repeat(7,1fr);">
      ${U().DAYS_SHORT.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
      ${week.map((iso) => {
        const classes = ['cal-day'];
        if (iso === todayISO) classes.push('today');
        if (iso === selectedDate) classes.push('selected');
        if (dateHasEvent(iso)) classes.push('has-event');
        return `<div class="${classes.join(' ')}" data-date="${iso}">${new Date(iso).getDate()}</div>`;
      }).join('')}
    </div>`;
  }

  /* ── EVENT LIST FOR A DATE ───────────────────────────────── */
  function renderEventList(dateISO) {
    const events = eventsOnDate(dateISO);
    if (!events.length) {
      return `<div class="empty-state" style="padding:var(--sp-8) var(--sp-4);"><div class="empty-icon">🗓️</div><div class="empty-desc">No events on ${U().formatDateLong(dateISO)}</div></div>`;
    }
    return events.map((ev) => {
      let ageBadge = '';
      if (ev.type === 'birthday' && ev.recurringYearly) {
        const bornYear = Number(ev.date.slice(0, 4));
        const turning = viewYear ? new Date(dateISO).getFullYear() - bornYear : '';
        if (turning > 0) ageBadge = `<span class="event-tag">Turns ${turning}</span>`;
      }
      return `
        <div class="event-item" data-event-id="${ev.id}">
          <span class="event-time">${ev.time || TYPE_ICON[ev.type]}</span>
          <div style="flex:1;">
            <div class="event-title">${TYPE_ICON[ev.type]} ${U().escapeHtml(ev.title)}</div>
            ${ev.notes ? `<div class="event-tag">${U().escapeHtml(ev.notes)}</div>` : ''}
          </div>
          ${ageBadge}
          <button class="task-action-btn" data-delete-event="${ev.id}">🗑️</button>
        </div>`;
    }).join('');
  }

  /* ── MAIN RENDER ─────────────────────────────────────────── */
  function render(container) {
    const monthLabel = `${U().MONTHS[viewMonth]} ${viewYear}`;
    const weekDates = getWeekDates(weekAnchor);
    const weekLabel = `${U().formatDateShort(weekDates[0])} – ${U().formatDateShort(weekDates[6])}`;

    container.innerHTML = `
      <div class="module-header">
        <div class="module-title-wrap">
          <div class="module-page-title">Calendar</div>
          <div class="module-page-sub">Events, meetings & birthdays</div>
        </div>
        <div class="module-actions"><button class="btn btn-primary btn-sm" id="add-event-btn">+ Add</button></div>
      </div>

      <div class="filter-tabs">
        <div class="chip ${viewMode === 'month' ? 'active' : ''}" data-mode="month">Monthly</div>
        <div class="chip ${viewMode === 'week' ? 'active' : ''}" data-mode="week">Weekly</div>
        <div class="chip" id="cal-today-btn">Today</div>
      </div>

      <div class="card mb-4">
        <div class="cal-header">
          <div class="cal-month">${viewMode === 'month' ? monthLabel : weekLabel}</div>
          <div class="cal-nav">
            <button class="icon-btn ripple" id="cal-prev">‹</button>
            <button class="icon-btn ripple" id="cal-next">›</button>
          </div>
        </div>
        <div class="cal-grid" id="cal-grid-wrap">${viewMode === 'month' ? renderMonthGrid() : ''}</div>
        ${viewMode === 'week' ? `<div id="cal-week-wrap"></div>` : ''}
      </div>

      <div class="section-title">${selectedDate === U().toISODate(new Date()) ? "Today's Events" : U().formatDateLong(selectedDate)}</div>
      <div id="cal-event-list"></div>
    `;

    if (viewMode === 'week') {
      document.getElementById('cal-week-wrap').innerHTML = renderWeekStrip();
    }
    document.getElementById('cal-event-list').innerHTML = renderEventList(selectedDate);
    bindEvents(container);
  }

  function bindEvents(container) {
    container.querySelector('#add-event-btn')?.addEventListener('click', () => openFormModal(null, selectedDate));

    container.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => { viewMode = el.dataset.mode; MLO.Router.renderCurrent(); });
    });

    container.querySelector('#cal-today-btn')?.addEventListener('click', () => {
      const now = new Date();
      viewYear = now.getFullYear(); viewMonth = now.getMonth();
      selectedDate = U().toISODate(now); weekAnchor = selectedDate;
      MLO.Router.renderCurrent();
    });

    container.querySelector('#cal-prev')?.addEventListener('click', () => {
      if (viewMode === 'month') { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } }
      else { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); weekAnchor = U().toISODate(d); }
      MLO.Router.renderCurrent();
    });
    container.querySelector('#cal-next')?.addEventListener('click', () => {
      if (viewMode === 'month') { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } }
      else { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); weekAnchor = U().toISODate(d); }
      MLO.Router.renderCurrent();
    });

    container.querySelectorAll('[data-date]').forEach((el) => {
      el.addEventListener('click', () => { selectedDate = el.dataset.date; MLO.Router.renderCurrent(); });
    });

    container.querySelectorAll('[data-event-id]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-delete-event]')) return;
        const ev = MLO.Storage.findById(COLLECTION, row.dataset.eventId);
        if (ev) openFormModal(ev);
      });
    });
    container.querySelectorAll('[data-delete-event]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ev = MLO.Storage.findById(COLLECTION, btn.dataset.deleteEvent);
        if (ev) confirmDelete(ev);
      });
    });
  }

  MLO.registerModule({
    id: 'calendar',
    label: 'Calendar',
    icon: '📅',
    inBottomNav: true,
    render,
    getFabAction() { return { icon: '+', label: 'Add Event', onClick: () => openFormModal(null, selectedDate) }; },
    search(query) {
      const q = query.toLowerCase();
      return MLO.Storage.getCollection(COLLECTION)
        .filter((e) => e.title.toLowerCase().includes(q))
        .map((e) => ({ id: e.id, icon: TYPE_ICON[e.type], title: e.title, sub: U().formatDateLong(e.date) }));
    },
  });
})();
