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

const STATUSES = ["sale", "lease", "investment"];
const COLLECTIONS = {
  skyline: "high-rise condominium residences, penthouses and sky-level units",
  estate: "house-and-lot, estate lots, villas and subdivision homes",
  branded: "residences carrying a hotel or luxury brand name (e.g. Four Seasons, Aman, Rosewood, Raffles)",
  legacy: "established, older or heritage family homes in prime villages",
  "investment-grade": "units positioned for yield or capital appreciation (rental income, pre-selling upside, high demand location)"
};

export async function draftListingDescription(openai, { title, location_label, price_display, meta_line, features, notes, nearby_places }) {
  const prompt = `${STYLE_GUIDE}

${LISTING_VOICE}

Write for this specific listing. Use only the facts given below. Never invent figures, names, sizes, prices or places. If a field cannot be supported by the facts below, return an empty string (or empty array) for it.

Title: ${title || "(not given)"}
Location: ${location_label || "(not given)"}
Price: ${price_display || "(not given)"}
Card meta line: ${meta_line || "(not given)"}
Nearby features already entered:
${featuresBlock(features)}
Verified nearby places (found on Google Maps near the pin, with real distances; these are facts):
${featuresBlock(nearby_places)}
Additional notes from the owner: ${notes || "(none)"}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "title": "a short listing title, only if one is clearly supported by the facts, else the given title",
  "tag": "an optional 1 to 3 word corner tag such as Reserved or Allocation, only if the notes say so, else empty",
  "location_label": "district and city, only if stated, else empty",
  "meta_line": "card line in the form 'District, City · size · bedrooms', using only stated facts, else empty",
  "overview": "2 to 3 sentences of on-page prose introducing this residence, in the voice above",
  "meta_description": "one plain sentence, 120 to 155 characters, written for a search-results snippet, distinct in wording from the overview",
  "price_display": "the price exactly as stated in the notes, formatted like '₱180M' or '₱350K / mo', else the given price, else empty",
  "status": ["every way the listing is offered, chosen only from: ${STATUSES.join(", ")}. 'sale' for for-sale or pre-selling, 'lease' for rent or per-month pricing, 'investment' only if the notes pitch it as an investment. Empty array if the facts do not say"],
  "collections": ["zero or more keys, only when clearly supported by the facts. Keys and meanings: ${Object.entries(COLLECTIONS).map(([k, v]) => `${k} = ${v}`).join("; ")}. Empty array if unsure"],
  "features": [{"label": "short label such as Landmark, Shopping, Healthcare, Education, Transit or Park", "value": "name, distance away, e.g. 'Greenbelt Mall, 1.2km away'"}]  /* 4 to 5 nearby features (fewer only if fewer verified places exist). Prefer the verified nearby places above, choosing the most significant and varied across categories. Keep any already entered. Never invent a place or distance. Else [] */
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
    price_display: draft.price_display || "",
    status: Array.isArray(draft.status) ? draft.status.filter((x) => STATUSES.includes(x)) : [],
    collections: Array.isArray(draft.collections) ? draft.collections.filter((x) => x in COLLECTIONS) : [],
    features: Array.isArray(draft.features)
      ? draft.features.filter((f) => f && f.label && f.value).slice(0, 5)
      : []
  });
}
