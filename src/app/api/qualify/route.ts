import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  DEFAULT_ICP,
  SERVICE_KEYWORDS,
  extractHeuristic,
  scoreLead,
  templateReply,
  type AgentStep,
  type ICP,
  type LeadFields,
  type QualifyResult,
  type ScoreResult,
} from "@/lib/leads";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
const MAX_TURNS = 6;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "record_lead_details",
    description:
      "Record the structured details extracted from the inbound message. Returns the ICP score, tier, and the reasons. Call this exactly once, first.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: ["string", "null"], description: "Person's full name" },
        company: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        role: { type: ["string", "null"], description: "Job title, e.g. CEO, Marketing Manager" },
        need: { type: ["string", "null"], description: "One-sentence summary of what they want built" },
        services: {
          type: "array",
          items: { type: "string", enum: Object.keys(SERVICE_KEYWORDS) },
          description: "Which of our service categories the request falls into",
        },
        budget_usd: { type: ["number", "null"], description: "Budget in USD; use the upper bound of a range" },
        timeline_months: { type: ["number", "null"], description: "Months until they want to start; ASAP = 1" },
        is_decision_maker: { type: "boolean", description: "True for founders, owners, C-level, VPs, heads, directors" },
      },
      required: ["services", "is_decision_maker"],
    },
  },
  {
    name: "save_to_crm",
    description: "Save the qualified lead to the CRM with a short summary and a drafted reply email. Call this last.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-3 sentence summary for the sales team" },
        reply_subject: { type: "string" },
        reply_body: {
          type: "string",
          description: "Personalised reply email. Warm and specific for Hot/Warm leads; ask for budget/timeline for Cold; polite decline for Disqualified.",
        },
      },
      required: ["summary", "reply_subject", "reply_body"],
    },
  },
];

const SYSTEM = `You are LeadPilot, a lead qualification agent for a software development studio.
Given an inbound message:
1. Call record_lead_details with every detail you can extract. Do not guess values that are not in the message — use null.
2. Read the returned score and tier.
3. Call save_to_crm with a summary and a reply email that fits the tier. Sign the email "Best regards". Never promise prices or dates.`;

export async function POST(req: Request) {
  const { text, icp: rawIcp } = (await req.json().catch(() => ({}))) as { text?: string; icp?: Partial<ICP> };
  if (!text?.trim()) return NextResponse.json({ error: "Lead text is required" }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: "Message is too long (max 6,000 characters)" }, { status: 413 });
  const icp: ICP = { ...DEFAULT_ICP, ...rawIcp };

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return NextResponse.json(await runAgent(text, icp));
    } catch (err) {
      console.error("Agent failed, falling back to demo mode", err);
    }
  }
  return NextResponse.json(runDemo(text, icp));
}

async function runAgent(text: string, icp: ICP): Promise<QualifyResult> {
  const client = new Anthropic();
  const steps: AgentStep[] = [];
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Our ICP: budget >= $${icp.minBudget}, start within ${icp.maxTimelineMonths} months, services: ${icp.services.join(", ")}.\n\nInbound message:\n"""\n${text}\n"""`,
    },
  ];

  let lead: LeadFields | null = null;
  let result: ScoreResult | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: TOOLS, messages });
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      if (call.name === "record_lead_details") {
        const input = call.input as Partial<LeadFields>;
        lead = {
          name: input.name ?? null,
          company: input.company ?? null,
          email: input.email ?? null,
          role: input.role ?? null,
          need: input.need ?? null,
          services: input.services ?? [],
          budget_usd: input.budget_usd ?? null,
          timeline_months: input.timeline_months ?? null,
          is_decision_maker: Boolean(input.is_decision_maker),
        };
        result = scoreLead(lead, icp);
        steps.push(
          { tool: call.name, title: "Extracted lead details", detail: describeLead(lead) },
          { tool: "score_lead", title: `Scored ${result.score}/100 → ${result.tier}`, detail: result.reasons.join("\n") },
        );
        toolResults.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
      } else if (call.name === "save_to_crm" && lead && result) {
        const input = call.input as { summary: string; reply_subject: string; reply_body: string };
        steps.push(
          { tool: "draft_reply", title: "Drafted a reply email", detail: input.reply_subject },
          { tool: call.name, title: `Saved to CRM in "${result.tier}"`, detail: input.summary },
        );
        return {
          mode: "llm",
          lead,
          result,
          summary: input.summary,
          reply: { subject: input.reply_subject, body: input.reply_body },
          steps,
        };
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: "Call record_lead_details first.",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  throw new Error("Agent did not finish within the turn limit");
}

function runDemo(text: string, icp: ICP): QualifyResult {
  const lead = extractHeuristic(text);
  const result = scoreLead(lead, icp);
  const reply = templateReply(lead, result);
  const summary = `${lead.name ?? "Unknown contact"}${lead.company ? ` from ${lead.company}` : ""} — ${
    lead.services.join(", ") || "unclear request"
  }. Scored ${result.score}/100 (${result.tier}).`;
  return {
    mode: "demo",
    lead,
    result,
    summary,
    reply,
    steps: [
      { tool: "record_lead_details", title: "Extracted lead details", detail: describeLead(lead) },
      { tool: "score_lead", title: `Scored ${result.score}/100 → ${result.tier}`, detail: result.reasons.join("\n") },
      { tool: "draft_reply", title: "Drafted a reply email", detail: reply.subject },
      { tool: "save_to_crm", title: `Saved to CRM in "${result.tier}"`, detail: summary },
    ],
  };
}

function describeLead(l: LeadFields): string {
  return [
    `Name: ${l.name ?? "—"}`,
    `Company: ${l.company ?? "—"}`,
    `Role: ${l.role ?? "—"}${l.is_decision_maker ? " (decision maker)" : ""}`,
    `Email: ${l.email ?? "—"}`,
    `Services: ${l.services.join(", ") || "—"}`,
    `Budget: ${l.budget_usd != null ? "$" + l.budget_usd.toLocaleString() : "—"}`,
    `Timeline: ${l.timeline_months != null ? l.timeline_months + " month(s)" : "—"}`,
  ].join("\n");
}
