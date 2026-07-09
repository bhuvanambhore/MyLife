/* ═══════════════════════════════════════════════════════════════
   COMPONENT: MODAL
   Reusable bottom-sheet style modal used across every module for
   forms, confirmations, and detail views.
   Usage:
     MLO.Modal.open({
       title: 'Add Task',
       body: '<div>...</div>' | HTMLElement,
       footer: [{label:'Cancel', class:'btn-ghost', onClick:close},
                {label:'Save', class:'btn-primary', onClick:fn}]
     })
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});

  let overlay, card, titleEl, bodyEl, footerEl, closeBtn;
  let onCloseCallback = null;
  let initialized = false;

  function cacheEls() {
    overlay = document.getElementById('modal-overlay');
    card = document.getElementById('modal-card');
    titleEl = document.getElementById('modal-title');
    bodyEl = document.getElementById('modal-body');
    footerEl = document.getElementById('modal-footer');
    closeBtn = document.getElementById('modal-close');
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    closeBtn.addEventListener('click', () => close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
    });
  }

  /**
   * Open a modal.
   * @param {Object} opts
   * @param {string} opts.title
   * @param {string|HTMLElement} opts.body
   * @param {Array<{label:string, class?:string, onClick:Function}>} [opts.footer]
   * @param {Function} [opts.onClose]
   */
  function open({ title = '', body = '', footer = [], onClose = null } = {}) {
    if (!overlay) cacheEls();
    bindEvents();

    onCloseCallback = onClose;
    titleEl.textContent = title;

    bodyEl.innerHTML = '';
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else if (body instanceof HTMLElement) bodyEl.appendChild(body);

    footerEl.innerHTML = '';
    footer.forEach((btnDef) => {
      const btn = document.createElement('button');
      btn.className = `btn ${btnDef.class || 'btn-ghost'}`;
      btn.textContent = btnDef.label;
      btn.addEventListener('click', () => btnDef.onClick && btnDef.onClick());
      footerEl.appendChild(btn);
    });

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Focus first input for fast entry
    requestAnimationFrame(() => {
      const firstInput = bodyEl.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    });
  }

  function close() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    if (typeof onCloseCallback === 'function') onCloseCallback();
    onCloseCallback = null;
  }

  /** Convenience: confirmation dialog returning a Promise<boolean> */
  function confirm({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise((resolve) => {
      // ── THE BUG (old code) ───────────────────────────────────────────
      // Confirm button: close() → onClose → resolve(false) fires FIRST
      //                 then resolve(true) is silently ignored (Promise
      //                 already settled). Result: Delete never worked.
      // ── THE FIX ─────────────────────────────────────────────────────
      // Track whether the user clicked Confirm. onClose only resolves
      // false when the modal was dismissed WITHOUT confirming (overlay
      // tap, Escape, Cancel). When Confirm is clicked we set the flag
      // before calling close() so onClose becomes a no-op.
      let confirmed = false;

      open({
        title,
        body: `<p style="color:var(--txt-2);font-size:var(--fs-base);line-height:1.6;">${message}</p>`,
        footer: [
          { label: 'Cancel', class: 'btn-ghost', onClick: () => close() },
          {
            label: confirmLabel,
            class: danger ? 'btn-danger' : 'btn-primary',
            onClick: () => {
              confirmed = true; // mark BEFORE close() fires onCloseCallback
              close();
              resolve(true);
            },
          },
        ],
        onClose: () => { if (!confirmed) resolve(false); },
      });
    });
  }

  MLO.Modal = { open, close, confirm };
})();
