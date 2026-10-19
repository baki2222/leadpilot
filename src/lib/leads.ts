// Shared lead types, ICP scoring, and the heuristic (no-LLM) extractor.

export type LeadFields = {
  name: string | null;
  company: string | null;
  email: string | null;
  role: string | null;
  need: string | null;
  services: string[];
  budget_usd: number | null;
  timeline_months: number | null;
  is_decision_maker: boolean;
};

export type ICP = {
  minBudget: number;
  maxTimelineMonths: number;
  services: string[];
};

export type Tier = "Hot" | "Warm" | "Cold" | "Disqualified";

export type ScoreResult = {
  score: number;
  tier: Tier;
  reasons: string[];
};

export type AgentStep = {
  tool: string;
  title: string;
  detail: string;
};

export type QualifyResult = {
  mode: "llm" | "demo";
  lead: LeadFields;
  result: ScoreResult;
  summary: string;
  reply: { subject: string; body: string };
  steps: AgentStep[];
};

export const SERVICE_KEYWORDS: Record<string, string[]> = {
  "AI chatbot": ["chatbot", "chat bot", "assistant", "support bot", "rag", "knowledge base"],
  "AI agent / automation": ["agent", "automate", "automation", "workflow", "zapier", "n8n", "make.com"],
  "SaaS / MVP": ["saas", "mvp", "platform", "dashboard", "subscription", "web app", "startup"],
  "API integration": ["api", "integration", "integrate", "crm", "hubspot", "salesforce", "stripe"],
  Website: ["website", "landing page", "wordpress", "shopify"],
  "Mobile app": ["mobile app", "ios", "android", "react native", "flutter"],
};

export const DEFAULT_ICP: ICP = {
  minBudget: 5000,
  maxTimelineMonths: 3,
  services: ["AI chatbot", "AI agent / automation", "SaaS / MVP", "API integration"],
};

const FREE_EMAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?)\./i;
const DECISION_ROLES = /\b(ceo|cto|coo|founder|co-founder|owner|president|vp|vice president|head of|director|partner)\b/i;

/** Deterministic ICP scoring, used by both the LLM agent and demo mode. */
export function scoreLead(lead: LeadFields, icp: ICP): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (lead.budget_usd == null) {
    score += 8;
    reasons.push("Budget not stated (+8)");
  } else if (lead.budget_usd >= icp.minBudget) {
    score += 30;
    reasons.push(`Budget $${lead.budget_usd.toLocaleString()} meets $${icp.minBudget.toLocaleString()} minimum (+30)`);
  } else if (lead.budget_usd >= icp.minBudget / 2) {
    score += 15;
    reasons.push(`Budget $${lead.budget_usd.toLocaleString()} is below minimum but close (+15)`);
  } else {
    reasons.push(`Budget $${lead.budget_usd.toLocaleString()} is too low (+0)`);
  }

  if (lead.timeline_months == null) {
    score += 8;
    reasons.push("Timeline not stated (+8)");
  } else if (lead.timeline_months <= icp.maxTimelineMonths) {
    score += 20;
    reasons.push(`Wants to start within ${lead.timeline_months} month(s) (+20)`);
  } else {
    score += 5;
    reasons.push(`Long timeline: ${lead.timeline_months} months (+5)`);
  }

  if (lead.is_decision_maker) {
    score += 20;
    reasons.push(`Decision maker${lead.role ? ` (${lead.role})` : ""} (+20)`);
  } else {
    score += 5;
    reasons.push("Not clearly a decision maker (+5)");
  }

  const fit = lead.services.filter((s) => icp.services.includes(s));
  if (fit.length > 0) {
    score += 20;
    reasons.push(`Needs services we focus on: ${fit.join(", ")} (+20)`);
  } else {
    reasons.push("Request is outside our focus services (+0)");
  }

  if (lead.email && !FREE_EMAIL.test(lead.email)) {
    score += 10;
    reasons.push("Business email domain (+10)");
  }

  const tier: Tier = score >= 75 ? "Hot" : score >= 45 ? "Warm" : score >= 25 ? "Cold" : "Disqualified";
  return { score, tier, reasons };
}

export function detectServices(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(SERVICE_KEYWORDS)
    .filter(([, words]) => words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)))
    .map(([service]) => service);
}

