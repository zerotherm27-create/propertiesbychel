import { STYLE_GUIDE, sectionVoice, slugify, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";
const CHECK_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function draftArticle(openai, topic, section) {
  const prompt = `${STYLE_GUIDE}

${sectionVoice(section)}

Research the following topic using web search so the piece is grounded in real, current context (Philippine prime residential real estate: Makati, BGC, Alabang, Cebu, and comparable markets). Then write the article.

Topic: "${topic}"

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "title": "a specific, non-generic headline, under 70 characters",
  "dek": "one or two sentences summarizing the piece, for use as an index-row teaser",
  "meta_description": "150 to 160 characters, written for a search results page",
  "body": "the full article as plain paragraphs separated by a blank line — no markdown, no headings, no dashes as punctuation"
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    tools: [{ type: "web_search" }],
    input: prompt
  });

  return extractJson(response.output_text);
}

async function complianceCheck(openai, draft, topic, section) {
  const prompt = `You are an SEO and UX editor reviewing a draft before it publishes to a real-estate advisory site.

${STYLE_GUIDE}

Topic it should cover: "${topic}"
Section: ${section}

Draft JSON:
${JSON.stringify(draft, null, 2)}

Check: title length and clarity, meta description length (150-160 chars), whether the body actually addresses the topic, paragraph rhythm and sentence-length variety, and — critically — confirm there is no em dash or en dash anywhere in title, dek, meta_description, or body.

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "title": "...",
  "dek": "...",
  "meta_description": "...",
  "body": "...",
  "seo_notes": "two or three sentences of plain notes for the site owner: what's strong, what to watch"
}
Return the draft unchanged in the four content fields if it already passes; otherwise return your corrected version.`;

  const response = await openai.responses.create({
    model: CHECK_MODEL,
    input: prompt
  });

  return extractJson(response.output_text);
}

export async function generateArticle(openai, { topic, section }) {
  const draft = await draftArticle(openai, topic, section);
  const checked = await complianceCheck(openai, draft, topic, section);
  const clean = stripDashesDeep({
    title: checked.title || draft.title,
    dek: checked.dek || draft.dek,
    meta_description: checked.meta_description || draft.meta_description,
    body: checked.body || draft.body,
    seo_notes: checked.seo_notes || ""
  });
  return { ...clean, slug: slugify(clean.title), topic, section };
}
