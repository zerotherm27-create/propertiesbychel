import { STYLE_GUIDE, LISTING_VOICE, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function featuresBlock(features) {
  if (!Array.isArray(features) || !features.length) return "(none given)";
  return features.map((f) => `${f.label}: ${f.value}`).join("\n");
}

export async function draftListingDescription(openai, { title, location_label, price_display, meta_line, features, notes }) {
  const prompt = `${STYLE_GUIDE}

${LISTING_VOICE}

Write for this specific listing. Use only the facts given below.

Title: ${title}
Location: ${location_label || "(not given)"}
Price: ${price_display || "(not given)"}
Card meta line: ${meta_line || "(not given)"}
Nearby features:
${featuresBlock(features)}
Additional notes from the owner: ${notes || "(none)"}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "overview": "2 to 3 sentences of on-page prose introducing this residence, in the voice above",
  "meta_description": "one plain sentence, 120 to 155 characters, written for a search-results snippet, distinct in wording from the overview"
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    overview: draft.overview || "",
    meta_description: draft.meta_description || ""
  });
}
