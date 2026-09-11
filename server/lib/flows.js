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

function cleanStep(s) {
  return {
    delay_days: Number(s.delay_days) || 0,
    template: {
      name: (s.template && s.template.name) || "",
      subject: (s.template && s.template.subject) || "",
      heading: (s.template && s.template.heading) || "",
      body: (s.template && s.template.body) || "",
      button_text: (s.template && s.template.button_text) || ""
    }
  };
}

// Output shape: a spine (sent to everyone) that ends in a Yes/No condition
// on the lead's pipeline status, then two branches that continue on from
// there — the same shape as a re-engage email, a "warm lead?" check, then a
// different follow-up cadence depending on the answer. delay_days is always
// an absolute day count from enrollment (Day 0, Day 3, Day 7, ...), the same
// for every branch, since api/run-flows.js measures every Wait block from
// enrollment regardless of which path a lead took to reach it.
export async function draftFlow(openai, { category, angle }) {
  const prompt = `${STYLE_GUIDE}

${FLOW_VOICE}

${EMAIL_TEMPLATE_VOICE}

Audience category: ${category || "general"}
What this flow needs to accomplish overall: ${angle || "(not given, use your judgement based on the category)"}

Design it with exactly one branch point: a short spine of one or two emails, then a condition checking whether the lead's pipeline status looks "warm" (e.g. viewing, negotiating) versus not, then two separate continuations — a shorter, more direct cadence for the warm branch, a more patient, educational cadence for the other. This is the standard shape for this kind of flow; only skip the branch and return steps with no condition/branches if the requested goal genuinely has no reason to split leads into two groups.

Return ONLY a single JSON object, no other text:
{
  "name": "a short flow name",
  "steps": [
    { "delay_days": 0, "template": { "name": "...", "subject": "...", "heading": "...", "body": "...", "button_text": "..." } }
  ],
  "condition": { "value": ["viewing", "negotiating"] },
  "yes_steps": [ { "delay_days": 5, "template": { ... } } ],
  "no_steps": [ { "delay_days": 5, "template": { ... } } ]
}

Omit "condition", "yes_steps", and "no_steps" entirely (do not include the keys) if a branch genuinely doesn't fit.`;

  const response = await openai.responses.create({
    model: DRAFT_MODEL,
    input: prompt
  });

  const draft = extractJson(response.output_text);
  if (!draft.name || !Array.isArray(draft.steps) || !draft.steps.length) {
    throw new Error("Model did not return a usable flow");
  }

  const result = {
    name: draft.name,
    steps: draft.steps.map(cleanStep),
    branch: null
  };

  if (draft.condition && Array.isArray(draft.yes_steps) && draft.yes_steps.length &&
      Array.isArray(draft.no_steps) && draft.no_steps.length) {
    result.branch = {
      condition: {
        field: "status",
        operator: "in",
        value: Array.isArray(draft.condition.value) ? draft.condition.value.filter(Boolean) : []
      },
      yes_steps: draft.yes_steps.map(cleanStep),
      no_steps: draft.no_steps.map(cleanStep)
    };
  }

  return stripDashesDeep(result);
}
