# LeadPilot — AI lead qualification agent

Paste an inbound email or contact-form message. An AI agent pulls out the lead's details, scores them against your ideal customer profile, drafts a personalised reply, and files the lead on a CRM pipeline board.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · Claude API (tool use)

## Features

- **Tool-using agent loop:** Claude calls `record_lead_details` → gets a score back → calls `save_to_crm` with a summary and reply
- **Deterministic scoring:** the ICP score is computed in code, not by the model, so results are consistent and explainable
- **Visible run log:** every agent step and score reason is shown, so sales teams can trust the decision
- **Configurable ICP:** minimum budget, timeline, and target services
- **CRM board:** Hot / Warm / Cold / Disqualified columns, saved in the browser
- **Demo mode:** without an API key, a rule-based extractor runs the same pipeline

## Agent flow

```
inbound message
     │
     ▼
Claude ──tool_use──► record_lead_details(name, company, budget, timeline, services…)
     ▲                        │
     └──── tool_result ◄── scoreLead() → { score: 100, tier: "Hot", reasons[] }
     │
     ▼
Claude ──tool_use──► save_to_crm(summary, reply_subject, reply_body)
                              │
                              ▼
                        UI: run log + reply + CRM card
```

## Run locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (optional)
npm run dev
```

## Extending it

In production the `save_to_crm` tool writes to HubSpot, Salesforce, or Pipedrive through their APIs, and the agent is triggered by a webhook from the website form or a Gmail/Outlook inbox watcher.
