import { STYLE_GUIDE, EMAIL_TEMPLATE_VOICE, FLOW_VOICE, stripDashesDeep } from "./style.js";

const DRAFT_MODEL = "gpt-5.6";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a parseable JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Output is a flat, linear plan — no branching. Each entry is "wait
// delay_days (from enrollment) then send this template". The caller expands
// each entry into an actual Wait block + Send Email block pair on the
// Drawflow canvas, and creates a real email_templates row for the template.
// Condition/branch blocks remain a manual, drag-in feature — reliably
// generating a branching graph as JSON is a further step, not attempted here.
export async function draftFlow(openai, { category, angle }) {
  const prompt = `${STYLE_GUIDE}

${FLOW_VOICE}

${EMAIL_TEMPLATE_VOICE}

Audience category: ${category || "general"}
What this flow needs to accomplish overall: ${angle || "(not given, use your judgement based on the category)"}

Return ONLY a single JSON object, no other text:
{
  "name": "a short flow name",
  "steps": [
    {
      "delay_days": 0,
      "template": { "name": "...", "subject": "...", "heading": "...", "body": "...", "button_text": "..." }
    }
  ]
}`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  if (!draft.name || !Array.isArray(draft.steps) || !draft.steps.length) {
    throw new Error("Model did not return a usable flow");
  }
  return stripDashesDeep({
    name: draft.name,
    steps: draft.steps.map((s) => ({
      delay_days: Number(s.delay_days) || 0,
      template: {
        name: (s.template && s.template.name) || "",
        subject: (s.template && s.template.subject) || "",
        heading: (s.template && s.template.heading) || "",
        body: (s.template && s.template.body) || "",
        button_text: (s.template && s.template.button_text) || ""
      }
    }))
  });
}
