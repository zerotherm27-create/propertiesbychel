import { STYLE_GUIDE, LEAD_EMAIL_VOICE, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export async function draftLeadEmail(openai, { lead, goal }) {
  const prompt = `${STYLE_GUIDE}

${LEAD_EMAIL_VOICE}

Write this email using only the facts given below.

Name: ${lead.name || "(not given)"}
Interest: ${lead.intent || "(not given)"}
Districts of interest: ${lead.districts || "(not given)"}
Budget range: ${lead.budget_range || "(not given)"}
Timeframe: ${lead.timeframe || "(not given)"}
Notes on file: ${lead.notes || "(none)"}
Pipeline status: ${lead.status || "(not given)"}

What this email needs to accomplish: ${goal}

Return ONLY a single JSON object, no other text, with exactly these keys:
{
  "subject": "the email subject line, in the voice above",
  "body_html": "the email body as plain paragraphs separated by blank lines, in the voice above"
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  return stripDashesDeep({
    subject: draft.subject || "",
    body_html: draft.body_html || ""
  });
}
