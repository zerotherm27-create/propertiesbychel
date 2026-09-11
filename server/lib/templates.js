import { STYLE_GUIDE, EMAIL_TEMPLATE_VOICE, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function draftEmailTemplate(openai, { name, category, angle }) {
  const prompt = `${STYLE_GUIDE}

${EMAIL_TEMPLATE_VOICE}

Template name: ${name || "(not given)"}
Audience category: ${category || "general"}
What this email needs to accomplish: ${angle || "(not given, use your judgement based on the name and category)"}

Available merge fields: {firstName} {intent} {districts} {budgetRange} {timeframe} {status} {listingTitle}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "subject": "the email subject line, in the voice above",
  "heading": "a short on-page heading for the email, a few words",
  "body": "the email body as plain paragraphs separated by blank lines, in the voice above",
  "button_text": "a short call-to-action button label, a few words"
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    subject: draft.subject || "",
    heading: draft.heading || "",
    body: draft.body || "",
    button_text: draft.button_text || ""
  });
}
