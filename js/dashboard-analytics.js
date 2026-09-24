/* Properties by Chel — dashboard "Analytics" tab (first-party visit statistics).
 * Bridged in from dashboard.js after sign-in via window.DashboardAnalytics.init(helpers).
 * Data comes from GET /api/dashboard/analytics (api/dashboard/analytics.js); nothing
 * here talks to a third-party service. All text is escaped; the chart is inline SVG.
 */
const state = { ctx: null, range: "7d", timer: null, loading: false };

const REGION_NAMES = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; }
})();
const countryName = (code) => {
  if (!code) return "Unknown";
  try { return (REGION_NAMES && REGION_NAMES.of(code)) || code; } catch { return code; }
};
const DEVICE_LABELS = { mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", unknown: "Unknown" };
const manila = (iso, opts) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", ...opts });
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

function duration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function niceMax(value) {
  if (value <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function statCard(esc, value, label) {
  return `<div class="dash-stat"><span class="dash-stat__value">${esc(value)}</span><span class="dash-stat__label">${esc(label)}</span></div>`;
}

function renderChart(esc, series, bucket) {
  const W = 960, H = 260, L = 44, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(1, ...series.map((b) => Math.max(b.sessions, b.pageviews))));
  const x = (i) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const path = (key) => series.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(b[key]).toFixed(1)}`).join(" ");
  const label = (b) => (bucket === "hour"
    ? b.key.slice(11) + ":00"
    : new Date(b.key + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const every = Math.max(1, Math.ceil(series.length / 6));
  const grid = ticks.map((t) => {
    const v = Math.round(max * t);
    return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="0.12"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`;
  }).join("");
  const xs = series.map((b, i) => (i % every === 0 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(label(b))}</text>` : "")).join("");
  const dots = (key, color) => series.map((b, i) =>
    `<circle cx="${x(i)}" cy="${y(b[key])}" r="${series.length > 45 ? 2 : 3}" fill="${color}"><title>${esc(label(b))}: ${fmt(b[key])} ${key === "sessions" ? "visitors" : "pageviews"}</title></circle>`).join("");
  return `<svg class="ana-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitors and pageviews over time">
    ${grid}${xs}
    <path d="${path("pageviews")}" fill="none" stroke="var(--a-text-3)" stroke-width="2" stroke-linejoin="round"/>
    <path d="${path("sessions")}" fill="none" stroke="var(--a-accent)" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots("pageviews", "var(--a-text-3)")}${dots("sessions", "var(--a-accent)")}
  </svg>`;
}

function rankedList(esc, title, items, labelOf, total) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const rows = items.length
    ? items.map((i) => `<li style="--w:${Math.max(4, Math.round((i.count / max) * 100))}%"><span title="${esc(labelOf(i))}">${esc(labelOf(i))}</span><span>${fmt(i.count)} · ${pct(i.count, total)}%</span></li>`).join("")
    : `<li><span>No data yet</span><span></span></li>`;
  return `<div class="ana-list"><h3>${esc(title)}</h3><ol>${rows}</ol></div>`;
}

function render(data) {
  const { $, esc } = state.ctx;
  const t = data.totals;
  $("#ana-message").hidden = true;
  $("#ana-body").hidden = false;
  $("#ana-live").textContent = t.active_now ? `${t.active_now} active now` : "No one on the site right now";
  $("#ana-live").classList.toggle("is-on", t.active_now > 0);

  $("#ana-stats").innerHTML =
    statCard(esc, fmt(t.sessions), "Visitors (sessions)") +
    statCard(esc, fmt(t.pageviews), "Pageviews") +
    statCard(esc, duration(t.avg_duration_seconds), "Avg. session") +
    statCard(esc, Math.round(t.bounce_rate * 100) + "%", "Bounce rate") +
    statCard(esc, fmt(t.active_now), "Active now");

  $("#ana-chart").innerHTML = data.series.length
    ? renderChart(esc, data.series, data.bucket)
    : '<p class="dash-empty">No visits in this period yet.</p>';

  const b = data.breakdowns;
  const place = (i) => (i.country ? `${i.label}, ${countryName(i.country)}` : i.label);
  $("#ana-lists").innerHTML =
    rankedList(esc, "Countries", b.countries, (i) => countryName(i.label), t.sessions) +
    rankedList(esc, "Regions", b.regions, place, t.sessions) +
    rankedList(esc, "Cities", b.cities, place, t.sessions) +
    rankedList(esc, "Devices", b.devices, (i) => DEVICE_LABELS[i.label] || i.label, t.sessions) +
    rankedList(esc, "Operating systems", b.os, (i) => i.label, t.sessions) +
    rankedList(esc, "Browsers", b.browsers, (i) => i.label, t.sessions) +
    rankedList(esc, "Top pages (views)", b.pages, (i) => i.label, t.pageviews) +
    rankedList(esc, "Landing pages", b.landing_pages, (i) => i.label, t.sessions) +
    rankedList(esc, "Traffic sources", b.sources, (i) => i.label, t.sessions);

  $("#ana-note").textContent =
    "Bounce rate = visits that viewed a single page. Region names are shown as the code the host reports for them. " +
    (data.truncated ? "Very high traffic: only the first 60,000 rows per table were counted. " : "") +
    "Updated " + manila(data.generated_at, { hour: "numeric", minute: "2-digit", second: "2-digit" }) + " (PH time).";

  const rows = data.recent || [];
  $("#ana-recent-panel").hidden = !rows.length;
  $("#ana-recent").innerHTML = rows.length
    ? `<thead><tr><th>Started</th><th>Location</th><th>Device</th><th>Landing page</th><th>Pages</th><th>Time</th><th>Source</th></tr></thead><tbody>` +
      rows.map((r) => `<tr>
        <td>${esc(manila(r.started_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</td>
        <td>${esc([r.city, r.region, r.country ? countryName(r.country) : null].filter(Boolean).join(", ") || "Unknown")}</td>
        <td>${esc([DEVICE_LABELS[r.device_type] || r.device_type, r.os, r.browser].filter(Boolean).join(" · "))}</td>
        <td>${esc(r.landing_path || "")}</td>
        <td>${fmt(r.page_count)}</td>
        <td>${esc(duration(r.duration_seconds))}</td>
        <td>${esc(r.source || "direct")}</td>
      </tr>`).join("") + "</tbody>"
    : "";
}

function showMessage(text) {
  const { $ } = state.ctx;
  $("#ana-body").hidden = true;
  $("#ana-recent-panel").hidden = true;
  const el = $("#ana-message");
  el.textContent = text;
  el.hidden = false;
  $("#ana-live").textContent = "";
}

async function load() {
  if (!state.ctx || state.loading) return;
  state.loading = true;
  try {
    const res = await fetch("/api/dashboard/analytics?range=" + encodeURIComponent(state.range), {
      headers: await state.ctx.authHeader(), cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load analytics");
    render(data);
  } catch (err) {
    showMessage(err.message || "Could not load analytics");
  } finally {
    state.loading = false;
  }
}

function stop() {
  clearInterval(state.timer);
  state.timer = null;
}

// Refreshes every 30s while the tab is open and the browser tab is in the foreground.
function start() {
  load();
  stop();
  state.timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
}

function init(ctx) {
  if (state.ctx) return;
  state.ctx = ctx;
  const { $, $$ } = ctx;
  $$("[data-ana-range]").forEach((chip) => chip.addEventListener("click", () => {
    state.range = chip.dataset.anaRange;
    $$("[data-ana-range]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
    load();
  }));
  $("#ana-refresh").addEventListener("click", load);
  // js/visit.js skips counting when this flag is set (same origin, so it shares localStorage).
  const box = $("#ana-exclude");
  try { box.checked = localStorage.getItem("pbc_no_track") === "1"; } catch { /* storage blocked */ }
  box.addEventListener("change", () => {
    try { box.checked ? localStorage.setItem("pbc_no_track", "1") : localStorage.removeItem("pbc_no_track"); } catch { /* ignore */ }
  });
}

window.DashboardAnalytics = { init, start, stop };
