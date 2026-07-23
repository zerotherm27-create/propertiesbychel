export const STYLE_GUIDE = `You write for Properties by Chel, a discreet, editorial real-estate advisory practice in the Philippines. Match the voice already used across the site: considered, specific, understated confidence. Never promotional, never generic.

Write like an experienced human editor, not an AI assistant:
- Vary sentence length and rhythm. Do not repeat the same sentence shape twice in a row.
- Never use an em dash or en dash as punctuation, anywhere, for any reason. Use a comma, period, colon, or parentheses instead. This rule has no exceptions.
- No throat-clearing openers ("In today's market...", "When it comes to...", "Navigating the world of..."). No "In conclusion". No rhetorical questions as a hook. No listicle framing ("Here are 5 things to know"). No stacked hedges ("It's important to note that it could potentially...").
- Ground claims in concrete, plausible specifics: neighbourhoods, building types, transaction mechanics, timeframes, peso figures where natural. Avoid vague filler like "in today's fast-paced world" or "when it comes to real estate."
- No emoji. No exclamation points. No bold, italics, or markdown syntax inside body paragraphs — plain prose only.
- Prefer Philippine real-estate context and terminology (PRC, RA 9646, CCT/TCT, HOA/village associations, Ayala/BGC/Makati-style district references) where it fits the topic naturally; do not force it.`;

const VOICE_BY_SECTION = {
  journal: `Section voice: Journal (essay register). Write a neighbourhood study, market essay, or property story — the kind of piece meant to be read start to finish, not scanned. Open with a concrete scene or observation rather than a thesis statement. 5 to 7 paragraphs. Close on a considered, quiet note rather than a call to action.`,
  intelligence: `Section voice: Market Intelligence (data-forward register). Write a research note for someone deciding what to do with capital. Short on adjectives, long on what actually moved. Lead with the observation, then the read on why it matters. 3 to 5 paragraphs. No narrative scene-setting — state the signal plainly.`
};

export function sectionVoice(section) {
  return VOICE_BY_SECTION[section] || VOICE_BY_SECTION.journal;
}

export function slugify(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const DASH_PATTERN = /\s*[–—]\s*/g;

// Hard safety net: strip any em/en dash the model produces despite instructions,
// replacing it with a comma so sentences stay grammatical.
export function stripDashes(text) {
  if (!text) return text;
  return String(text).replace(DASH_PATTERN, ", ").replace(/,\s*,/g, ",");
}

export function stripDashesDeep(obj) {
  if (typeof obj === "string") return stripDashes(obj);
  if (Array.isArray(obj)) return obj.map(stripDashesDeep);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = stripDashesDeep(v);
    return out;
  }
  return obj;
}
