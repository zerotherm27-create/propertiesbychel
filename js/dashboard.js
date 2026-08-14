/* Properties by Chel — owner dashboard (Supabase)
 * Leads CRM · listings management · site photos. Auth via supabase-js (ESM CDN).
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SB = window.SUPABASE_CONFIG || {};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const views = { unconfigured: $("#view-unconfigured"), auth: $("#view-auth"), app: $("#view-app") };
function show(name) {
  Object.entries(views).forEach(([k, el]) => { el.hidden = k !== name; });
  $("#signout-btn").hidden = name !== "app";
}

let toastTimer = null;
function showToast(message, isError) {
  const toast = $("#dash-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", !!isError);
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4000);
}

if (!SB.url || !SB.anonKey) {
  show("unconfigured");
} else {
  const supabase = createClient(SB.url, SB.anonKey);
  init(supabase);
}

async function init(supabase) {
  /* ————— auth ————— */
  const authForm = $("#auth-form");
  const authError = $("#auth-error");
  let signupMode = false;
  $("#a-email").value = SB.ownerEmail || "";

  $("#auth-toggle").addEventListener("click", () => {
    signupMode = !signupMode;
    $("#auth-title").textContent = signupMode ? "Create the owner account" : "Sign in";
    $("#auth-submit").textContent = signupMode ? "Create account" : "Sign in";
    $("#auth-toggle").textContent = signupMode ? "Back to sign in" : "Create the owner account";
    authError.textContent = "";
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authError.textContent = "";
    const email = $("#a-email").value.trim();
    const password = $("#a-pass").value;
    if (SB.ownerEmail && email.toLowerCase() !== SB.ownerEmail.toLowerCase()) {
      authError.textContent = "This dashboard is reserved for the practice owner (" + SB.ownerEmail + ").";
      return;
    }
    const { error } = signupMode
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) { authError.textContent = error.message; return; }
    if (signupMode) {
      authError.textContent = "Account created. If email confirmation is enabled, confirm via the email you received, then sign in.";
      signupMode = false;
      $("#auth-title").textContent = "Sign in";
      $("#auth-submit").textContent = "Sign in";
      $("#auth-toggle").textContent = "Create the owner account";
      return;
    }
    enter();
  });

  $("#signout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    show("auth");
  });

  $("#auth-reset").addEventListener("click", async () => {
    const email = $("#a-email").value.trim() || SB.ownerEmail;
    if (!email) { authError.textContent = "Enter your email above first."; return; }
    const btn = $("#auth-reset");
    btn.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("?")[0] });
    authError.textContent = error ? error.message : "If that address has an account, a reset link is on its way.";
    btn.disabled = false;
  });

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event !== "PASSWORD_RECOVERY") return;
    const next = prompt("Set a new password for the dashboard (min 8 characters):");
    if (!next) return;
    const { error } = await supabase.auth.updateUser({ password: next });
    alert(error ? "Could not set password: " + error.message : "Password updated. You're signed in.");
    if (!error) enter();
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (session) enter(); else show("auth");

  /* ————— app ————— */
  function enter() {
    show("app");
    loadLeads();
    loadDevelopments();
    loadListings();
    loadPhotos();
    if (window.DashboardContent) window.DashboardContent.init(supabase, { $, $$, esc, uploadPhoto, showToast });
  }

  /* tabs */
  $$(".dash-tabs .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".dash-tabs .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      ["leads", "listings", "photos", "content", "automation"].forEach((t) => { $("#tab-" + t).hidden = t !== chip.dataset.tab; });
    });
  });

  /* ————— leads (CRM) ————— */
  const STATUSES = ["new", "contacted", "viewing", "negotiating", "closed", "archived"];
  const STATUS_LABELS = { new: "New", contacted: "Contacted", viewing: "Viewing", negotiating: "Negotiating", closed: "Closed", archived: "Archived" };
  let leads = [];
  let leadFilter = "active";
  let leadView = "board";

  async function loadLeads() {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) { $("#leads-board").innerHTML = ""; $("#leads-list").innerHTML = '<p class="dash-empty">Could not load leads: ' + esc(error.message) + "</p>"; return; }
    leads = data;
    renderLeads();
  }

  $("#lead-filters").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-lstatus]");
    if (!chip) return;
    $$("#lead-filters .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    leadFilter = chip.dataset.lstatus;
    renderLeads();
  });

  function setLeadView(view) {
    leadView = view;
    $("#view-board-btn").setAttribute("aria-pressed", String(view === "board"));
    $("#view-list-btn").setAttribute("aria-pressed", String(view === "list"));
    $("#leads-board").hidden = view !== "board";
    $("#leads-list").hidden = view !== "list";
    renderLeads();
  }
  $("#view-board-btn").addEventListener("click", () => setLeadView("board"));
  $("#view-list-btn").addEventListener("click", () => setLeadView("list"));

  function visibleStatuses() {
    if (leadFilter === "all") return STATUSES;
    if (leadFilter === "active") return STATUSES.filter((s) => !["closed", "archived"].includes(s));
    return [leadFilter];
  }

  function filteredLeads() {
    return leads.filter((l) =>
      leadFilter === "all" ? true :
      leadFilter === "active" ? !["closed", "archived"].includes(l.status) :
      l.status === leadFilter);
  }

  function renderLeads() {
    if (leadView === "board") renderBoard(); else renderTable();
    renderAnalytics();
  }

  function renderAnalytics() {
    const total = leads.length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = leads.filter((l) => new Date(l.created_at).getTime() >= weekAgo).length;
    const closed = leads.filter((l) => l.status === "closed");
    const eligible = leads.filter((l) => l.status !== "archived");
    const conversionRate = eligible.length ? Math.round((closed.length / eligible.length) * 100) : 0;
    const avgDays = closed.length
      ? Math.round(closed.reduce((sum, l) => sum + (new Date(l.updated_at) - new Date(l.created_at)) / 86400000, 0) / closed.length)
      : null;

    $("#stat-total").textContent = total;
    $("#stat-week").textContent = newThisWeek;
    $("#stat-conversion").textContent = conversionRate + "%";
    $("#stat-avgdays").textContent = avgDays == null ? "—" : avgDays + "d";

    const statusCounts = STATUSES.map((s) => leads.filter((l) => l.status === s).length);
    const maxCount = Math.max(1, ...statusCounts);
    $("#leads-funnel").innerHTML = STATUSES.map((s, i) => `
      <div class="dash-funnel__row">
        <span class="dash-funnel__label">${STATUS_LABELS[s]}</span>
        <div class="dash-funnel__bar-track"><div class="dash-funnel__bar" style="transform:scaleX(${Math.max(statusCounts[i] / maxCount, 0.02)})"></div></div>
        <span class="dash-funnel__count">${statusCounts[i]}</span>
      </div>`).join("");

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      days.push(d);
    }
    const dayCounts = days.map((d) => {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return leads.filter((l) => { const t = new Date(l.created_at); return t >= d && t < next; }).length;
    });
    const maxDay = Math.max(1, ...dayCounts);
    $("#leads-trend").innerHTML = dayCounts.map((c, i) => {
      const label = days[i].toLocaleDateString("en-PH", { month: "short", day: "numeric" });
      return `<div class="dash-trend__bar" style="height:${Math.round((c / maxDay) * 100)}%" title="${label}: ${c}"></div>`;
    }).join("");
  }

  function leadCardHTML(l) {
    const when = new Date(l.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
    return `
      <button type="button" class="kanban-card" draggable="true" data-id="${l.id}">
        <span class="kanban-card__intent">${esc(l.intent || "Inquiry")}</span>
        <span class="kanban-card__name">${esc(l.name || "(no name)")}</span>
        <span class="kanban-card__meta">${when}${l.listing_slug ? " · " + esc(l.listing_slug) : ""}</span>
      </button>`;
  }

  function renderBoard() {
    const cols = visibleStatuses();
    $("#leads-board").innerHTML = cols.map((s) => {
      const rows = leads.filter((l) => l.status === s);
      return `
      <div class="kanban-col" data-status="${s}">
        <div class="kanban-col__head"><span>${STATUS_LABELS[s]}</span><span class="kanban-col__count">${rows.length}</span></div>
        <div class="kanban-col__body">${rows.length ? rows.map(leadCardHTML).join("") : '<p class="kanban-empty">No leads</p>'}</div>
      </div>`;
    }).join("");
  }

  function renderTable() {
    const rows = filteredLeads();
    if (!rows.length) { $("#leads-list").innerHTML = '<p class="dash-empty">No leads here yet. New inquiries from the site will appear automatically.</p>'; return; }
    $("#leads-list").innerHTML = `
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead><tr><th>Name</th><th>Intent</th><th>Contact</th><th>Brief</th><th>Source</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>
            ${rows.map((l) => {
              const when = new Date(l.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
              return `
              <tr data-id="${l.id}">
                <td><button type="button" class="dash-linkbtn" data-view-lead>${esc(l.name || "(no name)")}</button></td>
                <td>${esc(l.intent || "—")}</td>
                <td>${esc(l.email || "—")}${l.phone ? "<br>" + esc(l.phone) : ""}</td>
                <td>${esc([l.districts, l.budget_range, l.timeframe].filter(Boolean).join(" · ") || "—")}</td>
                <td>${esc(l.source_page || "—")}${l.listing_slug ? "<br>" + esc(l.listing_slug) : ""}</td>
                <td>
                  <select class="dash-status ${l.status === "new" ? "dash-status--new" : ""}" data-status>
                    ${STATUSES.map((s) => `<option value="${s}" ${s === l.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
                  </select>
                </td>
                <td>${when}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  async function updateLeadStatus(id, status) {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) { showToast("Could not update status: " + error.message, true); return false; }
    const lead = leads.find((l) => l.id === id);
    if (lead) lead.status = status;
    return true;
  }

  /* board: click to open detail */
  $("#leads-board").addEventListener("click", (e) => {
    const card = e.target.closest(".kanban-card");
    if (!card) return;
    const lead = leads.find((l) => l.id === card.dataset.id);
    if (lead) openLeadDetail(lead);
  });

  /* board: drag and drop between columns */
  $("#leads-board").addEventListener("dragstart", (e) => {
    const card = e.target.closest(".kanban-card");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });
  $("#leads-board").addEventListener("dragend", (e) => {
    const card = e.target.closest(".kanban-card");
    if (card) card.classList.remove("is-dragging");
  });
  $("#leads-board").addEventListener("dragover", (e) => {
    const col = e.target.closest(".kanban-col");
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    col.classList.add("is-dragover");
  });
  $("#leads-board").addEventListener("dragleave", (e) => {
    const col = e.target.closest(".kanban-col");
    if (col && !col.contains(e.relatedTarget)) col.classList.remove("is-dragover");
  });
  $("#leads-board").addEventListener("drop", async (e) => {
    const col = e.target.closest(".kanban-col");
    if (!col) return;
    e.preventDefault();
    col.classList.remove("is-dragover");
    const id = e.dataTransfer.getData("text/plain");
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === col.dataset.status) return;
    const ok = await updateLeadStatus(id, col.dataset.status);
    if (ok) renderLeads();
  });

  /* table: click name to open detail, status select updates directly */
  $("#leads-list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-lead]");
    if (!btn) return;
    const row = btn.closest("tr");
    const lead = leads.find((l) => l.id === row.dataset.id);
    if (lead) openLeadDetail(lead);
  });
  $("#leads-list").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    const row = e.target.closest("tr");
    const ok = await updateLeadStatus(row.dataset.id, sel.value);
    if (ok) renderLeads();
  });

  /* shared detail panel */
  function openLeadDetail(l) {
    $("#lead-detail-title").textContent = l.name || "(no name)";
    $("#lead-detail").dataset.id = l.id;
    const when = new Date(l.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    $("#lead-detail-body").innerHTML = `
      <dl style="margin:0">
        <dt>Status</dt>
        <dd>
          <select class="dash-status ${l.status === "new" ? "dash-status--new" : ""}" data-detail-status>
            ${STATUSES.map((s) => `<option value="${s}" ${s === l.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
          </select>
        </dd>
        <dt>Contact</dt><dd>${esc(l.email || "—")}${l.phone ? " · " + esc(l.phone) : ""}
          ${l.email ? ` · <a class="dash-linkbtn" href="mailto:${esc(l.email)}">write back</a>` : ""}</dd>
        <dt>Intent</dt><dd>${esc(l.intent || "—")}</dd>
        <dt>Brief</dt><dd>${esc([l.districts, l.budget_range, l.timeframe].filter(Boolean).join(" · ") || "—")}</dd>
        <dt>Source</dt><dd>${when} · ${esc(l.source_page || "—")}${l.listing_slug ? " · " + esc(l.listing_slug) : ""}</dd>
        ${l.notes ? `<dt>Their note</dt><dd>${esc(l.notes)}</dd>` : ""}
        <dt>Your notes</dt>
        <dd><textarea class="dash-note-field" data-note placeholder="Private notes: viewing feedback, next steps…">${esc(l.owner_notes || "")}</textarea>
        <button type="button" class="btn" data-save-note style="margin-top:var(--space-2)">Save note</button></dd>
      </dl>`;
    $("#lead-detail").hidden = false;
    $("#lead-detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#lead-detail-close").addEventListener("click", () => { $("#lead-detail").hidden = true; });

  $("#lead-detail-body").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-detail-status]");
    if (!sel) return;
    const id = $("#lead-detail").dataset.id;
    const ok = await updateLeadStatus(id, sel.value);
    if (ok) { sel.classList.toggle("dash-status--new", sel.value === "new"); renderLeads(); }
  });

  $("#lead-detail-body").addEventListener("click", async (e) => {
    if (!e.target.closest("[data-save-note]")) return;
    const btn = e.target.closest("[data-save-note]");
    const id = $("#lead-detail").dataset.id;
    const note = $("#lead-detail-body [data-note]").value;
    btn.textContent = "Saving…";
    const { error } = await supabase.from("leads").update({ owner_notes: note }).eq("id", id);
    btn.textContent = error ? "Failed, retry" : "Saved";
    setTimeout(() => { btn.textContent = "Save note"; }, 1800);
    const lead = leads.find((l) => l.id === id);
    if (lead && !error) lead.owner_notes = note;
  });

  /* ————— listings ————— */
  let listings = [];

  async function loadListings() {
    const { data, error } = await supabase.from("listings").select("*").order("sort_order", { ascending: true });
    if (error) { $("#listings-list").innerHTML = '<p class="dash-empty">Could not load listings: ' + esc(error.message) + "</p>"; return; }
    listings = data;
    renderListings();
  }

  function renderListings() {
    if (!listings.length) { $("#listings-list").innerHTML = '<p class="dash-empty">No listings yet. Add the first one.</p>'; return; }
    $("#listings-list").innerHTML = listings.map((l) => `
      <div class="dash-row" data-id="${l.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(l.title)}</span>
          <span class="dash-row__meta">${esc(l.price_display || "")} · ${esc(l.status)}</span>
          <span class="dash-row__spacer"></span>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-pub ${l.published ? "checked" : ""}> Published</label>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-feat ${l.featured ? "checked" : ""}> Featured</label>
          <button class="dash-linkbtn" data-edit>Edit</button>
          <button class="dash-linkbtn" data-del>Delete</button>
        </div>
      </div>`).join("");
  }

  /* ————— developments ————— */
  let developments = [];

  async function loadDevelopments() {
    const { data, error } = await supabase.from("developments").select("*").order("sort_order", { ascending: true });
    if (error) { $("#developments-list").innerHTML = '<p class="dash-empty">Could not load developments: ' + esc(error.message) + "</p>"; return; }
    developments = data;
    renderDevelopments();
    populateDevelopmentPicker();
  }

  function renderDevelopments() {
    if (!developments.length) { $("#developments-list").innerHTML = '<p class="dash-empty">No developments yet. Add the first one.</p>'; return; }
    $("#developments-list").innerHTML = developments.map((d) => `
      <div class="dash-row" data-id="${d.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(d.name)}</span>
          <span class="dash-row__meta">${esc(d.developer_name || "")}</span>
          <span class="dash-row__spacer"></span>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-pub ${d.published ? "checked" : ""}> Published</label>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-feat ${d.featured ? "checked" : ""}> Featured</label>
          <button class="dash-linkbtn" data-edit>Edit</button>
          <button class="dash-linkbtn" data-del>Delete</button>
        </div>
      </div>`).join("");
  }

  function populateDevelopmentPicker() {
    const select = form.elements.development_id;
    const current = select.value;
    select.innerHTML = '<option value="">— Standalone listing —</option>' +
      developments.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
    select.value = current;
  }

  const AGENT_URL = (window.SUPABASE_CONFIG || {}).contentAgentUrl || "";
  async function listingAuthHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: "Bearer " + session.access_token } : {};
  }
  const editor = $("#listing-editor");
  const form = $("#listing-form");
  let galleryImages = [];

  const devEditor = $("#development-editor");
  const devForm = $("#development-form");
  let devGalleryImages = [];

  $("#listing-new-btn").addEventListener("click", () => openEditor(null));
  $("#editor-close").addEventListener("click", () => { editor.hidden = true; });

  $("#development-new-btn").addEventListener("click", () => openDevelopmentEditor(null));
  $("#dev-editor-close").addEventListener("click", () => { devEditor.hidden = true; });

  function renderGalleryGrid() {
    $("#listing-gallery-grid").innerHTML = galleryImages.map((g, i) => `
      <div class="dash-gallery-item">
        <img src="${esc(g.url)}" alt="">
        <button type="button" class="dash-linkbtn" data-remove-gallery="${i}">Remove</button>
      </div>`).join("");
  }

  function renderDevGalleryGrid() {
    $("#development-gallery-grid").innerHTML = devGalleryImages.map((g, i) => `
      <div class="dash-gallery-item">
        <img src="${esc(g.url)}" alt="">
        <button type="button" class="dash-linkbtn" data-remove-dev-gallery="${i}">Remove</button>
      </div>`).join("");
  }

  function openEditor(l) {
    editor.hidden = false;
    $("#editor-title").textContent = l ? "Edit: " + l.title : "New listing";
    form.reset();
    $("#listing-ai-status").textContent = "";
    form.elements.id.value = l ? l.id : "";
    if (l) {
      ["title", "tag", "location_label", "meta_line", "price_display", "overview", "hero_image_url", "meta_description", "development_id"].forEach((k) => { form.elements[k].value = l[k] || ""; });
      form.elements.status.value = l.status;
      form.elements.aspect.value = l.aspect || "4/3";
      form.elements.sort_order.value = l.sort_order;
      form.elements.published.checked = l.published;
      form.elements.featured.checked = l.featured;
      $$('input[name="collections"]', form).forEach((cb) => { cb.checked = (l.collections || []).includes(cb.value); });
      const features = Array.isArray(l.location_features) ? l.location_features : [];
      for (let i = 0; i < 3; i++) {
        form.elements["feature_label_" + i].value = features[i] ? features[i].label : "";
        form.elements["feature_value_" + i].value = features[i] ? features[i].value : "";
      }
    }
    updateMetaCount();
    const prev = $("#listing-photo-preview");
    prev.hidden = !(l && l.hero_image_url);
    if (l && l.hero_image_url) prev.src = l.hero_image_url;
    $("#listing-photo-url").value = "";
    $("#listing-gallery-url").value = "";
    galleryImages = l && Array.isArray(l.gallery_images) ? l.gallery_images.slice() : [];
    renderGalleryGrid();
    listingLocationPicker.reset(l && l.map_lat != null ? l.map_lat : null, l && l.map_lng != null ? l.map_lng : null);
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openDevelopmentEditor(d) {
    devEditor.hidden = false;
    $("#dev-editor-title").textContent = d ? "Edit: " + d.name : "New development";
    devForm.reset();
    devForm.elements.id.value = d ? d.id : "";
    if (d) {
      ["name", "developer_name", "tagline", "location_label", "meta_line", "overview", "meta_description"].forEach((k) => { devForm.elements[k].value = d[k] || ""; });
      devForm.elements.sort_order.value = d.sort_order;
      devForm.elements.published.checked = d.published;
      devForm.elements.featured.checked = d.featured;
      devForm.elements.amenities_text.value = (d.amenities || []).join("\n");
      const features = Array.isArray(d.location_features) ? d.location_features : [];
      for (let i = 0; i < 5; i++) {
        devForm.elements["feature_label_" + i].value = features[i] ? features[i].label : "";
        devForm.elements["feature_value_" + i].value = features[i] ? features[i].value : "";
      }
    }
    updateDevMetaCount();
    const prev = $("#development-photo-preview");
    prev.hidden = !(d && d.hero_image_url);
    if (d && d.hero_image_url) prev.src = d.hero_image_url;
    $("#development-photo-url").value = "";
    $("#development-gallery-url").value = "";
    devGalleryImages = d && Array.isArray(d.gallery_images) ? d.gallery_images.slice() : [];
    renderDevGalleryGrid();
    devLocationPicker.reset(d && d.map_lat != null ? d.map_lat : null, d && d.map_lng != null ? d.map_lng : null);
    devEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#listing-photo").addEventListener("change", () => {
    const f = $("#listing-photo").files[0];
    if (!f) return;
    const prev = $("#listing-photo-preview");
    prev.src = URL.createObjectURL(f);
    prev.hidden = false;
  });

  $("#listing-photo-url").addEventListener("input", () => {
    const url = $("#listing-photo-url").value.trim();
    if (!url) return;
    const prev = $("#listing-photo-preview");
    prev.src = url;
    prev.hidden = false;
  });

  function updateMetaCount() {
    const n = form.elements.meta_description.value.length;
    const el = $("#listing-meta-count");
    el.textContent = n + " / 160";
    el.classList.toggle("is-over", n > 160);
  }
  form.elements.meta_description.addEventListener("input", updateMetaCount);

  $("#development-photo").addEventListener("change", () => {
    const f = $("#development-photo").files[0];
    if (!f) return;
    const prev = $("#development-photo-preview");
    prev.src = URL.createObjectURL(f);
    prev.hidden = false;
  });

  $("#development-photo-url").addEventListener("input", () => {
    const url = $("#development-photo-url").value.trim();
    if (!url) return;
    const prev = $("#development-photo-preview");
    prev.src = url;
    prev.hidden = false;
  });

  function updateDevMetaCount() {
    const n = devForm.elements.meta_description.value.length;
    const el = $("#dev-meta-count");
    el.textContent = n + " / 160";
    el.classList.toggle("is-over", n > 160);
  }
  devForm.elements.meta_description.addEventListener("input", updateDevMetaCount);

  $("#listing-ai-draft-btn").addEventListener("click", async () => {
    const title = form.elements.title.value.trim();
    const status = $("#listing-ai-status");
    if (!title) { status.textContent = "Enter a title first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    status.textContent = "Drafting…";
    $("#listing-ai-draft-btn").disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({
        title,
        location_label: form.elements.location_label.value.trim(),
        price_display: form.elements.price_display.value.trim(),
        meta_line: form.elements.meta_line.value.trim(),
        features: listingLocationPicker.featuresFromForm(),
        notes: form.elements.listing_notes.value.trim()
      });
      const r = await fetch(AGENT_URL + "/generate-listing-description", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Draft failed");
      form.elements.overview.value = data.overview || "";
      form.elements.meta_description.value = data.meta_description || "";
      updateMetaCount();
      status.textContent = "Draft ready. Review below, then save.";
    } catch (ex) {
      status.textContent = "Could not draft: " + (ex.message || ex);
    } finally {
      $("#listing-ai-draft-btn").disabled = false;
    }
  });

  $("#dev-import-btn").addEventListener("click", async () => {
    const url = $("#dev-import-url").value.trim();
    const status = $("#dev-import-status");
    if (!url) { status.textContent = "Paste the project's URL first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    status.textContent = "Fetching and reading the page…";
    $("#dev-import-btn").disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({ url });
      const r = await fetch(AGENT_URL + "/import-development", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Import failed");
      if (data.name) devForm.elements.name.value = data.name;
      if (data.developer_name) devForm.elements.developer_name.value = data.developer_name;
      if (data.tagline) devForm.elements.tagline.value = data.tagline;
      if (data.location_label) devForm.elements.location_label.value = data.location_label;
      if (data.meta_line) devForm.elements.meta_line.value = data.meta_line;
      if (data.overview) devForm.elements.overview.value = data.overview;
      if (Array.isArray(data.amenities) && data.amenities.length) devForm.elements.amenities_text.value = data.amenities.join("\n");
      if (Array.isArray(data.nearby_landmarks) && data.nearby_landmarks.length) {
        data.nearby_landmarks.slice(0, 5).forEach((f, i) => {
          devForm.elements["feature_label_" + i].value = f.label || "";
          devForm.elements["feature_value_" + i].value = f.value || "";
        });
      }

      let importedPhotos = false;
      if ($("#dev-import-photos-ok").checked && Array.isArray(data.images) && data.images.length) {
        const existing = new Set(devGalleryImages.map((g) => g.url));
        const newImages = data.images.filter((u) => !existing.has(u));
        if (newImages.length) {
          devGalleryImages.push(...newImages.map((url) => ({ url, alt: "" })));
          renderDevGalleryGrid();
          importedPhotos = true;
        }
      }
      status.textContent = importedPhotos
        ? "Imported — review every field below before saving. Pick a hero photo from the gallery yourself, and add the map location."
        : "Imported — review every field below before saving. Add the hero photo, gallery, and map location yourself.";
    } catch (ex) {
      status.textContent = "Could not import: " + (ex.message || ex);
    } finally {
      $("#dev-import-btn").disabled = false;
    }
  });

  $("#listing-import-btn").addEventListener("click", async () => {
    const url = $("#listing-import-url").value.trim();
    const status = $("#listing-import-status");
    if (!url) { status.textContent = "Paste the project's URL first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    status.textContent = "Fetching and reading the page…";
    $("#listing-import-btn").disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({ url });
      const r = await fetch(AGENT_URL + "/import-development", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Import failed");
      if (data.name) form.elements.title.value = data.name;
      if (data.location_label) form.elements.location_label.value = data.location_label;
      if (data.meta_line) form.elements.meta_line.value = data.meta_line;
      if (data.overview) form.elements.overview.value = data.overview;
      if (Array.isArray(data.nearby_landmarks) && data.nearby_landmarks.length) {
        data.nearby_landmarks.slice(0, 3).forEach((f, i) => {
          form.elements["feature_label_" + i].value = f.label || "";
          form.elements["feature_value_" + i].value = f.value || "";
        });
      }

      let importedPhotos = false;
      if ($("#listing-import-photos-ok").checked && Array.isArray(data.images) && data.images.length) {
        const existing = new Set(galleryImages.map((g) => g.url));
        const newImages = data.images.filter((u) => !existing.has(u));
        if (newImages.length) {
          galleryImages.push(...newImages.map((url) => ({ url, alt: "" })));
          renderGalleryGrid();
          importedPhotos = true;
        }
      }
      status.textContent = importedPhotos
        ? "Imported — review every field below before saving. Pick a hero photo from the gallery yourself, and add the map location."
        : "Imported — review every field below before saving. Add the hero photo, gallery, and map location yourself.";
    } catch (ex) {
      status.textContent = "Could not import: " + (ex.message || ex);
    } finally {
      $("#listing-import-btn").disabled = false;
    }
  });

  $("#listing-gallery-input").addEventListener("change", async () => {
    const files = Array.from($("#listing-gallery-input").files);
    if (!files.length) return;
    for (const f of files) {
      try {
        const url = await uploadPhoto(f, "listings-gallery");
        galleryImages.push({ url, alt: "" });
      } catch (ex) {
        showToast("Could not upload one of the photos: " + (ex.message || ex), true);
      }
    }
    $("#listing-gallery-input").value = "";
    renderGalleryGrid();
  });

  $("#listing-gallery-url-add").addEventListener("click", () => {
    const url = $("#listing-gallery-url").value.trim();
    if (!url) return;
    galleryImages.push({ url, alt: "" });
    $("#listing-gallery-url").value = "";
    renderGalleryGrid();
  });

  $("#listing-gallery-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-gallery]");
    if (!btn) return;
    galleryImages.splice(Number(btn.dataset.removeGallery), 1);
    renderGalleryGrid();
  });

  $("#development-gallery-input").addEventListener("change", async () => {
    const files = Array.from($("#development-gallery-input").files);
    if (!files.length) return;
    for (const f of files) {
      try {
        const url = await uploadPhoto(f, "developments-gallery");
        devGalleryImages.push({ url, alt: "" });
      } catch (ex) {
        showToast("Could not upload one of the photos: " + (ex.message || ex), true);
      }
    }
    $("#development-gallery-input").value = "";
    renderDevGalleryGrid();
  });

  $("#development-gallery-url-add").addEventListener("click", () => {
    const url = $("#development-gallery-url").value.trim();
    if (!url) return;
    devGalleryImages.push({ url, alt: "" });
    $("#development-gallery-url").value = "";
    renderDevGalleryGrid();
  });

  $("#development-gallery-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-dev-gallery]");
    if (!btn) return;
    devGalleryImages.splice(Number(btn.dataset.removeDevGallery), 1);
    renderDevGalleryGrid();
  });

  // Google Drive picker — lets the photo/gallery file inputs also be filled
  // from Drive. Configure js/supabase-config.js's GOOGLE_DRIVE_CONFIG to enable.
  const driveConfig = window.GOOGLE_DRIVE_CONFIG || {};
  let drivePickerReady = null;
  let driveTokenClient = null;
  let driveAccessToken = null;

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function loadDrivePicker() {
    if (!drivePickerReady) {
      drivePickerReady = Promise.all([
        loadScriptOnce("https://apis.google.com/js/api.js").then(() => new Promise((resolve) => window.gapi.load("picker", resolve))),
        loadScriptOnce("https://accounts.google.com/gsi/client")
      ]);
    }
    return drivePickerReady;
  }

  function getDriveAccessToken() {
    return new Promise((resolve, reject) => {
      if (driveAccessToken) return resolve(driveAccessToken);
      if (!driveTokenClient) {
        driveTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: driveConfig.clientId,
          scope: "https://www.googleapis.com/auth/drive.readonly",
          callback: (resp) => {
            if (resp.error) return reject(new Error(resp.error));
            driveAccessToken = resp.access_token;
            resolve(driveAccessToken);
          }
        });
      }
      driveTokenClient.requestAccessToken({ prompt: "" });
    });
  }

  async function fetchDriveFile(doc, token) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`, {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) throw new Error("Drive download failed (" + res.status + ")");
    const blob = await res.blob();
    return new File([blob], doc.name || (doc.id + ".jpg"), { type: doc.mimeType || blob.type || "image/jpeg" });
  }

  function openDrivePicker(multiple, onFiles) {
    if (!driveConfig.apiKey || !driveConfig.clientId) {
      showToast("Google Drive isn't configured yet — add GOOGLE_DRIVE_CONFIG in js/supabase-config.js", true);
      return;
    }
    loadDrivePicker()
      .then(getDriveAccessToken)
      .then((token) => {
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES).setSelectFolderEnabled(false);
        const builder = new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(driveConfig.apiKey)
          .setCallback((data) => {
            if (data.action !== google.picker.Action.PICKED) return;
            Promise.all(data.docs.map((doc) => fetchDriveFile(doc, token)))
              .then(onFiles)
              .catch((ex) => showToast("Could not fetch from Google Drive: " + (ex.message || ex), true));
          });
        if (multiple) builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED);
        builder.build().setVisible(true);
      })
      .catch((ex) => showToast("Google Drive sign-in failed: " + (ex.message || ex), true));
  }

  function filesIntoInput(input, files) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  $("#listing-photo-drive").addEventListener("click", () => {
    openDrivePicker(false, (files) => filesIntoInput($("#listing-photo"), files));
  });

  $("#listing-gallery-drive").addEventListener("click", () => {
    openDrivePicker(true, (files) => filesIntoInput($("#listing-gallery-input"), files));
  });

  $("#development-photo-drive").addEventListener("click", () => {
    openDrivePicker(false, (files) => filesIntoInput($("#development-photo"), files));
  });

  $("#development-gallery-drive").addEventListener("click", () => {
    openDrivePicker(true, (files) => filesIntoInput($("#development-gallery-input"), files));
  });

  // Map location — type an address, geocode it, drop a draggable pin.
  // Shared by both the listing form and the development form via
  // createLocationPicker(), parameterized by DOM-id prefix, owning form,
  // and how many nearby-feature rows that form has.
  const mapsConfig = window.GOOGLE_MAPS_CONFIG || {};
  let mapsSdkReady = null;

  function loadMapsSdk() {
    if (window.google && window.google.maps) return Promise.resolve();
    if (!mapsSdkReady) {
      mapsSdkReady = new Promise((resolve, reject) => {
        const cbName = "__initDashMaps" + Date.now();
        window[cbName] = () => { delete window[cbName]; resolve(); };
        loadScriptOnce("https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(mapsConfig.apiKey) + "&libraries=places&callback=" + cbName)
          .catch(reject);
      });
    }
    return mapsSdkReady;
  }

  // Suggest nearby features (transit, shopping, schools, healthcare) from Places, closest of each within 1.5km.
  const NEARBY_CATEGORIES = [
    { type: "transit_station", label: "Transit" },
    { type: "shopping_mall", label: "Shopping" },
    { type: "school", label: "Schools" },
    { type: "hospital", label: "Healthcare" }
  ];

  function haversineMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  const formatDistance = (m) => (m < 1000 ? Math.round(m) + "m" : (m / 1000).toFixed(1) + "km");

  function createLocationPicker({ formEl, prefix, featureRowCount }) {
    let map = null;
    let marker = null;

    function placePin(lat, lng) {
      const preview = $("#" + prefix + "-map-preview");
      preview.hidden = false;
      const pos = { lat, lng };
      if (!map) {
        map = new google.maps.Map(preview, { center: pos, zoom: 15, streetViewControl: false, mapTypeControl: false });
        marker = new google.maps.Marker({ position: pos, map, draggable: true });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          formEl.elements.map_lat.value = p.lat();
          formEl.elements.map_lng.value = p.lng();
        });
      } else {
        map.setCenter(pos);
        marker.setPosition(pos);
      }
      formEl.elements.map_lat.value = lat;
      formEl.elements.map_lng.value = lng;
    }

    function fillNextFeatureRow(label, value) {
      for (let i = 0; i < featureRowCount; i++) {
        if (!formEl.elements["feature_label_" + i].value.trim()) {
          formEl.elements["feature_label_" + i].value = label;
          formEl.elements["feature_value_" + i].value = value;
          return true;
        }
      }
      return false;
    }

    function renderNearbySuggestions(found) {
      const box = $("#" + prefix + "-nearby-suggestions");
      const note = $("#" + prefix + "-nearby-note");
      if (!found.length) return;
      found.sort((a, b) => a.distance - b.distance);
      box.innerHTML = found.map((f, i) =>
        `<button type="button" class="dash-suggest-chip" data-suggest="${i}">${esc(f.label)}: ${esc(f.name)} · ${formatDistance(f.distance)}</button>`
      ).join("");
      box.hidden = false;
      note.textContent = "Suggested from nearby places — click to add a row.";
      $$("[data-suggest]", box).forEach((btn, i) => {
        btn.addEventListener("click", () => {
          const f = found[i];
          if (!fillNextFeatureRow(f.label, f.name + ", " + formatDistance(f.distance) + " away")) {
            showToast("All " + featureRowCount + " nearby-feature rows are full", true);
            return;
          }
          btn.remove();
        });
      });
    }

    function suggestNearby(lat, lng) {
      if (!mapsConfig.apiKey) return;
      loadMapsSdk().then(() => {
        const service = new google.maps.places.PlacesService(map || document.createElement("div"));
        const found = [];
        let pending = NEARBY_CATEGORIES.length;
        NEARBY_CATEGORIES.forEach((cat) => {
          service.nearbySearch({ location: { lat, lng }, radius: 1500, type: cat.type }, (results, status) => {
            pending -= 1;
            if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length) {
              let best = null, bestDist = Infinity;
              results.forEach((r) => {
                if (!r.geometry || !r.geometry.location) return;
                const d = haversineMeters(lat, lng, r.geometry.location.lat(), r.geometry.location.lng());
                if (d < bestDist) { bestDist = d; best = r; }
              });
              if (best) found.push({ label: cat.label, name: best.name, distance: bestDist });
            }
            if (pending === 0) renderNearbySuggestions(found);
          });
        });
      }).catch(() => {});
    }

    function reset(lat, lng) {
      $("#" + prefix + "-map-address").value = "";
      $("#" + prefix + "-map-note").textContent = "Type an address and press Locate, then drag the pin to fine-tune.";
      formEl.elements.map_lat.value = lat != null ? lat : "";
      formEl.elements.map_lng.value = lng != null ? lng : "";
      $("#" + prefix + "-nearby-suggestions").hidden = true;
      $("#" + prefix + "-nearby-suggestions").innerHTML = "";
      $("#" + prefix + "-nearby-note").textContent = "";
      if (lat == null || lng == null) {
        $("#" + prefix + "-map-preview").hidden = true;
        return;
      }
      loadMapsSdk().then(() => {
        placePin(lat, lng);
        suggestNearby(lat, lng);
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: { lat, lng } }, (results, status) => {
          if (status === "OK" && results[0]) $("#" + prefix + "-map-address").value = results[0].formatted_address;
        });
      }).catch(() => {});
    }

    function featuresFromForm() {
      const rows = [];
      for (let i = 0; i < featureRowCount; i++) {
        const label = formEl.elements["feature_label_" + i].value.trim();
        const value = formEl.elements["feature_value_" + i].value.trim();
        if (label && value) rows.push({ label, value });
      }
      return rows;
    }

    $("#" + prefix + "-map-locate").addEventListener("click", () => {
      const address = $("#" + prefix + "-map-address").value.trim();
      const note = $("#" + prefix + "-map-note");
      if (!address) { showToast("Type an address first", true); return; }
      if (!mapsConfig.apiKey) { showToast("Google Maps isn't configured yet — add GOOGLE_MAPS_CONFIG in js/supabase-config.js", true); return; }
      note.textContent = "Locating…";
      $("#" + prefix + "-nearby-suggestions").hidden = true;
      $("#" + prefix + "-nearby-suggestions").innerHTML = "";
      $("#" + prefix + "-nearby-note").textContent = "";
      loadMapsSdk().then(() => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (status !== "OK" || !results[0]) {
            note.textContent = "Couldn't find that address — try refining it.";
            return;
          }
          const loc = results[0].geometry.location;
          placePin(loc.lat(), loc.lng());
          suggestNearby(loc.lat(), loc.lng());
          note.textContent = "Found: " + results[0].formatted_address + ". Drag the pin to fine-tune.";
        });
      }).catch((ex) => { note.textContent = "Could not load Google Maps: " + (ex.message || ex); });
    });

    return { reset, featuresFromForm };
  }

  const listingLocationPicker = createLocationPicker({ formEl: form, prefix: "listing", featureRowCount: 3 });
  const devLocationPicker = createLocationPicker({ formEl: devForm, prefix: "dev", featureRowCount: 5 });

  async function uploadPhoto(file, prefix) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${prefix}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("photos").upload(path, file, { upsert: true });
    if (error) throw error;
    return supabase.storage.from("photos").getPublicUrl(path).data.publicUrl;
  }

  const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#listing-error");
    err.textContent = "";
    const btn = $("#listing-save");
    btn.textContent = "Saving…";
    try {
      const photoFile = $("#listing-photo").files[0];
      const photoUrl = $("#listing-photo-url").value.trim();
      if (photoFile) form.elements.hero_image_url.value = await uploadPhoto(photoFile, "listings");
      else if (photoUrl) form.elements.hero_image_url.value = photoUrl;
      const isEdit = !!form.elements.id.value;
      const payload = {
        title: form.elements.title.value.trim(),
        status: form.elements.status.value,
        tag: form.elements.tag.value.trim() || null,
        collections: $$('input[name="collections"]:checked', form).map((c) => c.value),
        location_label: form.elements.location_label.value.trim() || null,
        meta_line: form.elements.meta_line.value.trim() || null,
        price_display: form.elements.price_display.value.trim() || null,
        overview: form.elements.overview.value.trim() || null,
        meta_description: form.elements.meta_description.value.trim() || null,
        hero_image_url: form.elements.hero_image_url.value || null,
        gallery_images: galleryImages,
        aspect: form.elements.aspect.value,
        sort_order: Number(form.elements.sort_order.value) || 100,
        published: form.elements.published.checked,
        featured: form.elements.featured.checked,
        development_id: form.elements.development_id.value || null,
        location_features: listingLocationPicker.featuresFromForm()
      };
      payload.map_lat = form.elements.map_lat.value !== "" ? Number(form.elements.map_lat.value) : null;
      payload.map_lng = form.elements.map_lng.value !== "" ? Number(form.elements.map_lng.value) : null;
      if (!isEdit) payload.slug = slugify(payload.title);
      const q = isEdit
        ? supabase.from("listings").update(payload).eq("id", form.elements.id.value)
        : supabase.from("listings").insert(payload);
      const { error } = await q;
      if (error) throw error;
      editor.hidden = true;
      await loadListings();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
    } finally {
      btn.textContent = "Save listing";
    }
  });

  $("#listings-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".dash-row");
    if (!row) return;
    const l = listings.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-edit]")) openEditor(l);
    if (e.target.closest("[data-del]")) {
      if (!confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
      const { error } = await supabase.from("listings").delete().eq("id", l.id);
      if (error) showToast("Could not delete: " + error.message, true);
      else loadListings();
    }
  });

  $("#listings-list").addEventListener("change", async (e) => {
    const row = e.target.closest(".dash-row");
    if (!row) return;
    const patch = e.target.closest("[data-pub]") ? { published: e.target.checked }
                : e.target.closest("[data-feat]") ? { featured: e.target.checked } : null;
    if (!patch) return;
    const { error } = await supabase.from("listings").update(patch).eq("id", row.dataset.id);
    if (error) { showToast("Could not update: " + error.message, true); loadListings(); }
  });

  devForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#development-error");
    err.textContent = "";
    const btn = $("#development-save");
    btn.textContent = "Saving…";
    try {
      const photoFile = $("#development-photo").files[0];
      const photoUrl = $("#development-photo-url").value.trim();
      if (photoFile) devForm.elements.hero_image_url.value = await uploadPhoto(photoFile, "developments");
      else if (photoUrl) devForm.elements.hero_image_url.value = photoUrl;
      const isEdit = !!devForm.elements.id.value;
      const payload = {
        name: devForm.elements.name.value.trim(),
        developer_name: devForm.elements.developer_name.value.trim() || null,
        tagline: devForm.elements.tagline.value.trim() || null,
        location_label: devForm.elements.location_label.value.trim() || null,
        meta_line: devForm.elements.meta_line.value.trim() || null,
        overview: devForm.elements.overview.value.trim() || null,
        meta_description: devForm.elements.meta_description.value.trim() || null,
        hero_image_url: devForm.elements.hero_image_url.value || null,
        gallery_images: devGalleryImages,
        amenities: devForm.elements.amenities_text.value.split("\n").map((s) => s.trim()).filter(Boolean),
        sort_order: Number(devForm.elements.sort_order.value) || 100,
        published: devForm.elements.published.checked,
        featured: devForm.elements.featured.checked,
        location_features: devLocationPicker.featuresFromForm()
      };
      payload.map_lat = devForm.elements.map_lat.value !== "" ? Number(devForm.elements.map_lat.value) : null;
      payload.map_lng = devForm.elements.map_lng.value !== "" ? Number(devForm.elements.map_lng.value) : null;
      if (!isEdit) payload.slug = slugify(payload.name);
      const q = isEdit
        ? supabase.from("developments").update(payload).eq("id", devForm.elements.id.value)
        : supabase.from("developments").insert(payload);
      const { error } = await q;
      if (error) throw error;
      devEditor.hidden = true;
      await loadDevelopments();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
    } finally {
      btn.textContent = "Save development";
    }
  });

  $("#developments-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".dash-row");
    if (!row) return;
    const d = developments.find((x) => x.id === row.dataset.id);
    if (e.target.closest("[data-edit]")) openDevelopmentEditor(d);
    if (e.target.closest("[data-del]")) {
      if (!confirm(`Delete "${d.name}"? Units linked to it become standalone listings. This cannot be undone.`)) return;
      const { error } = await supabase.from("developments").delete().eq("id", d.id);
      if (error) showToast("Could not delete: " + error.message, true);
      else { await loadDevelopments(); loadListings(); }
    }
  });

  $("#developments-list").addEventListener("change", async (e) => {
    const row = e.target.closest(".dash-row");
    if (!row) return;
    const patch = e.target.closest("[data-pub]") ? { published: e.target.checked }
                : e.target.closest("[data-feat]") ? { featured: e.target.checked } : null;
    if (!patch) return;
    const { error } = await supabase.from("developments").update(patch).eq("id", row.dataset.id);
    if (error) { showToast("Could not update: " + error.message, true); loadDevelopments(); }
  });

  /* ————— site photos ————— */
  async function loadPhotos() {
    const { data } = await supabase.from("site_settings").select("*");
    (data || []).forEach((r) => {
      if (r.key === "hero_image" && r.value?.url) $("#photo-hero-preview").src = r.value.url;
      if (r.key === "profile_image" && r.value?.url) $("#photo-profile-preview").src = r.value.url;
    });
  }

  $$("[data-photo-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.photoSave;
      const input = key === "hero_image" ? $("#photo-hero-file") : $("#photo-profile-file");
      const file = input.files[0];
      const note = $("#photos-note");
      if (!file) { note.textContent = "Choose an image file first."; return; }
      btn.textContent = "Uploading…";
      try {
        const url = await uploadPhoto(file, "site");
        const { error } = await supabase.from("site_settings").upsert({ key, value: { url } });
        if (error) throw error;
        (key === "hero_image" ? $("#photo-hero-preview") : $("#photo-profile-preview")).src = url;
        note.textContent = "Saved. The site now uses the new photo.";
      } catch (ex) {
        note.textContent = "Upload failed: " + (ex.message || ex);
      } finally {
        btn.textContent = "Upload & use";
      }
    });
  });
}
