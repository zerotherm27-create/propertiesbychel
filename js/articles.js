/* Properties by Chel — public rendering for Journal/Intelligence articles stored in Supabase.
 * Runs on article.html (single-article view) and on journal.html/intelligence.html (index lists).
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SB = window.SUPABASE_CONFIG || {};
if (SB.url && SB.anonKey) {
  const supabase = createClient(SB.url, SB.anonKey);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");

  if (document.getElementById("article-content") && slug) {
    renderSingleArticle(supabase, slug);
  }
  const journalIndex = document.getElementById("journal-index");
  const intelIndex = document.getElementById("intel-index");
  if (journalIndex) renderIndex(supabase, "journal", journalIndex);
  if (intelIndex) renderIndex(supabase, "intelligence", intelIndex);

  async function renderSingleArticle(supabase, slug) {
    const { data: article, error } = await supabase.from("articles").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    document.getElementById("article-loading").hidden = true;
    if (error || !article) { document.getElementById("article-notfound").hidden = false; return; }

    document.getElementById("doc-title").textContent = article.title + " — Properties by Chel";
    if (article.meta_description) document.getElementById("doc-description").setAttribute("content", article.meta_description);

    const isJournal = article.section === "journal";
    document.getElementById("nav-journal").setAttribute("aria-current", isJournal ? "page" : "false");
    document.getElementById("nav-intelligence").setAttribute("aria-current", isJournal ? "false" : "page");
    document.getElementById("art-eyebrow").textContent = isJournal ? "Journal" : "Market Intelligence · Note";
    document.getElementById("art-h").textContent = article.title;
    document.getElementById("art-meta").textContent = article.dek || (isJournal ? "From the Journal" : "A market note");

    if (article.hero_image_url) {
      const wrap = document.getElementById("art-figure-wrap");
      wrap.hidden = false;
      const img = document.getElementById("art-image");
      img.src = article.hero_image_url;
      img.alt = article.hero_image_alt || article.title;
    }

    const mount = document.getElementById("art-body-mount");
    const paragraphs = String(article.body || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (isJournal) {
      const art = document.createElement("article");
      art.className = "article section section--flush-top";
      paragraphs.forEach((p) => { const el = document.createElement("p"); el.textContent = p; art.appendChild(el); });
      mount.appendChild(art);
    } else {
      const section = document.createElement("section");
      section.className = "section section--flush-top";
      const shell = document.createElement("div");
      shell.className = "shell";
      shell.style.maxWidth = "52rem";
      paragraphs.forEach((p) => { const el = document.createElement("p"); el.className = "prose mt-6"; el.textContent = p; shell.appendChild(el); });
      section.appendChild(shell);
      mount.appendChild(section);
    }

    document.getElementById("art-more-label").textContent = isJournal ? "More from the Journal" : "More from the Desk";
    document.getElementById("art-more-link").href = isJournal ? "journal.html" : "intelligence.html#notes-h";
    document.getElementById("art-more-title").textContent = isJournal ? "See the full archive" : "See recent observations";

    document.getElementById("article-content").hidden = false;
    document.dispatchEvent(new Event("listings:rendered"));
  }

  async function renderIndex(supabase, section, container) {
    const { data, error } = await supabase.from("articles").select("*").eq("section", section).eq("status", "published").order("published_at", { ascending: false }).limit(8);
    if (error || !data || !data.length) return;
    const prefix = section === "journal" ? "J" : "N";
    container.innerHTML = data.map((a, i) => `
      <a class="index-row" href="article.html?slug=${encodeURIComponent(a.slug)}" data-reveal>
        <span class="index-row__no">${prefix}·${String(i + 1).padStart(2, "0")}</span>
        <span class="index-row__title">${esc(a.title)}</span>
        <span class="index-row__meta">${esc(a.dek || "")}</span>
      </a>`).join("") + container.innerHTML;
    document.dispatchEvent(new Event("listings:rendered"));
  }
}
