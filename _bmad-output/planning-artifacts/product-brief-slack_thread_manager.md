---
title: "Product Brief: Slack Thread Manager"
status: "complete"
created: "2026-05-05"
updated: "2026-05-05"
inputs:
  - "_bmad-output/brainstorming/brainstorming-session-2026-05-05-1219.md"
---

# Product Brief: Slack Thread Manager

## Executive Summary

Every day, our distributed EOS team generates dozens of Slack threads and standup discussions across four channels. Decisions are made, problems are solved, risks emerge — and then they vanish into the scroll. Topics go quiet without anyone noticing until it's too late. Commitments made verbally in standups never materialize in written follow-up. We don't have a communication problem — we have an *intelligence* problem.

The Slack Thread Manager is a delivery risk radar and project intelligence platform. It passively observes all Slack threads and Gemini standup transcripts — reading everything, writing nothing, changing no one's workflow — then applies AI to surface what matters: risks going silent, expertise going untapped, decisions drifting between channels. Each team member gets a personalized daily briefing tailored to their role. Zero manual input. Zero disruption. Non-invasive by design.

This starts as our EOS proving ground, but the architecture is instance-per-project: any Red Hat team deploys their own on OpenShift, scoped to their channels and NDA boundary, with data that never leaves the cluster. We're not building a tool for one project — we're building repeatable consulting intelligence that compounds across engagements.

## The Problem

Our EOS OpenShift Virtualization migration project has ~4 Slack channels with overlapping audiences spanning architects, consultants, project managers, sales, and training. Team members work across timezones, workstreams, and specializations. The result:

**Duplication** — Two people solve the same problem independently because neither saw the other's thread in a different channel or timezone window.

**Lost expertise** — A question sits unanswered in one channel while the expert who could answer it is active in another, unaware the question exists.

**Buried context** — Going back to find "what was decided about storage classes last week" requires scrolling through hundreds of messages, hoping you remember which channel it was in.

**Silent failures** — Topics drop off discussion without anyone noticing. A critical migration path that was "being handled" simply stops being mentioned. No one flags it until it's a crisis.

**Shadow decisions** — Something gets agreed verbally in a standup, but no Slack thread ever reflects the commitment. It lives only in the memory of whoever was present that morning.

Today, the team copes by attending every standup, reading every channel, and relying on memory. That doesn't scale, and it fails silently — you don't know what you missed until the consequences surface.

## The Solution

A passive intelligence layer that sits alongside Slack — reading everything, writing nothing.

**How it works:**
- Continuously ingests Slack threads and Gemini standup transcripts
- AI classifies threads by topic, extracts actions, detects cross-channel connections
- Correlates async (Slack) and sync (standup) discussions about the same subjects
- Delivers a personalized daily morning briefing to each team member with what matters to their role

**What it surfaces:**
- **Orphaned items** — threads and actions with no owner or resolution
- **Gone Quiet risks** — topics that stopped being discussed beyond a configurable threshold
- **Precedent matches** — "this was solved before" pulled from past threads and knowledge bases
- **Cross-workstream connections** — the same topic appearing in different channels, now unified
- **Natural language search** — ask "what's the status on the network migration?" and get a sourced answer

**What it never does:**
- Post in Slack channels (Silent Observer principle)
- Require manual data entry, status updates, or form-filling
- Expose data outside NDA-bound project members

## What Makes This Different

**Merged corpus intelligence.** Existing tools either summarize Slack OR summarize meetings. This correlates both — detecting "shadow decisions" (verbal commitments with no written follow-up) and sync/async divergence (what was said in standup vs. what's happening in threads).

**Silence detection.** No tool on the market tracks what *stopped* being discussed. This is the differentiator that directly prevents the "slipping through cracks" failure mode that kills projects.

**Persona lenses, not one-size-fits-all.** The same data serves five different views — an architect sees technical patterns and cross-workstream dependencies; a PM sees plain-language summaries and orphaned actions; sales sees project health signals. Same truth, tailored delivery.

**Zero-friction architecture.** The system has no forms, no fields, no status updates, no onboarding steps for team members beyond "you'll start getting a daily briefing." If a feature requires manual input, it gets cut.

**Data sovereignty.** Hosted on OpenShift, data stays within the project's access boundary. No external SaaS, no training on customer data, no NDA exposure risk.

## Who This Serves

**Project Managers** — See plain-language summaries of technical discussions, tracked actions, orphaned items routed to their workstream. The "Gone Quiet" section of their daily briefing prevents oversight.

**Architects** — See cross-workstream technical patterns, precedent matches from past resolutions, and wide-spectrum thread activity. Prevents re-solving solved problems.

**Consultants** — See focused, task-level awareness within their workstream scope. Get notified when their expertise is needed in threads they wouldn't otherwise see. New consultants joining mid-engagement get time-travel onboarding — a role-filtered view of everything relevant that happened before they arrived.

**Sales** — See project health trends and business opportunity signals extracted from technical threads without needing to decode jargon.

**Training** — See training opportunity signals surfacing from technical discussions and recurring knowledge gaps.

## Success Criteria

This is working when:

- Team members report catching things they would have missed — a risk, a precedent, a connection across workstreams
- The daily briefing becomes a team habit within 2-3 weeks (measured by engagement or verbal feedback)
- At least one "Gone Quiet" alert prevents a real project oversight in the first 6 weeks
- Natural language search returns accurate, sourced answers in under 5 seconds
- Zero team members need to change their Slack behavior or manually update anything

## Scope

**Version 1 — Build Sequence:**

| Phase | Timeline | Deliverable |
|-------|----------|-------------|
| Foundation | Weeks 1-2 | Slack thread ingestion, indexing, natural language search with sourced answers |
| Intelligence | Weeks 2-4 | Async + Sync fusion (Slack + Gemini transcript correlation), daily briefing delivery |
| Risk Radar | Weeks 4-6 | Silence detection, precedent matching, role-based persona lenses |

**Explicitly not V1:**
- Customer-facing access
- Integration with external systems beyond Slack and Gemini transcripts
- Automated PowerPoint report generation
- Practice Knowledge Exporter (Month 2-3 after data accumulates)
- Cross-project instance federation

## Vision

EOS is the proving ground. If this works here, it becomes a replicable pattern: any Red Hat project team deploys their own instance on OpenShift, scoped to their channels and their NDA boundary. The architecture is instance-per-project by design — clone, configure channels, deploy.

At scale, this unlocks a second layer: anonymized, generalized pattern libraries. The EOS migration produces field-tested VMware-to-OpenShift-Virt migration patterns that other teams inherit. Every project that runs an instance contributes institutional learning back to Red Hat's practice — without exposing any engagement's data.

The end state: Red Hat projects don't just communicate better internally — they turn ephemeral collaboration into bounded, searchable institutional memory and compound delivery intelligence across the entire consulting practice.
