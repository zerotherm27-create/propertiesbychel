import { STYLE_GUIDE, sectionVoice, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";
const CHECK_MODEL = "gpt-5.6";

// These are fixed publication identities, not something that should drift
// every time the owner regenerates an edition.
const BRIEFING_IDENTITY = {
  journal: { eyebrow: "Companion Briefing", title: "The Village Market: an Owner's Paper" },
  intelligence: { eyebrow: "The Library", title: "Prime Residential Quarterly" }
};

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function draftContent(openai, section, identity) {
  const prompt = `${STYLE_GUIDE}

${sectionVoice(section)}

You are writing the current edition of "${identity.title}" (published under the standing eyebrow "${identity.eyebrow}"), a recurring practice briefing for Properties by Chel, distinct from the shorter essays and notes on the site. This is a real reference document a serious buyer or seller would keep, not a marketing page: substantial, specific, organized into clear sections.

Write 4 to 6 sections covering distinct, concrete aspects of the Philippine prime residential market (Makati, BGC, Alabang, Cebu, and comparable markets) relevant to ${section === "intelligence" ? "an investor deciding what to do with capital" : "an owner or buyer navigating a purchase or sale"}. Each section is a few paragraphs. Also produce a short "at a glance" spec list (2 to 4 label/value pairs, e.g. coverage area, format, access).

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "intro": "one short paragraph introducing this edition, plain prose",
  "sections": [{ "heading": "short section heading, no trailing punctuation", "body": "a few paragraphs, plain prose, separated by a blank line" }],
  "spec": [{ "label": "short label, e.g. Coverage", "value": "short value" }]
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    tools: [{ type: "web_search" }],
    input: prompt
  });

  return extractJson(response.output_text);
}

async function complianceCheck(openai, draft, section, identity) {
  const prompt = `You are an SEO and UX editor reviewing a standing briefing document before it publishes on a real-estate advisory site.

${STYLE_GUIDE}

Publication: "${identity.title}" (${identity.eyebrow})
Section: ${section}

Draft JSON:
${JSON.stringify(draft, null, 2)}

Check: that each section is substantive and distinct (no repeated points), paragraph rhythm and sentence-length variety, that the spec list is short and scannable, and, critically, confirm there is no em dash or en dash anywhere in intro, section headings, section bodies, or spec values.

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "intro": "...",
  "sections": [{ "heading": "...", "body": "..." }],
  "spec": [{ "label": "...", "value": "..." }]
}
Return the draft unchanged if it already passes; otherwise return your corrected version.`;

  const response = await openai.responses.create({
    model: CHECK_MODEL,
    input: prompt
  });

  return extractJson(response.output_text);
}

export async function draftBriefing(openai, { section }) {
  const identity = BRIEFING_IDENTITY[section] || BRIEFING_IDENTITY.journal;
  const draft = await draftContent(openai, section, identity);
  const checked = await complianceCheck(openai, draft, section, identity);
  const clean = stripDashesDeep({
    intro: checked.intro || draft.intro || "",
    sections: checked.sections || draft.sections || [],
    spec: checked.spec || draft.spec || []
  });
  return { ...identity, ...clean, section };
}
