import puppeteer from "puppeteer";

// A self-contained print stylesheet, not a reuse of css/site.css: that file
// carries hover states and JS-driven reveal animations that only make sense
// on a live page. These are the same brand tokens (see tokens.css) restated
// as plain hex/rgb so a static Puppeteer render doesn't depend on them.
const BRAND = {
  ink: "#142B5A",
  espresso: "#0B1D3A",
  inkSoft: "#3A3A3A",
  inkFaint: "#6B6B6B",
  brass: "#D4AF37",
  brassDeep: "#8A6B14",
  paper: "#FAF8F4",
  line: "rgba(20,43,90,0.16)"
};

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function paragraphs(text) {
  return String(text || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`).join("\n");
}

const EDITION = () => new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function renderBriefingHtml({ title, eyebrow, intro, sections, spec }) {
  const sectionPages = (sections || []).map((s, i) => `
    <section class="page">
      <p class="no">${String(i + 1).padStart(2, "0")}</p>
      <h2>${esc(s.heading)}</h2>
      ${paragraphs(s.body)}
    </section>`).join("\n");

  const specPage = (spec && spec.length) ? `
    <section class="page">
      <p class="eyebrow">At a Glance</p>
      <table class="spec">
        ${spec.map((row) => `<tr><th>${esc(row.label)}</th><td>${esc(row.value)}</td></tr>`).join("\n")}
      </table>
    </section>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Work+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Work Sans", "Helvetica Neue", sans-serif; color: ${BRAND.ink}; background: ${BRAND.paper}; font-size: 11.5pt; line-height: 1.6; }
  h1, h2 { font-family: "Playfair Display", Georgia, serif; font-weight: 500; margin: 0; color: ${BRAND.ink}; }
  p { margin: 0 0 0.9em; color: ${BRAND.inkSoft}; }
  .page { page-break-after: always; padding: 26mm 20mm; min-height: 297mm; position: relative; }
  .page:last-child { page-break-after: auto; }
  .eyebrow { font-size: 9.5pt; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: ${BRAND.brassDeep}; margin: 0 0 1.2em; }
  .eyebrow::before { content: ""; display: inline-block; width: 2em; height: 1px; background: ${BRAND.brass}; margin-right: 0.8em; vertical-align: middle; }

  .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .cover .eyebrow::before { display: none; }
  .cover h1 { font-size: 34pt; max-width: 22ch; margin: 0.3em 0 0.6em; }
  .cover .practice { font-size: 10pt; letter-spacing: 0.05em; color: ${BRAND.inkFaint}; }
  .cover .edition { position: absolute; bottom: 26mm; left: 0; right: 0; text-align: center; font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: ${BRAND.inkFaint}; }
  .cover .rule { width: 3em; height: 1px; background: ${BRAND.brass}; margin: 1.4em 0; }

  .intro-page h2 { font-size: 20pt; margin-bottom: 0.6em; }
  .toc { margin-top: 2.5em; list-style: none; padding: 0; }
  .toc li { display: flex; gap: 1em; padding: 0.7em 0; border-bottom: 1px solid ${BRAND.line}; font-family: "Playfair Display", Georgia, serif; font-size: 13pt; }
  .toc .no { color: ${BRAND.brassDeep}; font-family: "Work Sans", sans-serif; font-size: 9.5pt; font-weight: 600; letter-spacing: 0.1em; }

  .page .no { font-size: 9.5pt; font-weight: 600; letter-spacing: 0.1em; color: ${BRAND.brassDeep}; margin: 0 0 0.8em; }
  .page h2 { font-size: 20pt; margin-bottom: 0.9em; }

  table.spec { width: 100%; border-collapse: collapse; margin-top: 1.5em; }
  table.spec th, table.spec td { text-align: left; padding: 0.7em 0; border-bottom: 1px solid ${BRAND.line}; vertical-align: baseline; font-weight: 400; }
  table.spec th { font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; color: ${BRAND.inkFaint}; padding-right: 2em; white-space: nowrap; }
  table.spec td { color: ${BRAND.ink}; }

  .closing { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .closing address { font-style: normal; color: ${BRAND.inkFaint}; font-size: 9.5pt; line-height: 2; margin-top: 1.5em; }
</style>
</head>
<body>

  <section class="page cover">
    <p class="eyebrow">${esc(eyebrow)}</p>
    <h1>${esc(title)}</h1>
    <p class="practice">Properties by Chel &middot; Private Real Estate Advisory</p>
    <div class="rule"></div>
    <p class="practice">Makati City, Philippines</p>
    <p class="edition">${esc(EDITION())} Edition</p>
  </section>

  <section class="page intro-page">
    <p class="eyebrow">Introduction</p>
    <h2>${esc(title)}</h2>
    ${paragraphs(intro)}
    <ul class="toc">
      ${(sections || []).map((s, i) => `<li><span class="no">${String(i + 1).padStart(2, "0")}</span> ${esc(s.heading)}</li>`).join("\n")}
    </ul>
  </section>

  ${sectionPages}
  ${specPage}

  <section class="page closing">
    <p class="eyebrow">Continue the Conversation</p>
    <h2 style="font-size:18pt;max-width:26ch">A private read on your own situation.</h2>
    <address>
      concierge@propertiesbychel.com<br>
      Direct line shared upon introduction<br>
      PRC-licensed real estate broker
    </address>
  </section>

</body>
</html>`;
}

export async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}
