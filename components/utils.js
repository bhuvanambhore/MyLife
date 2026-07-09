/* ═══════════════════════════════════════════════════════════════
   COMPONENT: UTILS
   Shared, dependency-free helpers used by every module: date/time
   formatting, escaping, currency, debounce, etc. Keeping these in
   one place avoids 15 slightly-different copies of formatDate().
═══════════════════════════════════════════════════════════════ */

(function () {
  const MLO = (window.MLO = window.MLO || {});

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str === null || str === undefined ? '' : String(str);
    return div.innerHTML;
  }

  function uid(prefix = '') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** 'Mon, Jun 30' */
  function formatDateShort(d) {
    d = new Date(d);
    return `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  }

  /** 'June 30, 2026' */
  function formatDateLong(d) {
    d = new Date(d);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  /** 'Tuesday, June 30, 2026' */
  function formatDateFull(d) {
    d = new Date(d);
    return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  /** '10:30 AM' */
  function formatTime(d) {
    d = new Date(d);
    let h = d.getHours();
    const m = pad2(d.getMinutes());
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  /** yyyy-mm-dd for <input type=date> and stable keys */
  function toISODate(d) {
    d = new Date(d);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function isSameDay(a, b) {
    a = new Date(a); b = new Date(b);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function isToday(d) { return isSameDay(d, new Date()); }

  /** '2h ago' / '5m ago' / 'just now' / falls back to short date */
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return formatDateShort(ts);
  }

  function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

  function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function debounce(fn, wait = 200) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
  }

  /** Currency symbol is configurable in Expenses settings; defaults to ₹. */
  function formatCurrency(amount) {
    const symbol = MLO.Storage ? MLO.Storage.get('currencySymbol', '₹') : '₹';
    const n = Number(amount) || 0;
    return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString();
  }

  /** Returns a deterministic pastel-ish color from a string seed (for avatars/tags). */
  function colorFromSeed(seed) {
    const palette = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4', '#84CC16'];
    let hash = 0;
    for (let i = 0; i < String(seed).length; i++) hash = String(seed).charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }

  function vibrate(ms = 15) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  MLO.Util = {
    MONTHS, MONTHS_SHORT, DAYS, DAYS_SHORT,
    escapeHtml, uid, pad2,
    formatDateShort, formatDateLong, formatDateFull, formatTime, toISODate,
    isSameDay, isToday, timeAgo, daysInMonth, startOfDay, clamp, debounce,
    formatCurrency, formatNumber, colorFromSeed, vibrate,
  };
})();
