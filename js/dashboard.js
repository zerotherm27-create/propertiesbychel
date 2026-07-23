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

  const { data: { session } } = await supabase.auth.getSession();
  if (session) enter(); else show("auth");

  /* ————— app ————— */
  function enter() {
    show("app");
    loadLeads();
    loadListings();
    loadPhotos();
  }

  /* tabs */
  $$(".dash-tabs .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".dash-tabs .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      ["leads", "listings", "photos"].forEach((t) => { $("#tab-" + t).hidden = t !== chip.dataset.tab; });
    });
  });

  /* ————— leads (CRM) ————— */
  const STATUSES = ["new", "contacted", "viewing", "negotiating", "closed", "archived"];
  let leads = [];
  let leadFilter = "active";

  async function loadLeads() {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) { $("#leads-list").innerHTML = '<p class="dash-empty">Could not load leads: ' + esc(error.message) + "</p>"; return; }
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

  function renderLeads() {
    const rows = leads.filter((l) =>
      leadFilter === "all" ? true :
      leadFilter === "active" ? !["closed", "archived"].includes(l.status) :
      l.status === leadFilter);
    if (!rows.length) { $("#leads-list").innerHTML = '<p class="dash-empty">No leads here yet. New inquiries from the site will appear automatically.</p>'; return; }
    $("#leads-list").innerHTML = rows.map((l) => {
      const when = new Date(l.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
      return `
      <div class="dash-row" data-id="${l.id}">
        <div class="dash-row__line" data-toggle>
          <span class="dash-row__name">${esc(l.name || "(no name)")}</span>
          <span class="dash-row__meta">${esc(l.intent || "")}</span>
          <span class="dash-row__spacer"></span>
          <span class="dash-row__meta">${when} · ${esc(l.source_page || "")}${l.listing_slug ? " · " + esc(l.listing_slug) : ""}</span>
          <select class="dash-status ${l.status === "new" ? "dash-status--new" : ""}" data-status>
            ${STATUSES.map((s) => `<option value="${s}" ${s === l.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="dash-row__detail" hidden>
          <dl style="margin:0">
            <dt>Contact</dt><dd>${esc(l.email || "—")}${l.phone ? " · " + esc(l.phone) : ""}
              ${l.email ? ` · <a class="dash-linkbtn" href="mailto:${esc(l.email)}">write back</a>` : ""}</dd>
            <dt>Brief</dt><dd>${esc([l.districts, l.budget_range, l.timeframe].filter(Boolean).join(" · ") || "—")}</dd>
            ${l.notes ? `<dt>Their note</dt><dd>${esc(l.notes)}</dd>` : ""}
            <dt>Your notes</dt>
            <dd><textarea class="dash-note-field" data-note placeholder="Private notes — viewing feedback, next steps…">${esc(l.owner_notes || "")}</textarea>
            <button class="btn" data-save-note style="margin-top:var(--space-2)">Save note</button></dd>
          </dl>
        </div>
      </div>`;
    }).join("");
  }

  $("#leads-list").addEventListener("click", async (e) => {
    const row = e.target.closest(".dash-row");
    if (!row) return;
    if (e.target.closest("[data-toggle]") && !e.target.closest("select")) {
      const d = row.querySelector(".dash-row__detail");
      d.hidden = !d.hidden;
    }
    if (e.target.closest("[data-save-note]")) {
      const btn = e.target.closest("[data-save-note]");
      const note = row.querySelector("[data-note]").value;
      btn.textContent = "Saving…";
      const { error } = await supabase.from("leads").update({ owner_notes: note }).eq("id", row.dataset.id);
      btn.textContent = error ? "Failed — retry" : "Saved";
      setTimeout(() => { btn.textContent = "Save note"; }, 1800);
      const lead = leads.find((l) => l.id === row.dataset.id);
      if (lead && !error) lead.owner_notes = note;
    }
  });

  $("#leads-list").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    const row = e.target.closest(".dash-row");
    const { error } = await supabase.from("leads").update({ status: sel.value }).eq("id", row.dataset.id);
    if (error) { alert("Could not update status: " + error.message); return; }
    const lead = leads.find((l) => l.id === row.dataset.id);
    if (lead) lead.status = sel.value;
    sel.classList.toggle("dash-status--new", sel.value === "new");
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

  $("#listing-new-btn").addEventListener("click", () => openEditor(null));
  $("#editor-close").addEventListener("click", () => { editor.hidden = true; });

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
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#listing-photo").addEventListener("change", () => {
    const f = $("#listing-photo").files[0];
    if (!f) return;
    const prev = $("#listing-photo-preview");
    prev.src = URL.createObjectURL(f);
    prev.hidden = false;
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
