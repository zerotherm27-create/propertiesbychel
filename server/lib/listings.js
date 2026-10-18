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

Write for this specific listing. Use only the facts given below. Never invent figures, names, sizes, prices or places. If a field cannot be supported by the facts below, return an empty string (or empty array) for it.

Title: ${title || "(not given)"}
Location: ${location_label || "(not given)"}
Price: ${price_display || "(not given)"}
Card meta line: ${meta_line || "(not given)"}
Nearby features:
${featuresBlock(features)}
Additional notes from the owner: ${notes || "(none)"}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "title": "a short listing title, only if one is clearly supported by the facts, else the given title",
  "tag": "an optional 1 to 3 word corner tag such as Reserved or Allocation, only if the notes say so, else empty",
  "location_label": "district and city, only if stated, else empty",
  "meta_line": "card line in the form 'District, City · size · bedrooms', using only stated facts, else empty",
  "overview": "2 to 3 sentences of on-page prose introducing this residence, in the voice above",
  "meta_description": "one plain sentence, 120 to 155 characters, written for a search-results snippet, distinct in wording from the overview",
  "features": [{"label": "short label", "value": "value"}]  /* up to 3 nearby features, only ones stated in the facts, else [] */
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    title: draft.title || "",
    tag: draft.tag || "",
    location_label: draft.location_label || "",
    meta_line: draft.meta_line || "",
    overview: draft.overview || "",
    meta_description: draft.meta_description || "",
    features: Array.isArray(draft.features)
      ? draft.features.filter((f) => f && f.label && f.value).slice(0, 3)
      : []
  });
}
