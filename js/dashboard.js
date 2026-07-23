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
    loadListings();
    loadPhotos();
    if (window.DashboardContent) window.DashboardContent.init(supabase, { $, $$, esc, uploadPhoto });
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
        <div class="dash-funnel__bar-track"><div class="dash-funnel__bar" style="width:${Math.round((statusCounts[i] / maxCount) * 100)}%"></div></div>
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
    if (error) { alert("Could not update status: " + error.message); return false; }
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
        <dd><textarea class="dash-note-field" data-note placeholder="Private notes — viewing feedback, next steps…">${esc(l.owner_notes || "")}</textarea>
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
    btn.textContent = error ? "Failed — retry" : "Saved";
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
    if (!listings.length) { $("#listings-list").innerHTML = '<p class="dash-empty">No listings yet — add the first one.</p>'; return; }
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

  const editor = $("#listing-editor");
  const form = $("#listing-form");
  let galleryImages = [];

  $("#listing-new-btn").addEventListener("click", () => openEditor(null));
  $("#editor-close").addEventListener("click", () => { editor.hidden = true; });

  function renderGalleryGrid() {
    $("#listing-gallery-grid").innerHTML = galleryImages.map((g, i) => `
      <div class="dash-gallery-item">
        <img src="${esc(g.url)}" alt="">
        <button type="button" class="dash-linkbtn" data-remove-gallery="${i}">Remove</button>
      </div>`).join("");
  }

  function openEditor(l) {
    editor.hidden = false;
    $("#editor-title").textContent = l ? "Edit — " + l.title : "New listing";
    form.reset();
    form.elements.id.value = l ? l.id : "";
    if (l) {
      ["title", "tag", "location_label", "meta_line", "price_display", "overview", "hero_image_url"].forEach((k) => { form.elements[k].value = l[k] || ""; });
      form.elements.status.value = l.status;
      form.elements.aspect.value = l.aspect || "4/3";
      form.elements.sort_order.value = l.sort_order;
      form.elements.published.checked = l.published;
      form.elements.featured.checked = l.featured;
      $$('input[name="collections"]', form).forEach((cb) => { cb.checked = (l.collections || []).includes(cb.value); });
    }
    const prev = $("#listing-photo-preview");
    prev.hidden = !(l && l.hero_image_url);
    if (l && l.hero_image_url) prev.src = l.hero_image_url;
    galleryImages = l && Array.isArray(l.gallery_images) ? l.gallery_images.slice() : [];
    renderGalleryGrid();
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#listing-photo").addEventListener("change", () => {
    const f = $("#listing-photo").files[0];
    if (!f) return;
    const prev = $("#listing-photo-preview");
    prev.src = URL.createObjectURL(f);
    prev.hidden = false;
  });

  $("#listing-gallery-input").addEventListener("change", async () => {
    const files = Array.from($("#listing-gallery-input").files);
    if (!files.length) return;
    for (const f of files) {
      try {
        const url = await uploadPhoto(f, "listings-gallery");
        galleryImages.push({ url, alt: "" });
      } catch (ex) {
        alert("Could not upload one of the photos: " + (ex.message || ex));
      }
    }
    $("#listing-gallery-input").value = "";
    renderGalleryGrid();
  });

  $("#listing-gallery-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove-gallery]");
    if (!btn) return;
    galleryImages.splice(Number(btn.dataset.removeGallery), 1);
    renderGalleryGrid();
  });

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
      if (photoFile) form.elements.hero_image_url.value = await uploadPhoto(photoFile, "listings");
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
        hero_image_url: form.elements.hero_image_url.value || null,
        gallery_images: galleryImages,
        aspect: form.elements.aspect.value,
        sort_order: Number(form.elements.sort_order.value) || 100,
        published: form.elements.published.checked,
        featured: form.elements.featured.checked
      };
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
      if (error) alert("Could not delete: " + error.message);
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
    if (error) { alert("Could not update: " + error.message); loadListings(); }
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
        note.textContent = "Saved — the site now uses the new photo.";
      } catch (ex) {
        note.textContent = "Upload failed: " + (ex.message || ex);
      } finally {
        btn.textContent = "Upload & use";
      }
    });
  });
}
