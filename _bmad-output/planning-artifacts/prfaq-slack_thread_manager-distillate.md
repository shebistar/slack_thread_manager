---
title: "PRFAQ Distillate: slack_thread_manager"
type: llm-distillate
source: "prfaq-slack_thread_manager.md"
created: "2026-05-06"
purpose: "Token-efficient context for downstream PRD creation"
---

## Core Concept

- Self-hosted project intelligence platform that passively reads Slack threads and transforms them into organized, role-personalized, searchable team memory
- Internal tool for Red Hat EOS project (OpenShift Virtualization migration from VMware), open-sourced for community adoption
- 30-person distributed team across Americas, India, UK/EMEA — consultants, architects, PMs, account executives
- Triggering incident: DLL migration failure caused by buried Slack context, led to customer escalation
- Core insight: "We don't have a communication problem — we have a retrieval problem"

## V1 Scope (In)

- Slack ingestion (read-only, 4 project channels)
- Thread classification by topic and workstream
- Role-based personalized morning briefings
- Natural language search with source linking
- Silence detector as passive dashboard (not alerts)
- Team roster: name/handle/nickname-to-role mapping (one-time setup by project lead)
- Staging review pipeline for anonymization (blocklist + LLM detection + human spot-check)
- Feedback mechanism for architects/PMs to flag hallucinated summaries
- Slack message history backfill for mid-project deployment

## V2 Scope (Out of V1)

- Multi-project simultaneous support
- Cross-project knowledge sharing and export
- Multi-source integration (email, Google Docs, meeting transcripts, Gemini, NotebookLM, Red Hat KB)
- Proactive silence detection alerting
- Scale beyond single team (400-person target is vision, not V1)

## Technical Context

- Self-hosted on rented server, no GPUs — CPU-only LLMs for V1
- Fallback: Gemini Pro and NotebookLM Pro via company license (requires permission, path is known)
- Deployment target: OpenShift cluster
- Development model: AI-agent-driven (Shebi owns requirements/architecture/review; agents implement)
- Open-source codebase with community contribution model
- Instance-per-project architecture

## Personas (from product brief)

- Architect: cross-workstream technical patterns, past precedent matches
- Consultant: role-relevant context, onboarding catch-up
- Project Manager: plain-language summaries, orphaned action tracking
- Sales/Account Executive: engagement-relevant context
- Training: knowledge base feeding

## Competitive Landscape

- TryCatchUp: closest competitor (silence detection) — SaaS-only, no role-based lenses, no standup transcript correlation
- Collabute: meeting+Slack correlation — no silence detection, no self-hosting
- No competitor combines self-hosted + silence detection + role-based personalization
- All major competitors are SaaS — self-hosted on OpenShift is uncontested for NDA-bound consulting

## Key Differentiators

- Zero-disruption "Silent Observer" principle: never posts, never interrupts, never requires manual input
- Role-based persona lenses on the same underlying data
- Self-hosted and NDA-compliant by architecture, not by policy exception
- Passive silence detection (dashboard, not alerts) — unique positioning vs noisy monitoring tools

## Rejected Framings and Alternatives

- Initially framed as "communication gaps" — reframed to "institutional knowledge loss with operational cost"
- Initially scoped as multi-source aggregation (Slack + email + Docs + Gemini + NotebookLM + KB) — narrowed to Slack-only sharp wedge for V1
- Silence detector initially positioned as proactive alerting — demoted to passive dashboard to avoid noise and trust erosion
- Zero-config claim dropped in favor of honest lightweight roster setup
- "Silent Intelligence Layer" kept as category framing but may not resonate with team — revisit after user testing

## Requirements Signals

- Anonymization is a hard requirement, not a nice-to-have — NDA-protected customer data in all channels
- Briefings must pass staging review before delivery (three-layer gate: blocklist, LLM entity detection, human spot-check)
- Feedback mechanism needed for architects/PMs to correct hallucinated summaries — UX undefined
- Roster management: names, Slack handles, common nicknames mapped to roles — must handle informal chat conventions
- Backfill capability required for teams deploying mid-project
- Knowledge persistence beyond project lifecycle is a stated goal (V2 export, but V1 data should be architected for it)

## Open Questions and Unknowns

- **CPU LLM quality for knowledge transformation**: untested against real Slack data — what accuracy rate on classification? What hallucination rate is acceptable? Define measurable quality bar before building
- **Feedback mechanism UX**: how do validators flag errors? Where do corrections go? How does the system learn? Needs design
- **Security review process for AI-generated code**: no formal process defined for adversarial review of anonymization logic and data-handling paths
- **First 7 days adoption experience**: what does success look like? What does failure look like? What's the pivot if initial reception is lukewarm?
- **Operational runbooks**: if another person needed to operate this system, could they? Documentation discipline needed from day one

## Resource and Timeline

- Solo developer (Shebi) + AI agent pipeline — human effort is requirements, architecture, review
- Existing rented server (owned hardware, no new infrastructure cost)
- ~2 year project horizon (full EOS engagement lifespan)
- Timeline constraint is quality iteration cycle on knowledge transformation, not development velocity
- One identified early adopter for initial feedback loop and internal championing

## Risks (Ranked by Likelihood)

1. **Adoption failure**: team doesn't use the briefings despite technical success — mitigated by early adopter feedback loop but no broader adoption strategy
2. **Model quality insufficient**: CPU-only LLMs produce output too unreliable for trust — mitigated by Gemini Pro fallback
3. **Quality iteration too slow**: V1 not useful before project momentum is lost — mitigated by 2-year horizon
4. **Bus factor**: all operational knowledge in one person — mitigated by open-source code but not by operational documentation (yet)
5. **Anonymization failure**: customer data leaks into briefing — mitigated by staging review pipeline, bounded blast radius (internal team with NDA access)

## Verdict Summary

- **Concept: strong.** Problem is real and proven, customer is specific, competitive space is genuinely empty, scope is disciplined
- **Critical path item**: prove knowledge transformation quality on real Slack data before building anything else
- **Biggest structural risk**: operational bus factor — code is open-source, but operational knowledge isn't transferable yet
- **Recommended next step**: PRD creation using this PRFAQ and distillate as primary inputs
