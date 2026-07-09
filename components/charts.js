/* ═══════════════════════════════════════════════════════════════
   COMPONENT: CHARTS
   Zero-dependency Canvas2D chart renderer used by Habits, Expenses,
   Health, and Analytics modules. Supports line, bar, donut, and
   sparkline charts, theme-aware (reads live CSS custom properties).
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /** Configures canvas backing-store for crisp rendering on HiDPI screens. */
  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.parentElement.clientWidth || 300;
    const h = parseInt(canvas.dataset.height || '180', 10);

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, w, h };
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  /* ─── LINE CHART ─── */
  function line(canvas, { labels = [], data = [], color = null, fill = true } = {}) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const accent = color || cssVar('--clr-primary') || '#8B5CF6';
    const gridColor = cssVar('--bdr-subtle') || 'rgba(255,255,255,.06)';
    const txtColor = cssVar('--txt-3') || '#64748B';

    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;

    const padL = 8, padR = 8, padT = 14, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;

    // grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + (plotH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
    }

    const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
    const points = data.map((v, i) => ({
      x: padL + stepX * i,
      y: padT + plotH - ((v - min) / range) * plotH,
    }));

    // gradient fill under line
    if (fill) {
      const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      grad.addColorStop(0, hexToRgba(accent, 0.30));
      grad.addColorStop(1, hexToRgba(accent, 0.0));
      ctx.beginPath();
      ctx.moveTo(points[0].x, padT + plotH);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // smooth line
    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y) / 2);
      }
    });
    if (points.length > 1) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();

    // points
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    });

    // x labels
    if (labels.length) {
      ctx.fillStyle = txtColor;
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      const lblStep = Math.ceil(labels.length / 6);
      labels.forEach((lbl, i) => {
        if (i % lblStep === 0) ctx.fillText(lbl, points[i].x, h - 6);
      });
    }
  }

  /* ─── BAR CHART ─── */
  function bar(canvas, { labels = [], data = [], color = null, colors = null } = {}) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const accent = color || cssVar('--clr-primary') || '#8B5CF6';
    const txtColor = cssVar('--txt-3') || '#64748B';

    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;

    const padL = 6, padR = 6, padT = 16, padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const max = Math.max(...data, 1);

    const gap = 8;
    const barW = (plotW - gap * (data.length - 1)) / data.length;

    data.forEach((v, i) => {
      const barH = max > 0 ? (v / max) * plotH : 0;
      const x = padL + i * (barW + gap);
      const y = padT + plotH - barH;
      const fillColor = (colors && colors[i]) || accent;

      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, fillColor);
      grad.addColorStop(1, hexToRgba(fillColor, 0.55));
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, Math.max(barH, 2), 5);
      ctx.fill();

      if (labels[i]) {
        ctx.fillStyle = txtColor;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + barW / 2, h - 6);
      }
    });
  }

  /* ─── DONUT CHART ─── */
  function donut(canvas, { segments = [], centerLabel = '', centerValue = '' } = {}) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) / 2 - 6;
    const thickness = radius * 0.32;

    if (total <= 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = cssVar('--bdr-mid') || '#333';
      ctx.lineWidth = thickness;
      ctx.stroke();
    } else {
      let start = -Math.PI / 2;
      segments.forEach((seg) => {
        const angle = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + angle);
        ctx.strokeStyle = seg.color || cssVar('--clr-primary');
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.stroke();
        start += angle;
      });
    }

    if (centerValue) {
      ctx.fillStyle = cssVar('--txt-1') || '#fff';
      ctx.font = '700 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(centerValue, cx, cy - (centerLabel ? 8 : 0));
    }
    if (centerLabel) {
      ctx.fillStyle = cssVar('--txt-3') || '#888';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(centerLabel, cx, cy + 12);
    }
  }

  /* ─── SPARKLINE (compact, no axes) ─── */
  function sparkline(canvas, data = [], color = null) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    if (!data.length) return;
    const accent = color || cssVar('--clr-primary');
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = data.length > 1 ? w / (data.length - 1) : 0;

    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    data.forEach((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function hexToRgba(hex, alpha) {
    if (hex.startsWith('rgb')) return hex; // already rgba/rgb
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  MLO.Charts = { line, bar, donut, sparkline };
})();
