/* ═══════════════════════════════════════════════════════════════
   COMPONENT: TOAST
   Lightweight, dependency-free toast notification system.
   Usage: MLO.Toast.show('Saved!', 'success')
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});

  const ICONS = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  let container = null;
  const queue = [];
  let active = 0;
  const MAX_VISIBLE = 3;

  function ensureContainer() {
    if (!container) container = document.getElementById('toast-container');
    return container;
  }

  function renderNext() {
    if (active >= MAX_VISIBLE || queue.length === 0) return;
    const item = queue.shift();
    active++;
    paint(item);
  }

  function paint({ message, type, duration }) {
    const root = ensureContainer();
    if (!root) return;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${ICONS[type] || ICONS.info}</span><span>${escapeHtml(message)}</span>`;
    root.appendChild(el);

    const remove = () => {
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        active--;
        renderNext();
      }, 220);
    };

    el.addEventListener('click', remove);
    setTimeout(remove, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration ms
   */
  function show(message, type = 'info', duration = 2600) {
    queue.push({ message, type, duration });
    renderNext();
  }

  MLO.Toast = {
    show,
    success: (msg, d) => show(msg, 'success', d),
    error: (msg, d) => show(msg, 'error', d),
    warning: (msg, d) => show(msg, 'warning', d),
    info: (msg, d) => show(msg, 'info', d),
  };
})();