function parseMoney(raw: string): number {
  const n = parseFloat(raw.replace(/[$,\s]/g, ""));
  return /k$/i.test(raw.trim()) ? n * 1000 : n;
}

/** Rule-based extraction for demo mode (no API key). */
export function extractHeuristic(text: string): LeadFields {
  const field = (label: string) =>
    text.match(new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, "im"))?.[1].trim() ?? null;

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;

  const signOff = text.match(/(?:thanks|best|regards|cheers|sincerely)[^\n]*\n+\s*([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i)?.[1];
  // Case-insensitive keywords, but the captured name must be capitalised.
  const intro = text.match(/(?:[Ii]'m|[Ii] am|[Mm]y name is|[Tt]his is)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)/)?.[1];
  const name = field("name") ?? intro ?? signOff ?? null;

  const company =
    field("company") ??
    text.match(
      /\b(?:[Aa]t|[Ff]rom|[Ff]ounder of|CEO of|CTO of|COO of|[Oo]wner of|[Hh]ead of \w+ at)\s+([A-Z][\w&-]*(?:\s[A-Z][\w&-]*){0,2})/,
    )?.[1] ??
    null;

  const roleMatch = text.match(
    /\b(CEO|CTO|COO|Co-?founder|Founder|Owner|President|VP [\w ]+?|Head of [\w ]+?|Director of [\w ]+?|[\w ]*Manager|Marketing Lead|Developer|Student)\b/i,
  );
  const role = field("role") ?? field("title") ?? roleMatch?.[1]?.trim() ?? null;

  const amounts = [...text.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?\s?k?\b|\b\d[\d,]*\s?(?:k\s?)?(?:usd|dollars)\b/gi)].map((m) =>
    parseMoney(m[0].replace(/usd|dollars/i, "")),
  );
  const budget_usd = amounts.length ? Math.max(...amounts) : null;

  let timeline_months: number | null = null;
  const t = text.toLowerCase();
  const inN = t.match(/(\d+)\s*(week|month)s?/);
  if (/\b(asap|urgent|right away|immediately|this month|next week)\b/.test(t)) timeline_months = 1;
  else if (inN) timeline_months = inN[2] === "week" ? Math.max(1, Math.ceil(+inN[1] / 4)) : +inN[1];
  else if (/next month/.test(t)) timeline_months = 1;
  else if (/next year|no rush|someday|eventually/.test(t)) timeline_months = 12;

  const services = detectServices(text);
  // The "need" is the first sentence that mentions a service or a request verb.
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const firstLine =
    sentences.find((s) => detectServices(s).length > 0 || /\b(want|need|looking for|build|make)\b/i.test(s)) ??
    sentences[0] ??
    null;

  return {
    name,
    company,
    email,
    role,
    need: field("project") ?? firstLine,
    services,
    budget_usd,
    timeline_months,
    is_decision_maker: DECISION_ROLES.test(role ?? "") || DECISION_ROLES.test(text.slice(0, 400)),
  };
}

export function templateReply(lead: LeadFields, result: ScoreResult): { subject: string; body: string } {
  const first = lead.name?.split(" ")[0] ?? "there";
  const topic = lead.services[0] ?? "software";

  if (result.tier === "Hot" || result.tier === "Warm") {
    return {
      subject: `Re: your ${topic} project${lead.company ? ` at ${lead.company}` : ""}`,
      body:
        `Hi ${first},\n\nThanks for reaching out — this sounds like a great fit. ` +
        `This kind of ${topic} work is exactly what we focus on, and I'd love to learn more about your goals.\n\n` +
        `Could you share a bit more about your current setup and what success looks like for you? ` +
        `If it's easier, here's my calendar for a 20-minute call this week: [booking link]\n\nBest regards`,
    };
  }
  if (result.tier === "Cold") {
    return {
      subject: "Thanks for your message",
      body:
        `Hi ${first},\n\nThanks for getting in touch. To see whether we're a good fit, could you share ` +
        `your rough budget and timeline for this project?\n\nBest regards`,
    };
  }
  return {
    subject: "Thanks for reaching out",
    body:
      `Hi ${first},\n\nThank you for thinking of us. Unfortunately this project isn't a match for what we ` +
      `focus on right now, but I'm happy to recommend someone if that helps.\n\nBest regards`,
  };
}
