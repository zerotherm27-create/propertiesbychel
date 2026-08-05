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

    /* ————— Standing briefings (one PDF per section) ————— */
    const BRIEFING_SECTIONS = ["journal", "intelligence"];
    const BRIEFING_DEFAULTS = {
      journal: { eyebrow: "Companion Briefing", title: "The Village Market: an Owner's Paper" },
      intelligence: { eyebrow: "The Library", title: "Prime Residential Quarterly" }
    };
    let briefings = {};
    let currentBriefingSection = null;
    let currentBriefingPdfUrl = null;

    function sectionsToText(sections) {
      return (sections || []).map((s) => `## ${s.heading}\n\n${paragraphsToBody(s.body)}`).join("\n\n");
    }

    function textToSections(text) {
      const blocks = String(text || "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
      const out = [];
      let current = null;
      blocks.forEach((b) => {
        if (b.startsWith("## ")) {
          current = { heading: b.slice(3).trim(), body: [] };
          out.push(current);
        } else if (current) {
          current.body.push(b);
        }
      });
      return out.map((s) => ({ heading: s.heading, body: s.body.join("\n\n") }));
    }

    function specFromForm(form) {
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const label = form.elements["spec_label_" + i].value.trim();
        const value = form.elements["spec_value_" + i].value.trim();
        if (label && value) rows.push({ label, value });
      }
      return rows;
    }

    async function loadBriefings() {
      const { data, error } = await supabase.from("briefings").select("*");
      if (!error && data) briefings = Object.fromEntries(data.map((b) => [b.section, b]));
      renderBriefingsList();
    }

    function renderBriefingsList() {
      const labels = { journal: "Journal", intelligence: "Intelligence" };
      $("#briefings-list").innerHTML = BRIEFING_SECTIONS.map((section) => {
        const b = briefings[section];
        const status = b ? b.status : "not created";
        const title = b ? b.title : BRIEFING_DEFAULTS[section].title;
        return `
        <div class="dash-row" data-section="${section}">
          <div class="dash-row__line">
            <span class="dash-row__name">${esc(labels[section])} &middot; ${esc(title)}</span>
            <span class="dash-row__meta">${esc(status)}${b && b.pdf_url ? " · PDF ready" : ""}</span>
            <span class="dash-row__spacer"></span>
            ${b && b.pdf_url ? `<a class="dash-linkbtn" href="${esc(b.pdf_url)}" target="_blank" rel="noopener">View PDF</a>` : ""}
            <button class="dash-linkbtn" data-edit-briefing>Edit</button>
          </div>
        </div>`;
      }).join("");
    }

    const briefingEditor = $("#briefing-editor");
    const briefingForm = $("#briefing-form");

    function openBriefingEditor(section) {
      currentBriefingSection = section;
      const b = briefings[section];
      currentBriefingPdfUrl = b ? b.pdf_url || null : null;
      briefingEditor.hidden = false;
      $("#briefing-editor-title").textContent = (section === "journal" ? "Journal" : "Intelligence") + " briefing";
      briefingForm.reset();
      $("#briefing-ai-status").textContent = "";
      $("#briefing-pdf-status").textContent = "";
      briefingForm.elements.section.value = section;
      const defaults = BRIEFING_DEFAULTS[section];
      briefingForm.elements.eyebrow.value = b ? b.eyebrow : defaults.eyebrow;
      briefingForm.elements.title.value = b ? b.title : defaults.title;
      briefingForm.elements.intro.value = b ? b.intro || "" : "";
      briefingForm.elements.sections_text.value = sectionsToText(b ? b.sections : []);
      const spec = b ? b.spec || [] : [];
      for (let i = 0; i < 3; i++) {
        briefingForm.elements["spec_label_" + i].value = spec[i] ? spec[i].label : "";
        briefingForm.elements["spec_value_" + i].value = spec[i] ? spec[i].value : "";
      }
      briefingForm.elements.published.checked = b ? b.status === "published" : false;
      briefingEditor.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    $("#briefing-editor-close").addEventListener("click", () => { briefingEditor.hidden = true; });

    $("#briefings-list").addEventListener("click", (e) => {
      const row = e.target.closest(".dash-row");
      if (!row || !e.target.closest("[data-edit-briefing]")) return;
      openBriefingEditor(row.dataset.section);
    });

    $("#briefing-draft-btn").addEventListener("click", async () => {
      if (!AGENT_URL) { $("#briefing-ai-status").textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
      $("#briefing-ai-status").textContent = "Drafting a fresh edition: this can take a minute…";
      $("#briefing-draft-btn").disabled = true;
      try {
        const headers = { "Content-Type": "application/json", ...(await authHeader()) };
        const r = await fetch(AGENT_URL + "/generate-briefing", { method: "POST", headers, body: JSON.stringify({ section: currentBriefingSection }) });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Draft failed");
        briefingForm.elements.eyebrow.value = data.eyebrow || briefingForm.elements.eyebrow.value;
        briefingForm.elements.title.value = data.title || briefingForm.elements.title.value;
        briefingForm.elements.intro.value = data.intro || "";
        briefingForm.elements.sections_text.value = sectionsToText(data.sections);
        const spec = data.spec || [];
        for (let i = 0; i < 3; i++) {
          briefingForm.elements["spec_label_" + i].value = spec[i] ? spec[i].label : "";
          briefingForm.elements["spec_value_" + i].value = spec[i] ? spec[i].value : "";
        }
        $("#briefing-ai-status").textContent = "Draft ready. Review below, then generate the PDF.";
      } catch (ex) {
        $("#briefing-ai-status").textContent = "Could not draft: " + (ex.message || ex);
      } finally {
        $("#briefing-draft-btn").disabled = false;
      }
    });

    async function saveBriefing(pdfUrl) {
      const payload = {
        section: currentBriefingSection,
        eyebrow: briefingForm.elements.eyebrow.value.trim(),
        title: briefingForm.elements.title.value.trim(),
        intro: briefingForm.elements.intro.value.trim() || null,
        sections: textToSections(briefingForm.elements.sections_text.value),
        spec: specFromForm(briefingForm),
        pdf_url: pdfUrl !== undefined ? pdfUrl : currentBriefingPdfUrl,
        status: briefingForm.elements.published.checked ? "published" : "draft"
      };
      const { error } = await supabase.from("briefings").upsert(payload, { onConflict: "section" });
      if (error) throw error;
      currentBriefingPdfUrl = payload.pdf_url;
      await loadBriefings();
    }

    $("#briefing-pdf-btn").addEventListener("click", async () => {
      if (!AGENT_URL) { $("#briefing-pdf-status").textContent = "Content agent isn't configured (contentAgentUrl missing)."; return; }
      if (!briefingForm.elements.title.value.trim()) { $("#briefing-pdf-status").textContent = "Add a title first."; return; }
      $("#briefing-pdf-status").textContent = "Rendering PDF: this can take a moment…";
      $("#briefing-pdf-btn").disabled = true;
      try {
        const headers = { "Content-Type": "application/json", ...(await authHeader()) };
        const body = JSON.stringify({
          title: briefingForm.elements.title.value.trim(),
          eyebrow: briefingForm.elements.eyebrow.value.trim(),
          intro: briefingForm.elements.intro.value.trim(),
          sections: textToSections(briefingForm.elements.sections_text.value),
          spec: specFromForm(briefingForm)
        });
        const r = await fetch(AGENT_URL + "/render-briefing-pdf", { method: "POST", headers, body });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "PDF rendering failed");
        const bytes = atob(data.b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        const blob = new Blob([arr], { type: data.contentType || "application/pdf" });
        const file = new File([blob], "briefing.pdf", { type: data.contentType || "application/pdf" });
        const url = await uploadPhoto(file, "briefings");
        await saveBriefing(url);
        $("#briefing-pdf-status").textContent = "PDF generated and saved.";
      } catch (ex) {
        $("#briefing-pdf-status").textContent = "Could not generate PDF: " + (ex.message || ex);
      } finally {
        $("#briefing-pdf-btn").disabled = false;
      }
    });

    briefingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#briefing-error");
      err.textContent = "";
      const btn = $("#briefing-save");
      btn.textContent = "Saving…";
      try {
        await saveBriefing();
        briefingEditor.hidden = true;
      } catch (ex) {
        err.textContent = ex.message || String(ex);
      } finally {
        btn.textContent = "Save briefing";
      }
    });

    loadArticles();
    loadBriefings();
  }
};
