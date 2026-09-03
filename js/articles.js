/* Properties by Chel — public rendering for Journal/Intelligence articles stored in Supabase.
 * Runs on article.html (single-article view) and on journal.html/intelligence.html (index lists).
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SB = window.SUPABASE_CONFIG || {};
if (SB.url && SB.anonKey) {
  const supabase = createClient(SB.url, SB.anonKey);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Article bodies are plain text blocks separated by a blank line; a block
  // starting with "## " is a subheading and "> " is a pull-quote, matching
  // the markup convention the AI drafting prompt is instructed to produce.
  function renderBodyBlock(block, pClass) {
    if (block.startsWith("## ")) {
      const h2 = document.createElement("h2");
      h2.textContent = block.slice(3).trim();
      return h2;
    }
    if (block.startsWith("> ")) {
      const bq = document.createElement("blockquote");
      bq.className = "pullquote";
      bq.textContent = block.slice(2).trim();
      return bq;
    }
    const p = document.createElement("p");
    if (pClass) p.className = pClass;
    p.textContent = block;
    return p;
  }

  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");

  if (document.getElementById("article-content") && slug) {
    renderSingleArticle(supabase, slug);
  }
  // Insights hub: one combined Journal + Intelligence feed, no section filter.
  const insightsIndex = document.getElementById("insights-articles");
  if (insightsIndex) renderIndex(supabase, null, insightsIndex);

  async function renderSingleArticle(supabase, slug) {
    const { data: article, error } = await supabase.from("articles").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    document.getElementById("article-loading").hidden = true;
    if (error || !article) { document.getElementById("article-notfound").hidden = false; return; }

    document.getElementById("doc-title").textContent = article.title + " · Properties by Chel";
    if (article.meta_description) document.getElementById("doc-description").setAttribute("content", article.meta_description);

    const isJournal = article.section === "journal";
    document.getElementById("nav-insights").setAttribute("aria-current", "page");
    document.getElementById("art-eyebrow").textContent = isJournal ? "Journal" : "Market Intelligence · Note";
    document.getElementById("art-h").textContent = article.title;
    document.getElementById("art-meta").textContent = article.dek || (isJournal ? "From the Journal" : "A market note");
    document.getElementById("art-journal-cta").hidden = !isJournal;
    document.getElementById("art-intel-cta").hidden = isJournal;
    supabase.from("briefings").select("pdf_url").eq("section", isJournal ? "journal" : "intelligence").eq("status", "published").maybeSingle()
      .then(({ data: briefing }) => {
        if (!briefing || !briefing.pdf_url) return;
        // A published PDF is ready to hand over directly; skip the lead-capture
        // form in favour of a straight download link.
        const suffix = isJournal ? "journal" : "intel";
        const link = document.getElementById("art-" + suffix + "-cta-link");
        const form = document.getElementById("art-" + suffix + "-cta-form");
        link.href = briefing.pdf_url;
        link.hidden = false;
        if (form) form.hidden = true;
      });

    if (article.hero_image_url) {
      const wrap = document.getElementById("art-figure-wrap");
      wrap.hidden = false;
      const img = document.getElementById("art-image");
      img.src = article.hero_image_url;
      img.alt = article.hero_image_alt || article.title;
    }

    const mount = document.getElementById("art-body-mount");
    const blocks = String(article.body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (isJournal) {
      const art = document.createElement("article");
      art.className = "article section section--flush-top";
      blocks.forEach((b) => art.appendChild(renderBodyBlock(b)));
      mount.appendChild(art);
    } else {
      const section = document.createElement("section");
      section.className = "section section--flush-top";
      const shell = document.createElement("div");
      shell.className = "shell";
      shell.style.maxWidth = "52rem";
      blocks.forEach((b) => shell.appendChild(renderBodyBlock(b, "prose mt-6")));
      section.appendChild(shell);
      mount.appendChild(section);
    }

    document.getElementById("art-more-label").textContent = "More";
    document.getElementById("art-more-link").href = "insights#journal-h";
    document.getElementById("art-more-title").textContent = "See the full archive";

    document.getElementById("article-content").hidden = false;
    document.dispatchEvent(new Event("listings:rendered"));
  }

  async function renderIndex(supabase, section, container) {
    let query = supabase.from("articles").select("*").eq("status", "published").order("published_at", { ascending: false }).limit(8);
    if (section) query = query.eq("section", section);
    const { data, error } = await query;
    if (error || !data || !data.length) return;
    container.innerHTML = data.map((a, i) => {
      const isJournal = a.section === "journal";
      const prefix = isJournal ? "J" : "N";
      const label = isJournal ? "Journal" : "Intelligence";
      const meta = a.dek ? label + " · " + esc(a.dek) : label;
      return `
      <a class="index-row" href="article?slug=${encodeURIComponent(a.slug)}" data-reveal>
        <span class="index-row__no">${prefix}·${String(i + 1).padStart(2, "0")}</span>
        <span class="index-row__title">${esc(a.title)}</span>
        <span class="index-row__meta">${meta}</span>
      </a>`;
    }).join("");
    document.querySelectorAll("[data-sample-only]").forEach((el) => { el.hidden = true; });
    document.dispatchEvent(new Event("listings:rendered"));
  }
}
