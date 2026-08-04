/* Properties by Chel — dashboard Content tab (Journal & Intelligence articles)
 * Bridged in from dashboard.js after sign-in via window.DashboardContent.init(supabase, helpers).
 */
const AGENT_URL = (window.SUPABASE_CONFIG || {}).contentAgentUrl || "";
const slugify = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const paragraphsToBody = (text) => String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).join("\n\n");

window.DashboardContent = {
  init(supabase, { $, $$, esc, uploadPhoto, showToast }) {
    if (this._initialized) return;
    this._initialized = true;

    let articles = [];
    let lastDraft = null;

    async function authHeader() {
      const { data: { session } } = await supabase.auth.getSession();
      return session ? { Authorization: "Bearer " + session.access_token } : {};
    }

    async function loadArticles() {
      const { data, error } = await supabase.from("articles").select("*").order("created_at", { ascending: false });
      if (error) { $("#articles-list").innerHTML = '<p class="dash-empty">Could not load articles: ' + esc(error.message) + "</p>"; return; }
      articles = data;
      renderArticles();
    }

    function renderArticles() {
      if (!articles.length) { $("#articles-list").innerHTML = '<p class="dash-empty">No articles yet. Write one, or let the AI draft one from a topic.</p>'; return; }
      $("#articles-list").innerHTML = articles.map((a) => `
        <div class="dash-row" data-id="${a.id}">
          <div class="dash-row__line">
            <span class="dash-row__name">${esc(a.title)}</span>
            <span class="dash-row__meta">${esc(a.section)} · ${esc(a.status)}${a.ai_generated ? " · AI draft" : ""}</span>
            <span class="dash-row__spacer"></span>
            <label class="dash-switch" style="margin:0"><input type="checkbox" data-pub ${a.status === "published" ? "checked" : ""}> Published</label>
            <button class="dash-linkbtn" data-edit>Edit</button>
            <button class="dash-linkbtn" data-del>Delete</button>
          </div>
        </div>`).join("");
    }

    const editor = $("#article-editor");
    const form = $("#article-form");

    function resetAiPanel() {
      lastDraft = null;
      $("#ai-topic").value = "";
      $("#ai-status").textContent = "";
      $("#ai-image-btn").disabled = true;
      $("#article-seo-notes").textContent = "";
      renderSources([]);
    }

    function renderSources(sources) {
      const el = $("#ai-sources");
      if (!sources || !sources.length) { el.hidden = true; el.innerHTML = ""; return; }
      el.innerHTML = sources.map((s) => `
        <li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("");
      el.hidden = false;
    }

    function openEditor(a) {
      editor.hidden = false;
      $("#article-editor-title").textContent = a ? "Edit: " + a.title : "New article";
      form.reset();
      resetAiPanel();
      form.elements.id.value = a ? a.id : "";
      const prev = $("#article-photo-preview");
      if (a) {
        form.elements.section.value = a.section;
        form.elements.title.value = a.title || "";
        form.elements.slug.value = a.slug || "";
        form.elements.dek.value = a.dek || "";
        form.elements.body.value = a.body || "";
        form.elements.meta_description.value = a.meta_description || "";
        form.elements.hero_image_url.value = a.hero_image_url || "";
        form.elements.hero_image_alt.value = a.hero_image_alt || "";
        form.elements.published.checked = a.status === "published";
        if (a.seo_notes) $("#article-seo-notes").textContent = a.seo_notes;
        prev.hidden = !a.hero_image_url;
        if (a.hero_image_url) prev.src = a.hero_image_url;
      } else {
        prev.hidden = true;
      }
      editor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    $("#article-new-btn").addEventListener("click", () => openEditor(null));
    $("#article-editor-close").addEventListener("click", () => { editor.hidden = true; });

    $("#articles-list").addEventListener("click", async (e) => {
      const row = e.target.closest(".dash-row");
      if (!row) return;
      const a = articles.find((x) => x.id === row.dataset.id);
      if (e.target.closest("[data-edit]")) openEditor(a);
      if (e.target.closest("[data-del]")) {
        if (!confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
        const { error } = await supabase.from("articles").delete().eq("id", a.id);
        if (error) showToast("Could not delete: " + error.message, true); else loadArticles();
      }
    });

    $("#articles-list").addEventListener("change", async (e) => {
      const row = e.target.closest(".dash-row");
      if (!row || !e.target.closest("[data-pub]")) return;
      const publish = e.target.checked;
      const patch = { status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null };
      const { error } = await supabase.from("articles").update(patch).eq("id", row.dataset.id);
      if (error) { showToast("Could not update: " + error.message, true); loadArticles(); } else loadArticles();
    });

    /* ————— AI research & draft ————— */
    $("#ai-draft-btn").addEventListener("click", async () => {
      const topic = $("#ai-topic").value.trim();
      const section = form.elements.section.value;
      if (!topic) { $("#ai-status").textContent = "Enter a topic first."; return; }
      if (!AGENT_URL) { $("#ai-status").textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
      $("#ai-status").textContent = "Researching and drafting: this can take a minute…";
      $("#ai-draft-btn").disabled = true;
      try {
        const headers = { "Content-Type": "application/json", ...(await authHeader()) };
        const r = await fetch(AGENT_URL + "/generate-article", { method: "POST", headers, body: JSON.stringify({ topic, section }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Draft failed");
        lastDraft = data;
        renderSources(data.sources);
        form.elements.title.value = data.title || "";
        form.elements.slug.value = data.slug || slugify(data.title);
        form.elements.dek.value = data.dek || "";
        form.elements.body.value = paragraphsToBody(data.body);
        form.elements.meta_description.value = data.meta_description || "";
        $("#article-seo-notes").textContent = data.seo_notes || "";
        $("#ai-status").textContent = "Draft ready. Review below, then generate a hero image or edit freely.";
        $("#ai-image-btn").disabled = false;
      } catch (ex) {
        $("#ai-status").textContent = "Could not draft: " + (ex.message || ex);
      } finally {
        $("#ai-draft-btn").disabled = false;
      }
    });

    $("#ai-image-btn").addEventListener("click", async () => {
      const title = form.elements.title.value.trim();
      const section = form.elements.section.value;
      if (!title) { $("#ai-status").textContent = "Draft a title first."; return; }
      $("#ai-status").textContent = "Generating hero image…";
      $("#ai-image-btn").disabled = true;
      try {
        const headers = { "Content-Type": "application/json", ...(await authHeader()) };
        const r = await fetch(AGENT_URL + "/generate-image", { method: "POST", headers, body: JSON.stringify({ title, dek: form.elements.dek.value, section }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Image generation failed");
        const bytes = atob(data.b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: data.contentType || "image/png" });
        const file = new File([blob], "hero.png", { type: data.contentType || "image/png" });
        const url = await uploadPhoto(file, "articles");
        form.elements.hero_image_url.value = url;
        form.elements.hero_image_alt.value = data.alt || title;
        const prev = $("#article-photo-preview");
        prev.src = url; prev.hidden = false;
        $("#ai-status").textContent = "Hero image generated and uploaded.";
      } catch (ex) {
        $("#ai-status").textContent = "Could not generate image: " + (ex.message || ex);
      } finally {
        $("#ai-image-btn").disabled = false;
      }
    });

    $("#article-photo").addEventListener("change", () => {
      const f = $("#article-photo").files[0];
      if (!f) return;
      const prev = $("#article-photo-preview");
      prev.src = URL.createObjectURL(f);
      prev.hidden = false;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#article-error");
      err.textContent = "";
      const btn = $("#article-save");
      btn.textContent = "Saving…";
      try {
        const photoFile = $("#article-photo").files[0];
        if (photoFile) form.elements.hero_image_url.value = await uploadPhoto(photoFile, "articles");
        const isEdit = !!form.elements.id.value;
        const wasPublished = isEdit && articles.find((a) => a.id === form.elements.id.value)?.status === "published";
        const nowPublished = form.elements.published.checked;
        const payload = {
          section: form.elements.section.value,
          title: form.elements.title.value.trim(),
          slug: slugify(form.elements.slug.value.trim() || form.elements.title.value.trim()),
          dek: form.elements.dek.value.trim() || null,
          body: form.elements.body.value.trim(),
          meta_description: form.elements.meta_description.value.trim() || null,
          hero_image_url: form.elements.hero_image_url.value || null,
          hero_image_alt: form.elements.hero_image_alt.value || null,
          status: nowPublished ? "published" : "draft",
          ai_generated: !!lastDraft
        };
        if (nowPublished && !wasPublished) payload.published_at = new Date().toISOString();
        const q = isEdit
          ? supabase.from("articles").update(payload).eq("id", form.elements.id.value)
          : supabase.from("articles").insert(payload);
        const { error } = await q;
        if (error) throw error;
        editor.hidden = true;
        await loadArticles();
      } catch (ex) {
        err.textContent = ex.message || String(ex);
      } finally {
        btn.textContent = "Save article";
      }
    });

    loadArticles();
  }
};
