import { stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";
const MAX_TEXT_CHARS = 60000;

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

const IMAGE_NOISE_PATTERN = /logo|icon|favicon|sprite|avatar|pixel|spacer|blank/i;
const MAX_IMAGES = 24;
const MIN_IMAGE_DIMENSION = 150;

function tagAttr(tag, name) {
  const m = tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']", "i"));
  return m ? m[1] : null;
}

// Best-effort: catches <img>/og:image sources, not CSS background-image heroes.
function extractImageUrls(html, baseUrl) {
  const found = [];

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const src = tagAttr(tag, "src") || tagAttr(tag, "data-src") || tagAttr(tag, "data-lazy-src") || tagAttr(tag, "data-original");
    if (!src) continue;
    const width = Number(tagAttr(tag, "width"));
    const height = Number(tagAttr(tag, "height"));
    if (width && width < MIN_IMAGE_DIMENSION) continue;
    if (height && height < MIN_IMAGE_DIMENSION) continue;
    found.push(src);
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const isOgImage = tagAttr(tag, "property") === "og:image" || tagAttr(tag, "name") === "og:image";
    if (!isOgImage) continue;
    const content = tagAttr(tag, "content");
    if (content) found.push(content);
  }

  const seen = new Set();
  const images = [];
  for (const src of found) {
    if (src.startsWith("data:")) continue;
    if (IMAGE_NOISE_PATTERN.test(src)) continue;
    let abs;
    try {
      abs = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }
    if (/\.svg(\?|#|$)/i.test(abs)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    images.push(abs);
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function importDevelopmentFromUrl(openai, { url }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  let html;
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PropertiesByChelImporter/1.0)" },
      redirect: "follow"
    });
    if (!res.ok) throw new Error("The page responded with " + res.status);
    html = await res.text();
  } catch (err) {
    throw new Error("Could not fetch that page: " + (err.message || err));
  }

  const images = extractImageUrls(html, parsed);

  const text = htmlToText(html).slice(0, MAX_TEXT_CHARS);
  if (!text) throw new Error("That page returned no readable text");

  const prompt = `You are extracting factual details about a real-estate development from the raw page text below, to prefill a form for a real-estate broker. Use only what the page actually states. Leave a field as an empty string (or empty array for amenities) rather than invent, estimate, or infer anything the page doesn't say.

Page text (source: ${parsed.toString()}):
"""
${text}
"""

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "name": "the development/building's proper name",
  "developer_name": "the developer or company building/selling it",
  "tagline": "a short positioning line or tagline, only if the page states one, else empty string",
  "location_label": "the address or neighborhood, as stated on the page",
  "meta_line": "a short factual summary, e.g. floor count and unit types, only if stated",
  "overview": "2 to 4 sentences of plain, factual prose summarizing the development, not marketing copy, just a neutral restatement of what the page says",
  "amenities": ["one amenity per array item, only ones explicitly named on the page"],
  "nearby_landmarks": [{"label": "the landmark's name, e.g. Binondo Church", "value": "the stated distance or travel time, e.g. 5 min walk"}]
}
Include at most 5 nearby_landmarks, only ones the page explicitly names with a distance or travel time.`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    name: draft.name || "",
    developer_name: draft.developer_name || "",
    tagline: draft.tagline || "",
    location_label: draft.location_label || "",
    meta_line: draft.meta_line || "",
    overview: draft.overview || "",
    amenities: Array.isArray(draft.amenities) ? draft.amenities.filter((a) => typeof a === "string" && a.trim()) : [],
    nearby_landmarks: Array.isArray(draft.nearby_landmarks)
      ? draft.nearby_landmarks
          .filter((f) => f && typeof f.label === "string" && f.label.trim() && typeof f.value === "string" && f.value.trim())
          .slice(0, 5)
      : [],
    images
  });
}
