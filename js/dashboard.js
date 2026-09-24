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
    loadDevelopers();
    loadDevelopments();
    loadListings();
    loadPhotos();
    loadFlows();
    loadEnrollments();
    loadTemplates();
    loadSignature();
    loadInbox();
    setInterval(() => {
      if (document.visibilityState === "visible" && !$("#tab-inbox").hidden && !inboxChecked.size) loadInbox();
    }, 45000);
    if (window.DashboardAnalytics) window.DashboardAnalytics.init({ $, $$, esc, authHeader: listingAuthHeader });
    if (window.DashboardContent) window.DashboardContent.init(supabase, { $, $$, esc, uploadPhoto, showToast });
  }

  /* tabs */
  $$(".dash-tabs .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".dash-tabs .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      ["leads", "developments", "listings", "photos", "content", "automation", "inbox", "analytics"].forEach((t) => { $("#tab-" + t).hidden = t !== chip.dataset.tab; });
      if (chip.dataset.tab === "automation") loadEnrollments();
      if (chip.dataset.tab === "inbox") loadInbox();
      if (window.DashboardAnalytics) window.DashboardAnalytics[chip.dataset.tab === "analytics" ? "start" : "stop"]();
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
    const activeFlows = flows.filter((f) => f.active);
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
        <dt>Email</dt>
        <dd>
          <label class="dash-switch"><input type="checkbox" data-email-optout ${l.email_opt_out ? "checked" : ""}> This lead has opted out of email</label>
          ${!l.email ? '<p class="field__note">No email address on file — can\'t compose one.</p>' :
            `<button type="button" class="btn mt-4" data-compose-toggle>Compose email</button>
             <div id="lead-compose" class="mt-4" hidden>
               <div class="field"><label>What should this email accomplish?</label><textarea data-compose-goal rows="2" placeholder="e.g. Follow up after their viewing last week and ask if they have questions"></textarea></div>
               <button type="button" class="btn" data-compose-draft>Draft with AI</button>
               <div class="field mt-4"><label>Subject</label><input type="text" data-compose-subject></div>
               <div class="field"><label>Body</label><textarea data-compose-body rows="8"></textarea></div>
               <button type="button" class="btn btn--solid" data-compose-send>Send</button>
               <p class="field__note" data-compose-status></p>
             </div>`}
        </dd>
        <dt>Nurture flow</dt>
        <dd>
          <p class="field__note">A flow sends automatically once started — there's no review step per send, unlike Compose email above.</p>
          ${activeFlows.length ?
            `<select data-flow-select>${activeFlows.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select>
             <button type="button" class="btn" data-flow-start>Start</button>
             <p class="field__note" data-flow-status></p>` :
            '<p class="field__note">No active flows yet — build one under the Automation tab.</p>'}
        </dd>
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
    const id = $("#lead-detail").dataset.id;
    const lead = leads.find((l) => l.id === id);

    if (e.target.closest("[data-save-note]")) {
      const btn = e.target.closest("[data-save-note]");
      const note = $("#lead-detail-body [data-note]").value;
      btn.textContent = "Saving…";
      const { error } = await supabase.from("leads").update({ owner_notes: note }).eq("id", id);
      btn.textContent = error ? "Failed, retry" : "Saved";
      setTimeout(() => { btn.textContent = "Save note"; }, 1800);
      if (lead && !error) lead.owner_notes = note;
      return;
    }

    if (e.target.closest("[data-compose-toggle]")) {
      $("#lead-compose").hidden = !$("#lead-compose").hidden;
      return;
    }

    if (e.target.closest("[data-compose-draft]")) {
      const status = $("#lead-detail-body [data-compose-status]");
      const goal = $("#lead-detail-body [data-compose-goal]").value.trim();
      if (!goal) { status.textContent = "Say what this email should accomplish first."; return; }
      if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
      const btn = e.target.closest("[data-compose-draft]");
      btn.disabled = true;
      status.textContent = "Drafting…";
      try {
        const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
        const body = JSON.stringify({
          lead: { name: lead.name, intent: lead.intent, districts: lead.districts, budget_range: lead.budget_range, timeframe: lead.timeframe, notes: lead.notes, status: lead.status },
          goal
        });
        const r = await fetch(AGENT_URL + "/generate-lead-email", { method: "POST", headers, body });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Draft failed");
        $("#lead-detail-body [data-compose-subject]").value = data.subject || "";
        $("#lead-detail-body [data-compose-body]").value = data.body_html || "";
        status.textContent = "Draft ready. Review and edit before sending.";
      } catch (ex) {
        status.textContent = "Could not draft: " + (ex.message || ex);
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (e.target.closest("[data-compose-send]")) {
      const status = $("#lead-detail-body [data-compose-status]");
      const subject = $("#lead-detail-body [data-compose-subject]").value.trim();
      const body_html = $("#lead-detail-body [data-compose-body]").value.trim();
      const goal = $("#lead-detail-body [data-compose-goal]").value.trim();
      if (!subject || !body_html) { status.textContent = "Subject and body are both required."; return; }
      const btn = e.target.closest("[data-compose-send]");
      btn.disabled = true;
      status.textContent = "Sending…";
      try {
        const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
        const body = JSON.stringify({ lead_id: id, subject, body_html, goal });
        const r = await fetch("/api/send-lead-email", { method: "POST", headers, body });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Send failed");
        status.textContent = "Sent.";
        showToast("Email sent.");
      } catch (ex) {
        status.textContent = "Could not send: " + (ex.message || ex);
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (e.target.closest("[data-flow-start]")) {
      const status = $("#lead-detail-body [data-flow-status]");
      const sel = $("#lead-detail-body [data-flow-select]");
      const flow = flows.find((f) => f.id === sel.value);
      if (!flow) return;
      const nodes = flow.graph && flow.graph.drawflow ? Object.entries(flow.graph.drawflow.Home.data) : [];
      const triggerEntry = nodes.find(([, n]) => n.name === "trigger");
      if (!triggerEntry) { status.textContent = "This flow has no starting block."; return; }
      const btn = e.target.closest("[data-flow-start]");
      btn.disabled = true;
      status.textContent = "Starting…";
      const now = new Date().toISOString();
      const { error } = await supabase.from("lead_flow_enrollments").insert({
        lead_id: id, flow_id: flow.id, current_node_id: triggerEntry[0],
        node_entered_at: now, next_check_at: now, enrolled_at: now
      });
      if (error) {
        status.textContent = error.code === "23505" ? "Already enrolled in this flow." : "Could not start: " + error.message;
      } else {
        status.textContent = "Enrolled.";
        loadEnrollments();
      }
      btn.disabled = false;
      return;
    }
  });

  $("#lead-detail-body").addEventListener("change", async (e) => {
    const optout = e.target.closest("[data-email-optout]");
    if (!optout) return;
    const id = $("#lead-detail").dataset.id;
    const { error } = await supabase.from("leads").update({ email_opt_out: optout.checked }).eq("id", id);
    if (error) { showToast("Could not update: " + error.message, true); optout.checked = !optout.checked; return; }
    const lead = leads.find((l) => l.id === id);
    if (lead) lead.email_opt_out = optout.checked;
  });

  /* manually add a lead — a call, referral, or walk-in that didn't come
     through the site's own inquiry form */
  const leadEditor = $("#lead-editor");
  const leadForm = $("#lead-form");
  $("#lead-new-btn").addEventListener("click", () => {
    leadForm.reset();
    $("#lead-error").textContent = "";
    leadEditor.hidden = false;
    leadEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#lead-editor-close").addEventListener("click", () => { leadEditor.hidden = true; });

  leadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#lead-error");
    err.textContent = "";
    const btn = $("#lead-save");
    btn.textContent = "Saving…";
    try {
      const payload = {
        name: leadForm.elements.name.value.trim(),
        email: leadForm.elements.email.value.trim() || null,
        phone: leadForm.elements.phone.value.trim() || null,
        intent: leadForm.elements.intent.value || null,
        districts: leadForm.elements.districts.value.trim() || null,
        budget_range: leadForm.elements.budget_range.value || null,
        timeframe: leadForm.elements.timeframe.value || null,
        listing_slug: leadForm.elements.listing_slug.value.trim() || null,
        notes: leadForm.elements.notes.value.trim() || null,
        status: leadForm.elements.status.value,
        source_page: "dashboard",
      };
      const { error } = await supabase.from("leads").insert(payload);
      if (error) throw error;
      leadEditor.hidden = true;
      await loadLeads();
      showToast("Lead added.");
    } catch (ex) {
      err.textContent = ex.message || "Could not save this lead.";
    } finally {
      btn.textContent = "Save lead";
    }
  });

  /* batch-add leads — paste rows copied from a spreadsheet, or a CSV file */
  const LEAD_COLUMN_ALIASES = {
    name: "name", "full name": "name", "full_name": "name", "client": "name",
    email: "email", "e-mail": "email",
    phone: "phone", mobile: "phone", contact: "phone", "phone number": "phone",
    intent: "intent",
    district: "districts", districts: "districts",
    budget: "budget_range", "budget range": "budget_range", "budget_range": "budget_range",
    timeframe: "timeframe", timeline: "timeframe",
    listing: "listing_slug", "listing slug": "listing_slug", "listing_slug": "listing_slug", slug: "listing_slug",
    notes: "notes", note: "notes",
    status: "status",
  };

  /* Splits one line on a delimiter, honouring double-quoted fields for CSV —
     a spreadsheet paste is tab-delimited and essentially never needs that. */
  function splitDelimitedLine(line, delim) {
    if (delim === "\t") return line.split("\t");
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
        else cur += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delim) { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    return cells;
  }

  function parseLeadRows(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return { rows: [], skipped: [] };
    const delim = lines[0].includes("\t") ? "\t" : ",";
    const header = splitDelimitedLine(lines[0], delim).map((h) => h.trim().toLowerCase());
    const rows = [];
    const skipped = [];
    lines.slice(1).forEach((line, i) => {
      const cells = splitDelimitedLine(line, delim);
      const raw = {};
      header.forEach((h, j) => {
        const col = LEAD_COLUMN_ALIASES[h];
        if (col && cells[j] !== undefined) raw[col] = cells[j].trim();
      });
      if (!raw.name) { skipped.push({ line: i + 2, reason: "no name" }); return; }
      rows.push({
        name: raw.name,
        email: raw.email || null,
        phone: raw.phone || null,
        intent: raw.intent || null,
        districts: raw.districts || null,
        budget_range: raw.budget_range || null,
        timeframe: raw.timeframe || null,
        listing_slug: raw.listing_slug || null,
        notes: raw.notes || null,
        status: STATUSES.includes(raw.status) ? raw.status : "contacted",
        source_page: "dashboard-batch",
      });
    });
    return { rows, skipped };
  }

  const batchEditor = $("#lead-batch-editor");
  const batchPreviewEl = $("#lead-batch-preview");
  const batchImportBtn = $("#lead-batch-import-btn");
  let batchRows = [];

  $("#lead-batch-btn").addEventListener("click", () => {
    $("#lead-batch-file").value = "";
    $("#lead-batch-paste").value = "";
    batchPreviewEl.innerHTML = "";
    batchImportBtn.hidden = true;
    $("#lead-batch-error").textContent = "";
    batchRows = [];
    batchEditor.hidden = false;
    batchEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#lead-batch-close").addEventListener("click", () => { batchEditor.hidden = true; });

  $("#lead-batch-file").addEventListener("change", async () => {
    const file = $("#lead-batch-file").files[0];
    if (file) $("#lead-batch-paste").value = await file.text();
  });

  $("#lead-batch-preview-btn").addEventListener("click", () => {
    const err = $("#lead-batch-error");
    err.textContent = "";
    const text = $("#lead-batch-paste").value.trim();
    if (!text) { err.textContent = "Paste some rows or choose a file first."; return; }
    const { rows, skipped } = parseLeadRows(text);
    batchRows = rows;
    if (!rows.length) {
      batchPreviewEl.innerHTML = "";
      batchImportBtn.hidden = true;
      err.textContent = skipped.length
        ? `No usable rows — every line was missing a name (${skipped.length} skipped).`
        : "No rows found. Check the format against the example above.";
      return;
    }
    batchPreviewEl.innerHTML = `
      <p class="field__note">${rows.length} lead${rows.length === 1 ? "" : "s"} ready to import${skipped.length ? `, ${skipped.length} row${skipped.length === 1 ? "" : "s"} skipped (no name)` : ""}.</p>
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Intent</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${esc(r.name)}</td>
                <td>${esc(r.email || r.phone || "—")}</td>
                <td>${esc(r.intent || "—")}</td>
                <td>${esc(r.status)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
    batchImportBtn.hidden = false;
    batchImportBtn.textContent = `Import ${rows.length} lead${rows.length === 1 ? "" : "s"}`;
  });

  batchImportBtn.addEventListener("click", async () => {
    if (!batchRows.length) return;
    const err = $("#lead-batch-error");
    err.textContent = "";
    batchImportBtn.textContent = "Importing…";
    batchImportBtn.disabled = true;
    try {
      const { error } = await supabase.from("leads").insert(batchRows);
      if (error) throw error;
      showToast(`${batchRows.length} lead${batchRows.length === 1 ? "" : "s"} imported.`);
      batchEditor.hidden = true;
      await loadLeads();
    } catch (ex) {
      err.textContent = ex.message || "Could not import these leads.";
    } finally {
      batchImportBtn.disabled = false;
    }
  });

  /* ————— automation: visual nurture flows (Drawflow) ————— */
  let flows = [];
  let flowEditor = null;
  const FLOW_NODE_LABELS = { trigger: "New Lead", wait: "Wait", send_email: "Send Email", condition: "Condition" };

  function flowNodeHtml(type, data) {
    data = data || {};
    let meta = "";
    if (type === "wait") meta = "Day " + (data.delay_days || 0);
    if (type === "send_email") {
      const t = templates.find((x) => x.id === data.template_id);
      meta = t ? t.name : "No template selected";
    }
    if (type === "condition") meta = "Yes: status in " + ((data.value || []).join(", ") || "(none set)");
    return `<div><div class="dash-flow-node__type">${esc(type.replace("_", " "))}</div><div class="dash-flow-node__label">${esc(FLOW_NODE_LABELS[type] || type)}</div>${meta ? `<div class="dash-flow-node__meta">${esc(meta)}</div>` : ""}</div>`;
  }

  function refreshFlowNodeDom(nodeId) {
    const node = flowEditor.getNodeFromId(nodeId);
    if (!node) return;
    const content = document.querySelector(`#node-${nodeId} .drawflow_content_node`);
    if (content) content.innerHTML = flowNodeHtml(node.name, node.data);
  }

  function initFlowEditor() {
    if (flowEditor) return flowEditor;
    flowEditor = new Drawflow($("#flow-canvas"));
    flowEditor.reroute = true;
    flowEditor.start();
    flowEditor.on("nodeSelected", (id) => openFlowNodeConfig(id));
    flowEditor.on("nodeUnselected", () => { $("#flow-node-config").hidden = true; });
    return flowEditor;
  }

  function addFlowNode(type, x, y, overrideData) {
    const inputs = type === "trigger" ? 0 : 1;
    const outputs = type === "condition" ? 2 : 1;
    const data = overrideData || (type === "wait" ? { delay_days: 1 }
      : type === "send_email" ? { template_id: null }
      : type === "condition" ? { field: "status", operator: "in", value: [] }
      : {});
    return flowEditor.addNode(type, inputs, outputs, x, y, type, data, flowNodeHtml(type, data));
  }

  $$(".dash-flow-palette__item").forEach((item) => {
    item.addEventListener("dragstart", (e) => { e.dataTransfer.setData("node-type", item.dataset.nodeType); });
  });
  $("#flow-canvas").addEventListener("dragover", (e) => e.preventDefault());
  $("#flow-canvas").addEventListener("drop", (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("node-type");
    if (!type || !flowEditor) return;
    const rect = $("#flow-canvas").getBoundingClientRect();
    const x = (e.clientX - rect.left - flowEditor.canvas_x) / flowEditor.zoom;
    const y = (e.clientY - rect.top - flowEditor.canvas_y) / flowEditor.zoom;
    addFlowNode(type, x, y);
  });

  function openFlowNodeConfig(nodeId) {
    const node = flowEditor.getNodeFromId(nodeId);
    const panel = $("#flow-node-config");
    if (!node || node.name === "trigger") { panel.hidden = true; return; }
    panel.dataset.nodeId = nodeId;
    if (node.name === "wait") {
      panel.innerHTML = `<h3 class="h3">Wait</h3><div class="field"><label>Day (counted from enrollment, not from the previous block — the engine only checks once a day, so exact-hour timing isn't guaranteed)</label><input type="number" min="0" id="flow-cfg-delay" value="${node.data.delay_days || 0}"></div>`;
    } else if (node.name === "send_email") {
      panel.innerHTML = `<h3 class="h3">Send Email</h3><div class="field"><label>Template</label><select id="flow-cfg-template"><option value="">Choose a template…</option>${templates.map((t) => `<option value="${t.id}" ${t.id === node.data.template_id ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>`;
    } else if (node.name === "condition") {
      const selected = node.data.value || [];
      panel.innerHTML = `<h3 class="h3">Condition</h3><p class="field__note">Checks the lead's pipeline status. The first output (top) is Yes, the second (bottom) is No.</p><div class="field"><label>Status is one of</label><div class="dash-checks">${STATUSES.map((s) => `<label><input type="checkbox" value="${s}" ${selected.includes(s) ? "checked" : ""}> ${esc(STATUS_LABELS[s])}</label>`).join("")}</div></div>`;
    }
    panel.hidden = false;
  }

  $("#flow-node-config").addEventListener("input", () => {
    const nodeId = Number($("#flow-node-config").dataset.nodeId);
    const node = flowEditor.getNodeFromId(nodeId);
    if (!node) return;
    let data = {};
    if (node.name === "wait") data = { delay_days: Math.max(0, Number($("#flow-cfg-delay").value) || 0) };
    else if (node.name === "send_email") data = { template_id: $("#flow-cfg-template").value || null };
    else if (node.name === "condition") {
      const checked = Array.from($("#flow-node-config").querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value);
      data = { field: "status", operator: "in", value: checked };
    }
    flowEditor.updateNodeDataFromId(nodeId, data);
    refreshFlowNodeDom(nodeId);
  });

  async function loadFlows() {
    const { data, error } = await supabase.from("email_flows").select("*").order("created_at", { ascending: true });
    if (error) { $("#flows-list").innerHTML = '<p class="dash-empty">Could not load flows: ' + esc(error.message) + "</p>"; return; }
    flows = data;
    renderFlowsList();
  }

  function renderFlowsList() {
    if (!flows.length) { $("#flows-list").innerHTML = '<p class="dash-empty">No flows yet.</p>'; return; }
    $("#flows-list").innerHTML = flows.map((f) => `
      <div class="dash-row" data-id="${f.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(f.name)}</span>
          <span class="dash-row__meta">${f.active ? "active" : "inactive"}</span>
          <span class="dash-row__spacer"></span>
          <button type="button" class="dash-linkbtn" data-edit-flow>Edit</button>
          <button type="button" class="dash-linkbtn" data-del-flow>Delete</button>
        </div>
      </div>`).join("");
  }

  $("#flows-list").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const f = flows.find((x) => x.id === row.dataset.id);
    if (!f) return;
    if (e.target.closest("[data-edit-flow]")) openFlowEditor(f);
    if (e.target.closest("[data-del-flow]")) {
      if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return;
      const { error } = await supabase.from("email_flows").delete().eq("id", f.id);
      if (error) showToast("Could not delete: " + error.message, true);
      else loadFlows();
    }
  });

  function openFlowEditor(f) {
    $("#flow-error").textContent = "";
    $("#flow-name").value = f ? f.name : "";
    $("#flow-active").checked = f ? f.active : true;
    $("#flow-editor").dataset.id = f ? f.id : "";
    $("#flow-editor-title").textContent = f ? "Edit flow" : "New flow";
    $("#flow-node-config").hidden = true;
    $("#flow-editor").hidden = false;
    $("#flow-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    const fe = initFlowEditor();
    fe.clear();
    if (f && f.graph && f.graph.drawflow) {
      fe.import(f.graph);
    } else {
      addFlowNode("trigger", 50, 50);
    }
  }

  $("#flow-new-btn").addEventListener("click", () => openFlowEditor(null));
  $("#flow-editor-close").addEventListener("click", () => { $("#flow-editor").hidden = true; });

  /* AI-generated flow: replaces the canvas with a linear Trigger → (Wait →
   * Send Email) × N chain, creating a real email_templates row for each
   * send along the way. Branching (Condition blocks) stays a manual,
   * drag-in feature — reliably generating a branching graph from a prompt
   * is a further step this doesn't attempt. */
  /* Lays out generated flows top-to-bottom like the reference product,
   * instead of one long horizontal row: a single trunk column for the
   * spine, branching into a left (Yes) and right (No) column below a
   * Condition block. */
  const FLOW_LAYOUT = { trunkX: 320, yesX: 60, noX: 580, rowGap: 110 };

  async function generateFlowFromAI({ category, angle }) {
    const status = $("#flow-ai-status");
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    $("#flow-quick-generate-btn").disabled = true;
    $("#flow-custom-ai-btn").disabled = true;
    status.textContent = "Generating…";
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({ category, angle });
      const r = await fetch(AGENT_URL + "/generate-flow", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Generation failed");

      $("#flow-name").value = data.name || "";
      initFlowEditor().clear();
      $("#flow-node-config").hidden = true;

      async function createTemplate(step, labelSuffix) {
        const { data: templateRow, error } = await supabase.from("email_templates").insert({
          name: step.template.name || (data.name + labelSuffix),
          category: category || "general",
          subject: step.template.subject || "",
          heading: step.template.heading || "",
          body: step.template.body || "",
          button_text: step.template.button_text || null,
          button_url: "https://www.propertiesbychel.com/presentation",
          ai_generated: true
        }).select().single();
        if (error) throw new Error("Could not create template: " + error.message);
        templates.push(templateRow);
        return templateRow;
      }

      // A vertical Wait -> Send chain in one column, connected onward from
      // prevId via prevOutputKey (only the FIRST hop uses that output —
      // matters when prevId is a Condition block with two outputs).
      async function buildChain(steps, x, startY, prevId, prevOutputKey, labelSuffix) {
        let y = startY;
        let prev = prevId;
        let outputKey = prevOutputKey;
        let count = 0;
        for (const step of steps || []) {
          const waitId = addFlowNode("wait", x, y, { delay_days: step.delay_days || 0 });
          flowEditor.addConnection(prev, waitId, outputKey, "input_1");
          outputKey = "output_1";
          y += FLOW_LAYOUT.rowGap;
          const templateRow = await createTemplate(step, labelSuffix);
          const sendId = addFlowNode("send_email", x, y, { template_id: templateRow.id });
          flowEditor.addConnection(waitId, sendId, "output_1", "input_1");
          y += FLOW_LAYOUT.rowGap;
          prev = sendId;
          count++;
        }
        return { lastId: prev, y, count };
      }

      let y = 40;
      const triggerId = addFlowNode("trigger", FLOW_LAYOUT.trunkX, y);
      y += FLOW_LAYOUT.rowGap;

      const spine = await buildChain(data.steps, FLOW_LAYOUT.trunkX, y, triggerId, "output_1", " — step");
      let emailCount = spine.count;
      y = spine.y;

      const branchValues = ((data.branch && data.branch.condition && data.branch.condition.value) || [])
        .filter((v) => STATUSES.includes(v));
      if (data.branch && branchValues.length) {
        const condId = addFlowNode("condition", FLOW_LAYOUT.trunkX, y, {
          field: (data.branch.condition && data.branch.condition.field) || "status",
          operator: (data.branch.condition && data.branch.condition.operator) || "in",
          value: branchValues
        });
        flowEditor.addConnection(spine.lastId, condId, "output_1", "input_1");
        const branchY = y + FLOW_LAYOUT.rowGap;

        const yes = await buildChain(data.branch.yes_steps, FLOW_LAYOUT.yesX, branchY, condId, "output_1", " — warm");
        const no = await buildChain(data.branch.no_steps, FLOW_LAYOUT.noX, branchY, condId, "output_2", " — not yet");
        emailCount += yes.count + no.count;
      }

      status.textContent = emailCount + " email(s) generated as new templates. Review each block, then save.";
      renderTemplatesList();
    } catch (ex) {
      status.textContent = "Could not generate: " + (ex.message || ex);
    } finally {
      $("#flow-quick-generate-btn").disabled = false;
      $("#flow-custom-ai-btn").disabled = false;
    }
  }

  $("#flow-quick-generate-btn").addEventListener("click", () => {
    generateFlowFromAI({
      category: "general",
      angle: $("#flow-ai-angle").value.trim() ||
        "A general, patient follow-up sequence for a new lead who hasn't been contacted again since their first enquiry."
    });
  });

  $("#flow-custom-ai-btn").addEventListener("click", () => {
    const angle = $("#flow-ai-angle").value.trim();
    if (!angle) { $("#flow-ai-status").textContent = "Describe what this flow should accomplish first."; return; }
    generateFlowFromAI({ category: "general", angle });
  });

  $("#flow-save").addEventListener("click", async () => {
    const err = $("#flow-error");
    err.textContent = "";
    const name = $("#flow-name").value.trim();
    if (!name) { err.textContent = "Name is required."; return; }
    const graph = flowEditor.export();
    const nodes = Object.values(graph.drawflow.Home.data);
    if (nodes.some((n) => n.name === "send_email" && !n.data.template_id)) {
      err.textContent = "Every Send Email block needs a template selected.";
      return;
    }
    const id = $("#flow-editor").dataset.id;
    const payload = { name, active: $("#flow-active").checked, graph };
    const btn = $("#flow-save");
    btn.textContent = "Saving…";
    const q = id
      ? supabase.from("email_flows").update(payload).eq("id", id)
      : supabase.from("email_flows").insert(payload);
    const { error } = await q;
    btn.textContent = "Save flow";
    if (error) { err.textContent = error.message; return; }
    $("#flow-editor").hidden = true;
    await loadFlows();
  });

  /* Active enrollments: a read-only status list, since nothing here needs a
   * human click anymore — the cron engine (api/run-flows.js) does the
   * sending. This is purely for visibility into where each lead is. */
  const CANCEL_REASON_LABELS = {
    no_email: "lead has no email", opted_out: "lead opted out of email",
    no_template: "flow step has no template", template_missing: "template was deleted",
    flow_missing: "flow was deleted", lead_missing: "lead was deleted",
    send_failed_repeatedly: "email kept failing to send"
  };

  async function loadEnrollments() {
    const { data, error } = await supabase
      .from("lead_flow_enrollments")
      .select("*, lead:leads(name), flow:email_flows(name)")
      .order("enrolled_at", { ascending: false })
      .limit(50);
    if (error) { $("#enrollments-list").innerHTML = '<p class="dash-empty">Could not load: ' + esc(error.message) + "</p>"; return; }
    if (!data.length) { $("#enrollments-list").innerHTML = '<p class="dash-empty">No enrollments yet.</p>'; return; }
    $("#enrollments-list").innerHTML = data.map((en) => `
      <div class="dash-row">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(en.lead ? en.lead.name || "(no name)" : "(deleted lead)")}</span>
          <span class="dash-row__meta">${esc(en.flow ? en.flow.name : "(deleted flow)")} · ${esc(en.status)}${en.status === "active" ? " · next check " + new Date(en.next_check_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : ""}${en.status === "cancelled" && en.cancel_reason ? " · " + esc(CANCEL_REASON_LABELS[en.cancel_reason] || en.cancel_reason) : ""}</span>
        </div>
      </div>`).join("");
  }

  $("#enrollments-refresh-btn").addEventListener("click", loadEnrollments);

  /* ————— automation: email templates ————— */
  const TEMPLATE_CATEGORY_LABELS = { general: "General", buyer: "Buyer", seller: "Seller", investor: "Investor", "foreign-buyer": "Foreign buyer" };
  const TEMPLATE_VARIABLES = ["firstName", "intent", "districts", "budgetRange", "timeframe", "status", "listingTitle"];
  const TEMPLATE_PREVIEW_SAMPLE = {
    firstName: "Maria", intent: "Acquiring a residence", districts: "Makati, BGC",
    budgetRange: "₱150M – ₱400M", timeframe: "Within six months", status: "Viewing", listingTitle: "One Central Penthouse"
  };
  let templates = [];
  let templateFilter = "all";

  function substituteTemplateVars(text, values) {
    return String(text || "").replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
  }

  async function loadTemplates() {
    const { data, error } = await supabase.from("email_templates").select("*").order("created_at", { ascending: true });
    if (error) { $("#templates-list").innerHTML = '<p class="dash-empty">Could not load templates: ' + esc(error.message) + "</p>"; return; }
    templates = data;
    renderTemplatesList();
  }

  $("#template-filters").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tcategory]");
    if (!chip) return;
    $$("#template-filters .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
    chip.setAttribute("aria-pressed", "true");
    templateFilter = chip.dataset.tcategory;
    renderTemplatesList();
  });

  function renderTemplatesList() {
    const rows = templateFilter === "all" ? templates : templates.filter((t) => t.category === templateFilter);
    if (!rows.length) { $("#templates-list").innerHTML = '<p class="dash-empty">No templates here yet.</p>'; return; }
    $("#templates-list").innerHTML = rows.map((t) => `
      <div class="dash-row" data-id="${t.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(t.name)}</span>
          <span class="dash-row__meta">${esc(TEMPLATE_CATEGORY_LABELS[t.category] || t.category)}${t.subject ? " · " + esc(t.subject) : ""}</span>
          <span class="dash-row__spacer"></span>
          <button type="button" class="dash-linkbtn" data-edit-template>Edit</button>
          <button type="button" class="dash-linkbtn" data-del-template>Delete</button>
        </div>
      </div>`).join("");
  }

  $("#templates-list").addEventListener("click", async (e) => {
    const row = e.target.closest("[data-id]");
    if (!row) return;
    const t = templates.find((x) => x.id === row.dataset.id);
    if (!t) return;
    if (e.target.closest("[data-edit-template]")) openTemplateEditor(t);
    if (e.target.closest("[data-del-template]")) {
      if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
      const { error } = await supabase.from("email_templates").delete().eq("id", t.id);
      if (error) showToast("Could not delete: " + error.message, true);
      else loadTemplates();
    }
  });

  function renderTemplatePreview() {
    const form = $("#template-form");
    const get = (name) => form.elements[name].value;
    const subject = substituteTemplateVars(get("subject"), TEMPLATE_PREVIEW_SAMPLE);
    const heading = substituteTemplateVars(get("heading"), TEMPLATE_PREVIEW_SAMPLE);
    const body = substituteTemplateVars(get("body"), TEMPLATE_PREVIEW_SAMPLE);
    const buttonText = substituteTemplateVars(get("button_text"), TEMPLATE_PREVIEW_SAMPLE);
    $("#template-preview").innerHTML = `
      <div class="dash-preview-card">
        <p class="field__note">Subject: ${esc(subject) || "—"}</p>
        <h3 style="margin:var(--space-2) 0">${esc(heading) || "—"}</h3>
        ${body.split("\n\n").filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("") || "<p>—</p>"}
        ${buttonText ? `<p class="mt-4"><span class="btn btn--solid" style="pointer-events:none;display:inline-block">${esc(buttonText)}</span></p>` : ""}
      </div>`;
  }

  $("#template-form").addEventListener("input", (e) => {
    if (e.target.closest("[data-template-field]")) renderTemplatePreview();
  });

  $("#template-variable-chips").innerHTML = TEMPLATE_VARIABLES.map((v) => `<button type="button" class="chip" data-insert-var="${v}">{${v}}</button>`).join("");
  $("#template-variable-chips").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-insert-var]");
    if (!btn) return;
    const focused = document.activeElement;
    const target = focused && focused.closest("[data-template-field]") ? focused : $("#template-form [name=body]");
    const insert = "{" + btn.dataset.insertVar + "}";
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.value = target.value.slice(0, start) + insert + target.value.slice(end);
    target.focus();
    target.selectionStart = target.selectionEnd = start + insert.length;
    renderTemplatePreview();
  });

  function openTemplateEditor(t) {
    const form = $("#template-form");
    form.reset();
    $("#template-error").textContent = "";
    $("#template-ai-status").textContent = "";
    $("#template-ai-angle").value = "";
    form.elements.id.value = t ? t.id : "";
    form.elements.name.value = t ? t.name : "";
    form.elements.category.value = t ? t.category : "general";
    form.elements.subject.value = t ? t.subject || "" : "";
    form.elements.heading.value = t ? t.heading || "" : "";
    form.elements.body.value = t ? t.body || "" : "";
    form.elements.button_text.value = t ? t.button_text || "" : "";
    form.elements.button_url.value = t ? t.button_url || "" : "";
    form.elements.art_image_url.value = t ? t.art_image_url || "" : "";
    $("#template-editor-title").textContent = t ? "Edit template" : "New template";
    $("#template-editor").hidden = false;
    $("#template-editor").scrollIntoView({ behavior: "smooth", block: "start" });
    renderTemplatePreview();
  }

  $("#template-new-btn").addEventListener("click", () => openTemplateEditor(null));
  $("#template-editor-close").addEventListener("click", () => { $("#template-editor").hidden = true; });

  $("#template-ai-draft-btn").addEventListener("click", async () => {
    const form = $("#template-form");
    const name = form.elements.name.value.trim();
    const status = $("#template-ai-status");
    if (!name) { status.textContent = "Enter a name first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    const btn = $("#template-ai-draft-btn");
    btn.disabled = true;
    status.textContent = "Drafting…";
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const body = JSON.stringify({ name, category: form.elements.category.value, angle: $("#template-ai-angle").value.trim() });
      const r = await fetch(AGENT_URL + "/generate-email-template", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Draft failed");
      form.elements.subject.value = data.subject || "";
      form.elements.heading.value = data.heading || "";
      form.elements.body.value = data.body || "";
      form.elements.button_text.value = data.button_text || "";
      renderTemplatePreview();
      status.textContent = "Draft ready. Review and edit before saving.";
    } catch (ex) {
      status.textContent = "Could not draft: " + (ex.message || ex);
    } finally {
      btn.disabled = false;
    }
  });

  $("#template-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $("#template-error");
    err.textContent = "";
    const btn = $("#template-save");
    btn.textContent = "Saving…";
    try {
      const isEdit = !!form.elements.id.value;
      const payload = {
        name: form.elements.name.value.trim(),
        category: form.elements.category.value,
        subject: form.elements.subject.value.trim(),
        heading: form.elements.heading.value.trim(),
        body: form.elements.body.value.trim(),
        button_text: form.elements.button_text.value.trim() || null,
        button_url: form.elements.button_url.value.trim() || null,
        art_image_url: form.elements.art_image_url.value.trim() || null
      };
      const q = isEdit
        ? supabase.from("email_templates").update(payload).eq("id", form.elements.id.value)
        : supabase.from("email_templates").insert(payload);
      const { error } = await q;
      if (error) throw error;
      $("#template-editor").hidden = true;
      await loadTemplates();
    } catch (ex) {
      err.textContent = ex.message || "Could not save this template.";
    } finally {
      btn.textContent = "Save template";
    }
  });

  /* ————— listings ————— */
  let listings = [];

  async function loadListings() {
    const { data, error } = await supabase.from("listings").select("*").order("sort_order", { ascending: true });
    if (error) { $("#listings-list").innerHTML = '<p class="dash-empty">Could not load listings: ' + esc(error.message) + "</p>"; return; }
    listings = data;
    renderListings();
  }

  const LISTING_STATUS_LABELS = { sale: "For sale", lease: "For lease", investment: "Investment" };
  // listings.status is a text[] column, but tolerate a plain string too —
  // in case the array migration hasn't been run on this database yet.
  const statusArr = (s) => (Array.isArray(s) ? s : s ? [s] : []);

  function renderListings() {
    if (!listings.length) { $("#listings-list").innerHTML = '<p class="dash-empty">No listings yet. Add the first one.</p>'; return; }
    $("#listings-list").innerHTML = listings.map((l) => `
      <div class="dash-row" data-id="${l.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(l.title)}</span>
          <span class="dash-row__meta">${esc(l.price_display || "")} · ${esc(statusArr(l.status).map((s) => LISTING_STATUS_LABELS[s] || s).join(", "))}</span>
          <span class="dash-row__spacer"></span>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-pub ${l.published ? "checked" : ""}> Published</label>
          <label class="dash-switch" style="margin:0"><input type="checkbox" data-feat ${l.featured ? "checked" : ""}> Featured</label>
          <button class="dash-linkbtn" data-edit>Edit</button>
          <button class="dash-linkbtn" data-del>Delete</button>
        </div>
      </div>`).join("");
  }

  /* ————— developers ————— */
  let developers = [];

  async function loadDevelopers() {
    const { data, error } = await supabase.from("developers").select("*").order("sort_order", { ascending: true });
    if (error) return; // developers table may not exist yet until the migration runs — fail quiet
    developers = data;
    populateDeveloperPicker();
  }

  function populateDeveloperPicker() {
    const select = devForm.elements.developer_id;
    const current = select.value;
    select.innerHTML = '<option value="">— Select developer —</option>' +
      developers.map((dv) => `<option value="${dv.id}">${esc(dv.name)}</option>`).join("");
    select.value = current;
  }

  /* ————— developments ————— */
  let developments = [];

  async function loadDevelopments() {
    const { data, error } = await supabase.from("developments").select("*, developer:developers(name)").order("sort_order", { ascending: true });
    if (error) { $("#developments-list").innerHTML = '<p class="dash-empty">Could not load developments: ' + esc(error.message) + "</p>"; return; }
    developments = data;
    renderDevelopments();
    populateDevelopmentPicker();
  }

  const DEV_AVAILABILITY_LABELS = { "pre-selling": "Pre-selling", selling: "Selling", "sold-out": "Sold Out", rfo: "RFO" };
  function renderDevelopments() {
    if (!developments.length) { $("#developments-list").innerHTML = '<p class="dash-empty">No developments yet. Add the first one.</p>'; return; }
    $("#developments-list").innerHTML = developments.map((d) => `
      <div class="dash-row" data-id="${d.id}">
        <div class="dash-row__line">
          <span class="dash-row__name">${esc(d.name)}</span>
          <span class="dash-row__meta">${[esc((d.developer && d.developer.name) || d.developer_name || ""), esc(DEV_AVAILABILITY_LABELS[d.availability] || "Selling"), d.bespoke_path ? "Hand-built page " + esc(d.bespoke_path) : ""].filter(Boolean).join(" · ")}</span>
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
  $("#dev-new-developer-btn").addEventListener("click", async () => {
    const name = $("#dev-new-developer-name").value.trim();
    if (!name) return;
    const { data, error } = await supabase.from("developers").insert({ name, slug: slugify(name) }).select().single();
    if (error) { showToast("Could not add developer: " + error.message, true); return; }
    await loadDevelopers();
    devForm.elements.developer_id.value = data.id;
    $("#dev-new-developer-name").value = "";
  });

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
      ["title", "slug", "tag", "location_label", "meta_line", "price_display", "overview", "hero_image_url", "meta_description", "development_id"].forEach((k) => { form.elements[k].value = l[k] || ""; });
      $$('input[name="status"]', form).forEach((cb) => { cb.checked = statusArr(l.status).includes(cb.value); });
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

  /* A development with a hand-built page renders none of the generic page's
     content, so stop asking for it. Overview and Gallery are deliberately not
     in that block — unit listings fall back to them (js/listings.js). */
  function toggleGenericPageFields() {
    const block = $("#dev-generic-page-fields");
    if (block) block.hidden = !!devForm.elements.bespoke_path.value.trim();
  }

  /* Stored root-relative so the same value works as a browser href and as a
     middleware Location header — accept "edades-west" and fix it up. */
  function normalisePath(v) {
    const s = v.trim();
    if (!s) return null;
    return s.startsWith("/") || /^https?:\/\//i.test(s) ? s : "/" + s;
  }

  function openDevelopmentEditor(d) {
    devEditor.hidden = false;
    $("#dev-editor-title").textContent = d ? "Edit: " + d.name : "New development";
    devForm.reset();
    devForm.elements.id.value = d ? d.id : "";
    if (d) {
      ["name", "slug", "bespoke_path", "tagline", "location_label", "meta_line", "overview", "meta_description"].forEach((k) => { devForm.elements[k].value = d[k] || ""; });
      devForm.elements.developer_id.value = d.developer_id || "";
      $$('input[name="collections"]', devForm).forEach((cb) => { cb.checked = (d.collections || []).includes(cb.value); });
      devForm.elements.sort_order.value = d.sort_order;
      devForm.elements.availability.value = d.availability || "selling";
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
    toggleGenericPageFields();
    devForm.elements.hero_image_url.value = (d && d.hero_image_url) || "";
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
  devForm.elements.bespoke_path.addEventListener("input", toggleGenericPageFields);

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

  $("#dev-meta-ai-btn").addEventListener("click", async () => {
    const name = devForm.elements.name.value.trim();
    const status = $("#dev-meta-ai-status");
    if (!name) { status.textContent = "Enter a name first."; return; }
    if (!AGENT_URL) { status.textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
    status.textContent = "Drafting…";
    $("#dev-meta-ai-btn").disabled = true;
    try {
      const headers = { "Content-Type": "application/json", ...(await listingAuthHeader()) };
      const dev = developers.find((d) => d.id === devForm.elements.developer_id.value);
      const body = JSON.stringify({
        name,
        developer_name: dev ? dev.name : "",
        tagline: devForm.elements.tagline.value.trim(),
        location_label: devForm.elements.location_label.value.trim(),
        overview: devForm.elements.overview.value.trim(),
        amenities_text: devForm.elements.amenities_text.value
      });
      const r = await fetch(AGENT_URL + "/generate-development-meta", { method: "POST", headers, body });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Draft failed");
      devForm.elements.meta_description.value = data.meta_description || "";
      updateDevMetaCount();
      status.textContent = "Draft ready. Review below, then save.";
    } catch (ex) {
      status.textContent = "Could not draft: " + (ex.message || ex);
    } finally {
      $("#dev-meta-ai-btn").disabled = false;
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
      if (data.developer_name) {
        const match = developers.find((dv) => dv.name.toLowerCase() === data.developer_name.toLowerCase());
        if (match) devForm.elements.developer_id.value = match.id;
        else $("#dev-new-developer-name").value = data.developer_name;
      }
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
      const statusValues = $$('input[name="status"]:checked', form).map((c) => c.value);
      if (!statusValues.length) throw new Error("Select at least one availability option.");
      const isEdit = !!form.elements.id.value;
      const payload = {
        title: form.elements.title.value.trim(),
        status: statusValues,
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
      payload.slug = slugify(form.elements.slug.value.trim() || payload.title);
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
        developer_id: devForm.elements.developer_id.value || null,
        collections: $$('input[name="collections"]:checked', devForm).map((c) => c.value),
        tagline: devForm.elements.tagline.value.trim() || null,
        location_label: devForm.elements.location_label.value.trim() || null,
        meta_line: devForm.elements.meta_line.value.trim() || null,
        bespoke_path: normalisePath(devForm.elements.bespoke_path.value),
        overview: devForm.elements.overview.value.trim() || null,
        meta_description: devForm.elements.meta_description.value.trim() || null,
        hero_image_url: devForm.elements.hero_image_url.value || null,
        gallery_images: devGalleryImages,
        amenities: devForm.elements.amenities_text.value.split("\n").map((s) => s.trim()).filter(Boolean),
        availability: devForm.elements.availability.value,
        sort_order: Number(devForm.elements.sort_order.value) || 100,
        published: devForm.elements.published.checked,
        featured: devForm.elements.featured.checked,
        location_features: devLocationPicker.featuresFromForm()
      };
      payload.map_lat = devForm.elements.map_lat.value !== "" ? Number(devForm.elements.map_lat.value) : null;
      payload.map_lng = devForm.elements.map_lng.value !== "" ? Number(devForm.elements.map_lng.value) : null;
      payload.slug = slugify(devForm.elements.slug.value.trim() || payload.name);
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

  /* ————— inbox (Resend inbound + one-off outbound) ————— */
  let inboxRows = [];
  let inboxFolder = "inbox";
  let inboxQuery = "";
  let inboxSelected = null;
  let inboxReplyTo = null;
  let organizeReady = true; // false until migration-email-organize.sql has been run
  const inboxChecked = new Set();

  const INBOX_STATUS_LABELS = { SENT: "Sent", DELIVERED: "Delivered", BOUNCED: "Bounced", RECEIVED: "Received", FAILED: "Failed" };
  const bareAddress = (v) => { const m = String(v || "").match(/<([^>]+)>/); return (m ? m[1] : String(v || "")).trim(); };
  const BASE_COLUMNS = "id,direction,from_address,to_address,subject,status,created_at";
  const IN_FOLDER = {
    inbox: (r) => !r.deleted_at && r.direction === "INBOUND" && !r.is_archived,
    sent: (r) => !r.deleted_at && r.direction === "OUTBOUND",
    starred: (r) => !r.deleted_at && r.is_starred,
    archive: (r) => !r.deleted_at && r.is_archived,
    trash: (r) => !!r.deleted_at,
    all: (r) => !r.deleted_at
  };
  const isUnread = (r) => r.direction === "INBOUND" && !r.is_read;
  const FOLDER_EMPTY = { inbox: "Your inbox is empty.", sent: "Nothing sent yet.", starred: "No starred messages.", archive: "Nothing archived.", trash: "Trash is empty.", all: "No messages yet." };

  async function loadInbox() {
    // Bodies are fetched only when a message is opened. If the organize migration hasn't been
    // run yet, fall back to the basic columns so the inbox still works.
    let { data, error } = await supabase.from("email_messages")
      .select(BASE_COLUMNS + ",is_read,is_starred,is_archived,deleted_at")
      .order("created_at", { ascending: false }).limit(500);
    organizeReady = true;
    if (error && /column|42703|does not exist/i.test((error.code || "") + " " + (error.message || ""))) {
      organizeReady = false;
      ({ data, error } = await supabase.from("email_messages").select(BASE_COLUMNS)
        .order("created_at", { ascending: false }).limit(500));
    }
    if (error) { $("#inbox-list").innerHTML = `<p class="dash-empty">Could not load messages: ${esc(error.message)}</p>`; return; }
    inboxRows = data || [];
    if (!organizeReady && !["inbox", "sent", "all"].includes(inboxFolder)) inboxFolder = "inbox";
    applyOrganizeAvailability();
    renderInboxList();
  }

  function applyOrganizeAvailability() {
    $$("[data-organize]").forEach((el) => { el.hidden = !organizeReady; });
    $("#inbox-organize-note").hidden = organizeReady;
    $$("[data-inbox-folder]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.inboxFolder === inboxFolder)));
  }

  function updateUnreadBadges() {
    const n = organizeReady ? inboxRows.filter((r) => IN_FOLDER.inbox(r) && isUnread(r)).length : 0;
    ["#inbox-unread-badge", "#nav-inbox-badge"].forEach((sel) => {
      const el = $(sel);
      el.hidden = !n;
      el.textContent = n > 99 ? "99+" : String(n);
    });
  }

  function visibleInboxRows() {
    const q = inboxQuery.trim().toLowerCase();
    return inboxRows.filter((r) => IN_FOLDER[inboxFolder](r) &&
      (!q || [r.from_address, r.to_address, r.subject].some((v) => String(v || "").toLowerCase().includes(q))));
  }

  function renderInboxList() {
    const rows = visibleInboxRows();
    [...inboxChecked].forEach((id) => { if (!rows.some((r) => r.id === id)) inboxChecked.delete(id); });
    $("#inbox-list").innerHTML = rows.length
      ? rows.map((r) => {
          const who = r.direction === "INBOUND" ? r.from_address : "To: " + r.to_address;
          const organize = organizeReady
            ? `<input type="checkbox" class="inbox-check" data-inbox-check aria-label="Select message" ${inboxChecked.has(r.id) ? "checked" : ""}>
               <button type="button" class="inbox-star" data-inbox-star aria-pressed="${!!r.is_starred}" aria-label="${r.is_starred ? "Unstar" : "Star"}">${r.is_starred ? "★" : "☆"}</button>`
            : `<span></span><span></span>`;
          return `<div class="inbox-item${isUnread(r) ? " is-unread" : ""}" data-inbox-row="${esc(r.id)}" aria-current="${r.id === inboxSelected}">
            ${organize}
            <button type="button" class="inbox-open" data-inbox-id="${esc(r.id)}">
              <div class="inbox-item__top"><span class="dash-row__name">${esc(who)}</span><span class="dash-row__meta">${esc(new Date(r.created_at).toLocaleString())}</span></div>
              <div class="inbox-item__subject">${esc(r.subject || "(no subject)")}</div>
              <span class="dash-status">${esc(r.direction === "INBOUND" ? "Inbound" : "Outbound")} · ${esc(INBOX_STATUS_LABELS[r.status] || r.status)}</span>
            </button>
          </div>`;
        }).join("")
      : `<p class="dash-empty">${esc(inboxQuery.trim() ? "No messages match your search." : FOLDER_EMPTY[inboxFolder])}</p>`;
    if (inboxRows.length >= 500) $("#inbox-list").insertAdjacentHTML("beforeend", '<p class="field__note">Showing the latest 500 messages.</p>');
    updateUnreadBadges();
    renderBulkBar(rows);
  }

  /* — organize actions — */
  const chunk = (ids, n) => { const out = []; for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n)); return out; };

  async function updateMessages(ids, patch) {
    for (const part of chunk(ids, 50)) {
      const { error } = await supabase.from("email_messages").update(patch).in("id", part);
      if (error) { showToast("Could not update: " + error.message, true); return false; }
    }
    inboxRows.forEach((r) => { if (ids.includes(r.id)) Object.assign(r, patch); });
    return true;
  }

  async function deleteForever(ids) {
    for (const part of chunk(ids, 50)) {
      const { error } = await supabase.from("email_messages").delete().in("id", part);
      if (error) { showToast("Could not delete: " + error.message, true); return false; }
    }
    inboxRows = inboxRows.filter((r) => !ids.includes(r.id));
    return true;
  }

  // Run one action on a set of message ids, then refresh the list and the open message.
  async function runInboxAction(action, ids) {
    if (!ids.length || !organizeReady) return;
    const now = new Date().toISOString();
    let ok = false;
    if (action === "archive") ok = await updateMessages(ids, { is_archived: true });
    else if (action === "unarchive") ok = await updateMessages(ids, { is_archived: false });
    else if (action === "read") ok = await updateMessages(ids, { is_read: true });
    else if (action === "unread") ok = await updateMessages(ids, { is_read: false });
    else if (action === "star") ok = await updateMessages(ids, { is_starred: true });
    else if (action === "unstar") ok = await updateMessages(ids, { is_starred: false });
    else if (action === "trash") ok = await updateMessages(ids, { deleted_at: now });
    else if (action === "restore") ok = await updateMessages(ids, { deleted_at: null });
    else if (action === "forever") {
      if (!confirm(`Permanently delete ${ids.length === 1 ? "this message" : ids.length + " messages"}? This cannot be undone.`)) return;
      ok = await deleteForever(ids);
    }
    if (!ok) return;
    ids.forEach((id) => inboxChecked.delete(id));
    const msgs = { trash: "Moved to Trash", restore: "Restored", forever: "Deleted forever", archive: "Archived", unarchive: "Moved to Inbox" };
    if (msgs[action]) showToast(msgs[action] + (ids.length > 1 ? ` (${ids.length})` : ""));
    // Close the open message if it just left this folder.
    const open = inboxRows.find((r) => r.id === inboxSelected);
    if (inboxSelected && (!open || !IN_FOLDER[inboxFolder](open))) closeInboxDetail();
    else if (open) renderDetailActions(open);
    renderInboxList();
  }

  function actionButtons(r, extra) {
    const b = (action, label) => `<button type="button" class="btn" data-inbox-action="${action}">${label}</button>`;
    if (extra.trash) return b("restore", "Restore") + b("forever", "Delete forever");
    return [r.is_archived ? b("unarchive", "Move to inbox") : b("archive", "Archive"), b("trash", "Delete")].join("");
  }

  function renderBulkBar(rows) {
    const box = $("#inbox-bulk-actions");
    const n = inboxChecked.size;
    $("#inbox-select-all").checked = rows.length > 0 && rows.every((r) => inboxChecked.has(r.id));
    const b = (action, label) => `<button type="button" class="btn" data-bulk-action="${action}">${label}</button>`;
    if (inboxFolder === "trash") {
      box.innerHTML = (n ? b("restore", `Restore (${n})`) + b("forever", `Delete forever (${n})`) : "") + (rows.length ? b("empty", "Empty trash") : "");
    } else {
      box.innerHTML = n
        ? b("archive", "Archive") + b("unarchive", "Move to inbox") + b("read", "Mark read") + b("unread", "Mark unread") + b("star", "Star") + b("trash", `Delete (${n})`)
        : "";
    }
  }

  function renderDetailActions(msg) {
    const box = $("#inbox-detail-actions");
    if (!organizeReady) { box.innerHTML = ""; return; }
    const trashed = !!msg.deleted_at;
    box.innerHTML = trashed
      ? actionButtons(msg, { trash: true })
      : `<button type="button" class="btn" data-inbox-action="${msg.is_starred ? "unstar" : "star"}">${msg.is_starred ? "★ Starred" : "☆ Star"}</button>` +
        actionButtons(msg, {}) +
        (msg.direction === "INBOUND" ? '<button type="button" class="btn" data-inbox-action="unread">Mark unread</button>' : "");
  }

  function closeInboxDetail() {
    inboxSelected = null;
    inboxReplyTo = null;
    $("#inbox-detail").hidden = true;
    $("#inbox-placeholder").hidden = false;
  }

  // Email HTML is untrusted: a sandboxed iframe with no allow-scripts and no
  // allow-same-origin (so it can't touch this page or its Supabase session),
  // plus a CSP that blocks scripts/forms/frames even if the sandbox were dropped.
  function renderEmailBody(container, msg) {
    container.replaceChildren();
    if (!msg.html_body) {
      const pre = document.createElement("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.textContent = msg.text_body || "(empty message)";
      container.appendChild(pre);
      return;
    }
    const frame = document.createElement("iframe");
    frame.className = "inbox-frame";
    frame.title = "Email content";
    frame.setAttribute("sandbox", "allow-popups");
    frame.setAttribute("referrerpolicy", "no-referrer");
    frame.srcdoc =
      '<!doctype html><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'">' +
      '<base target="_blank">' +
      '<style>body{font:14px/1.5 system-ui,sans-serif;color:#222;margin:12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>' +
      msg.html_body;
    container.appendChild(frame);
  }

  async function openInboxMessage(id) {
    inboxSelected = id;
    renderInboxList();
    const { data: msg, error } = await supabase.from("email_messages").select("*").eq("id", id).single();
    if (error || !msg) { showToast("Could not open message", true); return; }
    inboxReplyTo = msg;
    if (organizeReady && msg.direction === "INBOUND" && !msg.is_read) {
      // Opening a message marks it read (quietly; the list re-renders below).
      supabase.from("email_messages").update({ is_read: true }).eq("id", id).then(() => {});
      const row = inboxRows.find((r) => r.id === id);
      if (row) row.is_read = true;
      msg.is_read = true;
      renderInboxList();
    }
    renderDetailActions(msg);
    $("#inbox-placeholder").hidden = true;
    $("#inbox-compose").hidden = true;
    $("#inbox-detail").hidden = false;
    $("#inbox-detail-subject").textContent = msg.subject || "(no subject)";
    const meta = $("#inbox-detail-meta");
    meta.replaceChildren();
    [["From", msg.from_address], ["To", msg.to_address], ["Date", new Date(msg.created_at).toLocaleString()],
     ["Status", INBOX_STATUS_LABELS[msg.status] || msg.status]].forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      meta.append(dt, dd);
    });
    renderEmailBody($("#inbox-detail-body"), msg);
  }

  function openCompose(reply) {
    $("#inbox-placeholder").hidden = true;
    $("#inbox-detail").hidden = true;
    $("#inbox-compose").hidden = false;
    const f = $("#inbox-compose-form");
    f.reset();
    syncSignatureField();
    f.dataset.parentMessageId = "";
    setComposeMode("text");
    $("#inbox-html-code").hidden = true;
    $("#inbox-html-toggle").textContent = "Edit HTML code";
    $("#inbox-html-toggle").setAttribute("aria-expanded", "false");
    $("#inbox-gen-status").textContent = "";
    $("#inbox-compose-error").textContent = "";
    $("#inbox-compose-title").textContent = reply ? "Reply" : "New message";
    if (reply) {
      // Reply to the other party: the sender of an inbound message, the recipient of an outbound one.
      f.to.value = reply.direction === "INBOUND" ? bareAddress(reply.from_address) : bareAddress(reply.to_address);
      f.subject.value = /^re:/i.test(reply.subject || "") ? reply.subject : "Re: " + (reply.subject || "");
      f.dataset.parentMessageId = reply.message_id || "";
      f.body.focus();
    } else {
      f.to.focus();
    }
  }

  // The plain-text compose box takes light markup (**bold**, *italic*, [text](url),
  // "- " / "1. " lists, "# " heading); convert to real HTML here so the owner never
  // authors raw markup. Everything is HTML-escaped first, and only http(s)/mailto
  // links are allowed, so nothing typed can inject tags or scripts.
  function inlineFormat(text) {
    return esc(text)
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  }
  function plainTextToHtml(text) {
    return String(text || "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^[-*] /.test(l))) return "<ul>" + lines.map((l) => "<li>" + inlineFormat(l.slice(2)) + "</li>").join("") + "</ul>";
      if (lines.every((l) => /^\d+\. /.test(l))) return "<ol>" + lines.map((l) => "<li>" + inlineFormat(l.replace(/^\d+\. /, "")) + "</li>").join("") + "</ol>";
      if (/^#{1,3} /.test(block) && lines.length === 1) return "<h2>" + inlineFormat(block.replace(/^#{1,3} /, "")) + "</h2>";
      return "<p>" + lines.map(inlineFormat).join("<br>") + "</p>";
    }).join("");
  }

  /* Signature: one saved block (site_settings.email_signature), appended to every
   * message when "Include signature" is on. Same light markup as the message body. */
  let signatureText = "";
  async function loadSignature() {
    const { data } = await supabase.from("site_settings").select("value").eq("key", "email_signature").maybeSingle();
    signatureText = (data && data.value && data.value.text) || "";
    syncSignatureField();
  }
  function syncSignatureField() { $("#inbox-sig-text").value = signatureText; }
  function signatureHtml() {
    if (!$("#inbox-sig-on").checked || !signatureText.trim()) return "";
    return '<div style="margin-top:24px;color:#555">' + plainTextToHtml(signatureText) + "</div>";
  }
  // In HTML mode the body may be a full document. The generated shell marks where the
  // signature belongs (inside the card); otherwise it goes before </body>, or at the end.
  function withSignature(bodyHtml) {
    const sig = signatureHtml();
    if (bodyHtml.includes(EMAIL_SIGNATURE_MARKER)) return bodyHtml.replace(EMAIL_SIGNATURE_MARKER, sig);
    if (!sig) return bodyHtml;
    const i = bodyHtml.toLowerCase().lastIndexOf("</body>");
    return i === -1 ? bodyHtml + sig : bodyHtml.slice(0, i) + sig + bodyHtml.slice(i);
  }

  // Formatting toolbar: wraps the selection (or inserts a placeholder) in the textarea.
  function applyFormat(kind) {
    const ta = $("#inbox-body");
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b);
    let out, from, to;
    const wrap = (mark, ph) => { const t = sel || ph; out = mark + t + mark; from = a + mark.length; to = from + t.length; };
    if (kind === "bold") wrap("**", "bold text");
    else if (kind === "italic") wrap("*", "italic text");
    else if (kind === "link") {
      const url = prompt("Link address (https://…)", "https://");
      if (!url || !/^(https?:\/\/|mailto:)/.test(url.trim())) return;
      const label = sel || "link text";
      out = `[${label}](${url.trim()})`; from = a + 1; to = from + label.length;
    } else {
      const prefix = kind === "heading" ? "# " : null;
      const text = sel || (kind === "heading" ? "Heading" : "Item");
      const lines = text.split("\n").map((l, i) => (prefix || (kind === "ol" ? `${i + 1}. ` : "- ")) + l);
      const lead = a > 0 && value[a - 1] !== "\n" ? "\n\n" : "";
      out = lead + lines.join("\n"); from = a + lead.length; to = a + out.length;
    }
    ta.setRangeText(out, a, b, "end");
    ta.focus();
    ta.setSelectionRange(from, to);
    renderComposePreview();
  }

  /* HTML compose mode: a template or an AI draft becomes editable HTML with a live preview. */
  function setComposeMode(mode) {
    $("#inbox-compose-form").dataset.mode = mode;
    $$("[data-compose-mode]").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.composeMode === mode)));
    $("#inbox-mode-text").hidden = mode !== "text";
    $("#inbox-mode-html").hidden = mode !== "html";
    if (mode === "html") populateComposeTemplates();
    renderComposePreview();
  }

  function populateComposeTemplates() {
    const select = $("#inbox-template");
    const current = select.value;
    select.innerHTML = '<option value="">Choose a template…</option>' +
      templates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("");
    select.value = current;
  }

  // Merge values for the lead whose email matches the To address; falls back to
  // the same defaults api/run-flows.js uses (firstName -> "there", rest blank).
  function composeMergeValues(toAddress) {
    const lead = leads.find((l) => l.email && l.email.toLowerCase() === toAddress.trim().toLowerCase()) || {};
    return {
      firstName: (lead.name || "").trim().split(/\s+/)[0] || "there",
      intent: lead.intent || "", districts: lead.districts || "", budgetRange: lead.budget_range || "",
      timeframe: lead.timeframe || "", status: lead.status || "", listingTitle: ""
    };
  }

  // Branded email shell for the HTML generator (table layout, inline styles, web-safe fonts so
  // it renders in Gmail/Outlook/Apple Mail). Colours are the site palette (DESIGN.md): ink navy
  // type and button, warm paper card on a parchment page, one short brass rule as the only accent.
  // Square corners, no gradients. Flow emails sent by api/run-flows.js still use a plainer layout.
  const EMAIL_LOGO_URL = "https://www.propertiesbychel.com/images/logo-navy.png";
  const EMAIL_SIGNATURE_MARKER = "<!--signature-->";
  function renderTemplateHtml(t, values) {
    const sub = (v) => substituteTemplateVars(v, values);
    const serif = "Georgia,'Times New Roman',serif";
    const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
    const paragraphs = sub(t.body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p style="margin:0 0 16px;">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    const heading = sub(t.heading).trim();
    const buttonText = sub(t.button_text).trim();
    const image = t.art_image_url
      ? `<tr><td style="padding:24px 0 0;"><img src="${esc(t.art_image_url)}" alt="" width="600" style="display:block;width:100%;height:auto;border:0;"></td></tr>`
      : "";
    const headingRow = heading
      ? `<tr><td style="padding:28px 32px 4px;font-family:${serif};font-size:26px;line-height:1.25;font-weight:normal;color:#152B5A;">${esc(heading)}</td></tr>`
      : "";
    const button = buttonText && t.button_url
      ? `<tr><td style="padding:8px 32px 8px;"><a href="${esc(t.button_url)}" style="display:inline-block;padding:14px 30px;background:#152B5A;color:#F9F6F2;font-family:${sans};font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;">${esc(buttonText)}</a></td></tr>`
      : "";
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(sub(t.subject || heading))}</title></head>
<body style="margin:0;padding:0;background:#F3F0E9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F0E9;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#F9F6F2;">
<tr><td style="padding:28px 32px 0;"><img src="${EMAIL_LOGO_URL}" alt="Properties by Chel" width="94" height="44" style="display:block;border:0;height:44px;width:auto;"></td></tr>
<tr><td style="padding:18px 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="48" height="2" style="width:48px;height:2px;line-height:2px;font-size:2px;background:#D3B037;">&nbsp;</td></tr></table></td></tr>
${image}
${headingRow}
<tr><td style="padding:12px 32px 8px;font-family:${sans};font-size:16px;line-height:1.7;color:#505357;">${paragraphs}${EMAIL_SIGNATURE_MARKER}</td></tr>
${button}
<tr><td style="padding:28px 32px 28px;font-family:${sans};font-size:12px;line-height:1.6;color:#787A7E;">Properties by Chel &middot; Private Real Estate Advisory, Philippines</td></tr>
</table>
</td></tr></table>
</body></html>`;
  }

  function useGeneratedEmail(t) {
    const f = $("#inbox-compose-form");
    const values = composeMergeValues(f.to.value);
    if (t.subject) f.subject.value = substituteTemplateVars(t.subject, values);
    f.html.value = renderTemplateHtml(t, values);
    renderComposePreview();
  }

  let composePreviewTimer = null;
  function renderComposePreview() {
    clearTimeout(composePreviewTimer);
    composePreviewTimer = setTimeout(() => {
      const htmlMode = $("#inbox-compose-form").dataset.mode === "html";
      const raw = htmlMode ? $("#inbox-html").value : plainTextToHtml($("#inbox-body").value);
      const html = raw.trim() ? withSignature(raw) : "";
      const box = htmlMode ? $("#inbox-html-preview") : $("#inbox-text-preview");
      if (!html.trim()) {
        box.innerHTML = '<p class="dash-empty">' + (htmlMode ? "Pick a template or draft with AI above, and the email appears here." : "Nothing to preview yet.") + "</p>";
        return;
      }
      renderEmailBody(box, { html_body: html });
    }, 200);
  }

  $$("[data-compose-mode]").forEach((chip) => chip.addEventListener("click", () => setComposeMode(chip.dataset.composeMode)));
  $("#inbox-html").addEventListener("input", renderComposePreview);
  $("#inbox-html-toggle").addEventListener("click", () => {
    const code = $("#inbox-html-code");
    code.hidden = !code.hidden;
    $("#inbox-html-toggle").textContent = code.hidden ? "Edit HTML code" : "Hide HTML code";
    $("#inbox-html-toggle").setAttribute("aria-expanded", String(!code.hidden));
    if (!code.hidden) $("#inbox-html").focus();
  });
  $("#inbox-body").addEventListener("input", renderComposePreview);
  $("#inbox-sig-on").addEventListener("change", renderComposePreview);
  $("#inbox-sig-edit").addEventListener("click", () => { const ed = $("#inbox-sig-editor"); ed.hidden = !ed.hidden; });
  $("#inbox-sig-text").addEventListener("input", (e) => { signatureText = e.target.value; renderComposePreview(); });
  $("#inbox-sig-save").addEventListener("click", async () => {
    const status = $("#inbox-sig-status");
    status.textContent = "Saving…";
    const { error } = await supabase.from("site_settings").upsert({ key: "email_signature", value: { text: signatureText } });
    status.textContent = error ? "Could not save: " + error.message : "Saved.";
  });
  $$("[data-fmt]").forEach((btn) => btn.addEventListener("click", () => applyFormat(btn.dataset.fmt)));
  $("#inbox-body").addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const kind = { b: "bold", i: "italic", k: "link" }[e.key.toLowerCase()];
    if (kind) { e.preventDefault(); applyFormat(kind); }
  });
  $("#inbox-template").addEventListener("change", (e) => {
    const t = templates.find((x) => x.id === e.target.value);
    if (t) { useGeneratedEmail(t); $("#inbox-gen-status").textContent = `Loaded "${t.name}". Edit the HTML below if you like.`; }
  });
  $("#inbox-ai-btn").addEventListener("click", async () => {
    const status = $("#inbox-gen-status");
    const brief = $("#inbox-ai-brief").value.trim();
    if (!brief) { status.textContent = "Describe what the email should say first."; return; }
    if (!AGENT_URL) { status.textContent = "The AI agent isn't configured."; return; }
    const btn = $("#inbox-ai-btn");
    btn.disabled = true;
    status.textContent = "Drafting…";
    try {
      const r = await fetch(AGENT_URL + "/generate-email-template", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await listingAuthHeader()) },
        body: JSON.stringify({ name: "Dashboard email", category: "general", angle: brief })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Draft failed");
      useGeneratedEmail({ ...data, button_url: $("#inbox-ai-link").value.trim() });
      status.textContent = "Draft ready. Review and edit before sending.";
    } catch (ex) {
      status.textContent = "Could not draft: " + (ex.message || ex);
    } finally {
      btn.disabled = false;
    }
  });

  $$("[data-inbox-folder]").forEach((chip) => {
    chip.addEventListener("click", () => {
      inboxFolder = chip.dataset.inboxFolder;
      inboxChecked.clear();
      $$("[data-inbox-folder]").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      const open = inboxRows.find((r) => r.id === inboxSelected);
      if (inboxSelected && (!open || !IN_FOLDER[inboxFolder](open))) closeInboxDetail();
      renderInboxList();
    });
  });
  $("#inbox-search").addEventListener("input", (e) => { inboxQuery = e.target.value; renderInboxList(); });
  $("#inbox-select-all").addEventListener("change", (e) => {
    visibleInboxRows().forEach((r) => (e.target.checked ? inboxChecked.add(r.id) : inboxChecked.delete(r.id)));
    renderInboxList();
  });
  $("#inbox-bulk-actions").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-bulk-action]");
    if (!btn) return;
    if (btn.dataset.bulkAction === "empty") {
      const ids = inboxRows.filter((r) => r.deleted_at).map((r) => r.id);
      await runInboxAction("forever", ids);
    } else {
      await runInboxAction(btn.dataset.bulkAction, [...inboxChecked]);
    }
  });
  $("#inbox-detail-actions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-inbox-action]");
    if (btn && inboxSelected) runInboxAction(btn.dataset.inboxAction, [inboxSelected]);
  });
  $("#inbox-list").addEventListener("click", (e) => {
    const row = e.target.closest("[data-inbox-row]");
    if (!row) return;
    const id = row.dataset.inboxRow;
    if (e.target.closest("[data-inbox-star]")) {
      const r = inboxRows.find((x) => x.id === id);
      if (r) runInboxAction(r.is_starred ? "unstar" : "star", [id]);
    } else if (e.target.closest("[data-inbox-check]")) {
      if (e.target.checked) inboxChecked.add(id); else inboxChecked.delete(id);
      renderBulkBar(visibleInboxRows());
    } else if (e.target.closest("[data-inbox-id]")) {
      openInboxMessage(id);
    }
  });
  $("#inbox-compose-btn").addEventListener("click", () => openCompose(null));
  $("#inbox-reply-btn").addEventListener("click", () => { if (inboxReplyTo) openCompose(inboxReplyTo); });
  $("#inbox-compose-cancel").addEventListener("click", () => {
    $("#inbox-compose").hidden = true;
    $("#inbox-placeholder").hidden = false;
  });
  $("#inbox-compose-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = $("#inbox-compose-error");
    const btn = $("#inbox-send-btn");
    err.textContent = "";
    const to = f.to.value.trim();
    const subject = f.subject.value.trim();
    const htmlMode = f.dataset.mode === "html";
    const text = htmlMode ? f.html.value.trim() : f.body.value.trim();
    if (!to || !subject || !text) { err.textContent = "Recipient, subject and message are all required."; return; }
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const res = await fetch("/api/dashboard/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await listingAuthHeader()) },
        body: JSON.stringify({
          to, subject,
          // HTML mode sends the markup as-is; plain mode converts the light markup first.
          // Either way the server derives the plain-text part.
          htmlBody: withSignature(htmlMode ? text : plainTextToHtml(text)),
          parentMessageId: f.dataset.parentMessageId || undefined
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Send failed");
      showToast(out.warning || "Sent");
      f.reset();
      syncSignatureField();
      $("#inbox-compose").hidden = true;
      $("#inbox-placeholder").hidden = false;
      loadInbox();
    } catch (ex) {
      err.textContent = ex.message || "Send failed";
    } finally {
      btn.disabled = false;
      btn.textContent = "Send";
    }
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
