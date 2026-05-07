---
stepsCompleted:
  - "step-01-init"
  - "step-02-discovery"
  - "step-02b-vision"
  - "step-02c-executive-summary"
  - "step-03-success"
  - "step-04-journeys"
  - "step-01b-continue"
  - "step-05-domain"
  - "step-06-innovation"
  - "step-01b-continue"
  - "step-07-project-type"
  - "step-08-scoping"
  - "step-09-functional"
  - "step-10-nonfunctional"
  - "step-11-polish"
  - "step-12-complete"
releaseMode: phased
inputDocuments:
  - "_bmad-output/planning-artifacts/product-brief-slack_thread_manager.md"
  - "_bmad-output/planning-artifacts/prfaq-slack_thread_manager.md"
  - "_bmad-output/planning-artifacts/prfaq-slack_thread_manager-distillate.md"
  - "_bmad-output/brainstorming/brainstorming-session-2026-05-05-1219.md"
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  prfaq: 2
  projectDocs: 0
  projectContext: 0
classification:
  projectType: "web_app"
  domain: "enterprise_collaboration_project_intelligence"
  complexity: "medium-high"
  projectContext: "greenfield"
workflowType: 'prd'
---

# Product Requirements Document - Slack Thread Manager

**Author:** Shebi
**Date:** 2026-05-05

## Executive Summary

The Slack Thread Manager is a self-hosted project intelligence platform that passively observes Slack conversations and transforms them into organized, role-personalized, searchable team memory. Built for the Red Hat EOS OpenShift Virtualization migration project — a 30+ person distributed team spanning the Americas, India, and the UK — it solves a specific, proven failure mode: institutional knowledge dies in the scroll. Decisions get buried, problems get solved twice, expertise goes untapped across channel and timezone boundaries, and critical topics go silent without anyone noticing until consequences surface.

The system reads everything and writes nothing. It ingests Slack threads, classifies them by topic and workstream, correlates async and sync discussions, and delivers a personalized daily briefing to each team member tailored to their role — architect, consultant, project manager, sales, or training. When a team member asks "what was decided about storage classes last week?", they get a sourced answer in seconds, linked to the original thread, regardless of which channel it happened in.

The team is growing. New consultants are being onboarded constantly, and each one faces the same cold-start problem: reconstructing weeks of context from scattered Slack history. This system captures institutional memory now — while the original context-holders are still present — before the team outgrows its ability to rely on informal knowledge transfer. The goal is not to summarize what was missed, but to collapse the timezone gap so every team member starts their day feeling like they were in the room.

### What Makes This Special

**Zero-disruption adoption.** The Silent Observer principle is the core architectural constraint: the system never posts in Slack, never asks for manual input, never requires behavior change. If a feature requires human data entry, it gets cut. This eliminates the adoption trap that kills most internal tools — there is no onboarding, no forms, no workflows to learn. Team members simply start receiving briefings.

**Silence detection.** No tool on the market tracks what *stopped* being discussed. The "Gone Quiet" detector surfaces topics that were actively discussed and then dropped — the kind of quiet that precedes project crises. This is a passive dashboard, not an alert system, giving project leads visibility without noise.

**Role-based persona lenses.** The same underlying data serves five distinct views. An architect sees cross-workstream technical patterns and precedent matches. A PM sees plain-language summaries and orphaned actions. Sales sees project health signals without decoding jargon. Same truth, tailored delivery.

**Self-hosted and NDA-compliant by architecture.** Deployed on OpenShift, data never leaves the project's infrastructure. No external SaaS, no third-party data processors, no NDA exposure risk. This is uncontested positioning — every major competitor in the space is SaaS-only.

## Project Classification

- **Project Type:** Web application — backend intelligence pipeline (Slack ingestion, LLM-powered classification/summarization) with a web dashboard and briefing delivery system
- **Domain:** Enterprise collaboration / project intelligence
- **Complexity:** Medium-high — NDA-protected data handling, LLM reliability as a load-bearing quality concern, five-persona role-based delivery, anonymization staging pipeline
- **Project Context:** Greenfield — new system, no existing codebase

## Success Criteria

### User Success

- Architects and PMs use the daily briefing as their workday starting point within the first 2-3 weeks of deployment
- New consultants joining mid-project achieve working context within their first briefing cycle instead of manually scrolling Slack history
- Team members report catching at least one risk, connection, or precedent per week they would have otherwise missed
- Natural language search returns accurate, sourced answers linked to original threads in under 5 seconds
- Zero team members need to change their Slack behavior, learn new tools, or provide manual input

### Business Success

- At least one project risk equivalent to the DLL migration incident is surfaced and prevented within the first 6 weeks of operation
- Reduction in duplicate problem-solving across workstreams — measurable by fewer "we already solved this" moments surfacing in standups
- New consultant onboarding context gap shrinks — new joiners reference briefing-sourced context rather than asking teammates to repeat decisions

### Technical Success

- Knowledge transformation accuracy: 95%+ on daily briefings — no more than one meaningful error per week across all briefings
- Anonymization staging pipeline catches all customer-identifiable data before any briefing reaches users (zero leaks to team members)
- Search returns sourced results in under 5 seconds for natural language queries across the full thread corpus
- System operates within CPU-only compute constraints on existing rented server (Gemini Pro fallback available but not required for acceptable quality)
- Slack ingestion handles all ~4 project channels with batch polling — no real-time requirement

### Measurable Outcomes

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Architect/PM daily briefing engagement | Consistent daily use | Weeks 2-3 |
| "Gone Quiet" risk prevention | At least 1 prevented incident | First 6 weeks |
| Briefing accuracy rate | 95%+ (≤1 error/week) | Ongoing |
| Search response time | < 5 seconds | From launch |
| Manual input required from team | Zero | Always |
| Anonymization leaks | Zero | Always |

## Product Scope

### MVP - Minimum Viable Product

- Slack thread ingestion from ~4 EOS project channels (batch polling, read-only)
- Thread classification by topic, workstream, and participant role
- Natural language search with sourced answers linked to original threads
- Role-based daily briefings for architects and PMs (the two power-user personas)
- Silence detector ("Gone Quiet") — passive dashboard with workday-aware thresholds
- Team roster: name/handle/nickname-to-role mapping (one-time setup by project lead)
- Anonymization staging pipeline (blocklist + LLM entity detection + human spot-check)
- Slack message history backfill for existing project context
- SPA web dashboard for search, briefing access, silence dashboard, and admin operations
- Thread update detection — old threads with new activity resurfaced in relevant views

### Growth Features (Post-MVP)

- Briefings expanded to all five personas (consultants, sales, training)
- Precedent matching against past thread resolutions
- Feedback mechanism for architects/PMs to flag and correct hallucinated summaries
- Async + Sync fusion (Slack thread + Gemini standup transcript correlation)
- "Shadow decision" detection (verbal standup commitments with no Slack follow-up)
- Trend Radar — cross-channel topic convergence surfaced as hot topics
- Expected-vs-Actual Activity Gap — anomaly detection per workstream flagging unusual silence or hyperactivity

### Vision (Future)

- Multi-project simultaneous support (instance-per-project architecture)
- Cross-project knowledge sharing and anonymized pattern export
- Multi-source integration (email, Google Docs, meeting transcripts, Red Hat KB)
- Practice Knowledge Exporter — anonymized field learnings for other Red Hat teams
- Migration Pattern Library — structured catalog of recurring VMware-to-OCP-Virt patterns
- Community-driven open-source adoption across Red Hat consulting practice

## User Journeys

### Journey 1: Raj — The Architect's Morning Radar

Raj is a senior architect on the EOS project based in Hyderabad. He wakes up to find 14 hours of Slack activity across three channels he monitors — storage migration discussions in one, networking issues in another, and a VM compatibility thread that spans both. Yesterday, a decision was made in the Americas timezone about changing the storage class approach. A separate thread in the account channel mentioned a customer concern about the same storage topic. Raj doesn't know either of these happened.

Raj opens his morning briefing. The first section highlights the storage class decision with a direct link to the thread, flagged as cross-workstream because it touches both the infrastructure and account channels. Below it, the briefing surfaces a precedent: a similar storage class discussion from three weeks ago where a different approach was tried and abandoned. Raj clicks through, reads the original thread, and realizes the new decision repeats a mistake the team already learned from. He flags it in the next standup before anyone starts implementation.

Without the briefing, Raj would have discovered the conflict two days later — after work had already started down the wrong path.

**Capabilities revealed:** Cross-workstream thread correlation, precedent surfacing, role-filtered briefing delivery, source linking to original threads.

### Journey 2: Priya — The New Consultant's Cold Start

Priya joins the EOS project three weeks after it started. She's a virtualization specialist assigned to the VM migration workstream. Her first day, she has access to four Slack channels with thousands of messages she hasn't read. Her project lead tells her "just ask if you have questions," but she doesn't know what she doesn't know.

Priya is added to the team roster by the project lead. Her first briefing arrives the next morning — but it's not just today's activity. The system has backfilled her view with a role-filtered summary of the three weeks she missed: key decisions in the VM migration workstream, unresolved issues still open, and action items that are assigned to her workstream but have no owner yet. She reads for ten minutes and walks into her first standup already knowing what's been decided, what's stuck, and where her expertise is needed.

Over the next week, Priya uses search to fill gaps: "what was the issue with DLL compatibility on the batch migration?" returns a sourced answer with links to three threads and a past resolution. She stops asking teammates to repeat context they've already discussed.

**Capabilities revealed:** Backfill/time-travel onboarding, roster-driven role assignment, workstream-scoped briefing, natural language search with sourced answers.

### Journey 3: Dana — The PM Tracking Orphaned Work

Dana is a project manager in Durham responsible for the infrastructure workstream. She manages timelines and tracks commitments, but she can't follow every technical thread. She relies on standups for status, but standups are 15-minute summaries of a week's worth of conversations.

Dana opens her morning briefing. The language is plain — technical jargon has been translated. She sees three items in the "Orphaned Actions" section: a commitment made in a thread two days ago to test a network configuration, with no follow-up since. A question from a consultant that's been unanswered for 48 hours. And a topic that was actively discussed last week — the firewall rule migration — that has gone completely quiet for five days, flagged as "Gone Quiet."

Dana adds the orphaned items to her standup agenda. She reaches out to the consultant whose question went unanswered and routes it to the right architect. The "Gone Quiet" flag on the firewall migration turns out to be real — the person responsible got pulled to another workstream and forgot to hand it off. Dana catches it before the migration window closes.

**Capabilities revealed:** Plain-language translation for non-technical users, orphaned action detection, silence detection ("Gone Quiet"), workstream-scoped PM view.

### Journey 4: Marcus — Sales Checking Project Pulse

Marcus is an account executive who needs to stay informed about EOS project health for customer conversations and business development. He doesn't read technical channels — he wouldn't know what half of it means. But he needs to know if things are going well, if there are risks the customer might ask about, and if there are expansion opportunities.

Marcus opens the web dashboard and searches: "how is the VM migration going this week?" The system returns a plain-language summary of migration activity — progress indicators, any flagged risks, and a note that the team is ahead of schedule on the batch migration but behind on the interactive VM workstream. Each point links to the source threads for anyone who wants to verify. Marcus uses this in his customer check-in that afternoon without having to chase down three different people for a status update.

**Capabilities revealed:** Natural language search with plain-language answers, project health signals for non-technical users, source-linked summaries, web dashboard access.

### Journey 5: Shebi — The Admin Setting Up and Operating the System

Shebi is the project lead and sole operator of the Slack Thread Manager. He deploys the system on his OpenShift cluster, configures the four EOS Slack channels for ingestion, and sets up the team roster — mapping 30+ names, Slack handles, and common nicknames to their roles.

A week into operation, Shebi reviews the staging pipeline before the next batch of briefings goes out. The automated blocklist scan flagged two briefings that contain a customer account name. The LLM entity detection caught one additional reference — a project codename that the blocklist missed. Shebi reviews all three, confirms the anonymization corrections, and clears the briefings for delivery. He adds the project codename to the blocklist for future runs.

When a new consultant joins, Shebi adds them to the roster in under a minute. When the team decides to add a fifth Slack channel, he updates the channel configuration. When the silence detection thresholds need tuning — too many false positives on weekends — he adjusts them.

**Capabilities revealed:** Roster management, channel configuration, anonymization staging review (blocklist + LLM + human spot-check), silence threshold tuning, system administration.

### Journey Requirements Summary

| Capability | Journeys |
|-----------|----------|
| Role-filtered daily briefings | Raj, Priya, Dana |
| Cross-workstream thread correlation | Raj |
| Precedent matching | Raj, Priya |
| Backfill / time-travel onboarding | Priya |
| Natural language search with source links | Priya, Marcus |
| Plain-language translation | Dana, Marcus |
| Orphaned action detection | Dana |
| Silence detection ("Gone Quiet") | Dana |
| Web dashboard | Marcus, Shebi |
| Roster management | Shebi, Priya (as recipient) |
| Channel configuration | Shebi |
| Anonymization staging pipeline | Shebi |
| Silence threshold tuning | Shebi |

## Domain-Specific Requirements

### Compliance & Data Governance

- **NDA compliance is the hard boundary** — no customer-identifiable data may appear in any system output (briefings, search results, dashboard views)
- No formal Red Hat data handling policy applies beyond "keep data safe"
- Server infrastructure paid by Red Hat; OpenShift cluster operated solely by Shebi
- No external auditor, compliance certification, or formal security framework required
- No regulatory obligations (GDPR, SOC 2, etc.) apply to this internal tool

### Anonymization Scope

All output content must be scrubbed of:
- Customer company names → replaced with project codename "EOS"
- Customer personnel names and identifiers
- Private/intranet URLs (any non-publicly-accessible URL)
- Account identifiers and customer-specific project codenames
- Infrastructure IPs and internal hostnames

### Data Retention

- System retains processed data for project lifetime (~2 years)
- No formal deletion requirements beyond project conclusion
- Slack source data persists 5 years in Slack — system operates within that window
- No conflict between system retention and source data retention policies

### API & Platform Constraints

- No known Slack ToS or API usage restrictions on data storage and reprocessing
- Read-only bot token — architectural constraint eliminates write-side risk
- Slack API rate limits apply to ingestion (standard bot token tier)

### Operational Governance

- Single operator (Shebi) for all data access, anonymization review, and system tuning
- No formal handoff or delegation process required for V1
- Operational runbooks are a good-practice goal for open-source sustainability, not a compliance requirement
- Bus factor acknowledged and accepted for V1 scope

## Web Application Specific Requirements

### Project-Type Overview

The Slack Thread Manager is a single-page application (SPA) serving as the primary interface for briefing consumption, natural language search, administrative operations, and the anonymization staging review pipeline. The web dashboard is an internal tool accessed exclusively by authenticated Red Hat EOS team members (~30 users), with no public-facing surface. The application prioritizes functional clarity and information density over visual polish, and operates on a batch-driven data model — no real-time features, WebSocket connections, or live-updating UI elements are required.

### Technical Architecture Considerations

**Application Model:** Single Page Application (SPA)
- Client-side routing for seamless navigation between briefing views, search, admin, and staging review screens
- API-driven architecture — SPA consumes a REST API backend that handles all data retrieval and processing
- No server-side rendering required (no SEO, no public access)

**Data Freshness Model:** Batch-aggregated, not real-time
- Thread ingestion and classification run on a scheduled batch cycle
- Briefings are pre-generated artifacts delivered daily — the dashboard reads them, not computes them
- Search indexes are updated after each ingestion batch completes
- Old threads with new activity (replies, reactions, follow-ups) should be flagged as updated and resurfaced in relevant views
- User actions within the dashboard (e.g., staging approvals, feedback flags) are captured during the session and can be aggregated for processing

### Browser Support

| Browser | Minimum Version |
|---------|----------------|
| Chrome | Latest stable |
| Firefox | Latest stable |
| Edge (Chromium) | Latest stable |
| Safari | Latest stable |

- No support for legacy browsers (IE11, pre-Chromium Edge)
- No polyfills or transpilation for older JavaScript runtimes
- Modern CSS features (Grid, Flexbox, custom properties) can be used freely
- Internal tool — browser version can be communicated as a team requirement

### Responsive Design

- Primary target: desktop viewport (team members work on laptops/monitors)
- Tablet-friendly layout is a nice-to-have, not a requirement
- Mobile layout is not required for V1 — briefings are consumed at workstations
- Minimum supported viewport: 1024px width

### Performance Targets

See **Non-Functional Requirements > Performance** for measurable targets. Key context for web app architecture:

- Content is text-centric (thread summaries, briefings, search results) — no heavy media assets
- Bundle size optimization is low priority given internal deployment and modern browsers
- API response time is the primary performance constraint, not client-side rendering

### SEO Strategy

Not applicable — internal tool, no public-facing pages, all routes behind authentication. `robots.txt` should disallow all crawlers as defense-in-depth.

### Accessibility

Deferred to post-V1. V1 follows basic semantic HTML practices (proper heading hierarchy, form labels, button elements) but targets no formal WCAG compliance level. Accessibility audit scoped as a future enhancement.

### Implementation Considerations

- **Authentication:** Specific auth mechanism to be determined in architecture phase (OpenShift OAuth, basic auth, or token-based). See **Non-Functional Requirements > Security** for access control requirements.
- **Role-based views:** The SPA renders different dashboard experiences based on the user's role from the team roster (architect, PM, consultant, sales, training, admin)
- **Admin interface:** Shebi (sole operator) needs screens for roster management, channel configuration, anonymization staging review, silence threshold tuning, and blocklist management
- **Thread update detection:** Previously ingested threads with new activity (replies, reactions, follow-ups) are flagged as "updated" and resurfaced in relevant views

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — prove the knowledge transformation pipeline works and delivers real value to the two personas who feel the pain most acutely (architects and PMs). Validate that daily briefings and natural language search replace Slack scrolling as the default way to recover context.

**Resource Requirements:** Solo developer (Shebi) with AI-agent-driven implementation pipeline. Human effort concentrates on requirements, architecture decisions, quality oversight, and anonymization review. Scale decisions deferred to post-first-feedback.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Raj (Architect) — morning briefing with cross-workstream correlation and source links
- Dana (PM) — plain-language briefing with orphaned actions and silence detection
- Priya (New Consultant) — backfill onboarding and natural language search
- Shebi (Admin) — roster management, channel configuration, anonymization staging, silence threshold tuning

**Must-Have Capabilities:**
- Slack thread ingestion from ~4 EOS project channels (batch polling, read-only)
- Thread classification by topic, workstream, and participant role
- Natural language search with sourced answers linked to original threads
- Role-based daily briefings for architects and PMs
- Silence detector ("Gone Quiet") — passive dashboard for topics that dropped off discussion, with workday-aware thresholds (weekends excluded)
- Team roster: name/handle/nickname-to-role mapping (one-time setup by project lead)
- Anonymization staging pipeline (blocklist + LLM entity detection + human spot-check)
- Slack message history backfill for existing project context
- SPA web dashboard for search, briefing access, silence dashboard, and admin operations
- Thread update detection — old threads with new activity resurfaced in relevant views

### Post-MVP Features (Phase 2 — Growth)

- Briefings expanded to all five personas (consultants, sales, training)
- Precedent matching against past thread resolutions
- Feedback mechanism for architects/PMs to flag and correct hallucinated summaries
- Async + Sync fusion (Slack thread + Gemini standup transcript correlation)
- "Shadow decision" detection (verbal standup commitments with no Slack follow-up)
- Trend Radar — cross-channel topic convergence surfaced as hot topics (e.g., "storage migration is the hottest topic this week across 3 channels")
- Expected-vs-Actual Activity Gap — anomaly detection per workstream flagging both unusual silence and hyperactivity as potential crisis signals

### Phase 3 — Vision (Future)

- Multi-project simultaneous support (instance-per-project architecture)
- Cross-project knowledge sharing and anonymized pattern export
- Multi-source integration (email, Google Docs, meeting transcripts, Red Hat KB)
- Practice Knowledge Exporter — anonymized field learnings for other Red Hat teams
- Migration Pattern Library — structured catalog of recurring VMware-to-OCP-Virt patterns
- Community-driven open-source adoption across Red Hat consulting practice

### Risk Mitigation Strategy

**Technical Risks:**
Knowledge transformation quality on CPU-only LLMs is the critical unknown. If classification and summarization output isn't reliable, the entire value chain collapses. Mitigation: prototype the pipeline on real Slack data before building the full dashboard. Gemini Pro via company license is a known fallback if CPU models prove insufficient for the quality bar.

**Adoption Risks:**
The first 7 days of briefings are the make-or-break window. If output is mediocre, the team writes it off. Mitigation: launch with architects and PMs only (highest-pain personas), iterate on quality based on their direct feedback, and leverage the identified early adopter for social proof and rapid feedback loops.

**Resource Risks:**
Solo developer with ~2 year project horizon. AI-agent-driven development accelerates velocity, but quality iteration on real data is the binding constraint. Mitigation: existing hardware is owned, no external approval gates for V1 infrastructure. Scale and team expansion decisions deferred to post-first-feedback assessment.

## Functional Requirements

### Slack Data Ingestion

- FR1: System can ingest Slack threads from configured project channels using batch polling
- FR2: System can detect and ingest new replies or activity on previously ingested threads
- FR3: System can backfill Slack message history from before the system was deployed
- FR4: System can operate in read-only mode, never posting to or modifying Slack channels

### Knowledge Transformation

- FR5: System can classify ingested threads by topic and workstream
- FR6: System can identify participant roles within threads based on the team roster
- FR7: System can generate plain-language summaries of technical discussions for non-technical personas
- FR8: System can detect cross-workstream connections where the same topic appears across multiple channels
- FR9: System can identify orphaned actions — commitments or questions with no follow-up or resolution

### Daily Briefings

- FR10: System can generate personalized daily briefings filtered by the recipient's role
- FR11: Architects can receive briefings highlighting cross-workstream technical patterns and source-linked thread summaries
- FR12: PMs can receive briefings with plain-language summaries, orphaned actions, and "Gone Quiet" flags
- FR13: Each briefing item can link directly to the original Slack thread as the source of truth
- FR14: New team members can receive a backfill briefing covering activity from before they joined, scoped to their role and workstream

### Search & Discovery

- FR15: Team members can search across the entire thread corpus using natural language queries
- FR16: Search results can include sourced answers with direct links to the original Slack threads
- FR17: Search results can be returned regardless of which channel the original discussion occurred in

### Silence Detection

- FR18: System can detect topics that were actively discussed and then went quiet beyond a configurable threshold
- FR19: PMs can view a "Gone Quiet" dashboard showing topics that have dropped off discussion
- FR20: System can apply workday-aware thresholds that exclude weekends and non-working days from silence calculations
- FR21: Admin can configure silence detection thresholds per workstream

### Anonymization & Data Governance

- FR22: System can automatically scan briefing content against a maintained blocklist of known customer identifiers
- FR23: System can use LLM-assisted entity detection to identify customer references the blocklist might miss
- FR24: Admin can review flagged briefings in a staging interface before they are delivered to team members
- FR25: Admin can approve or reject briefings in the staging pipeline
- FR26: Admin can add new terms to the anonymization blocklist
- FR27: System can replace customer company names, personnel names, private URLs, account identifiers, and infrastructure IPs with anonymized equivalents
- FR28: No briefing or search result can be delivered to team members without passing through the anonymization staging pipeline

### Team & System Administration

- FR29: Admin can create and manage a team roster mapping names, Slack handles, and common nicknames to roles
- FR30: Admin can configure which Slack channels the system monitors for ingestion
- FR31: Admin can add new team members to the roster and assign them roles
- FR32: Admin can modify silence detection thresholds
- FR33: Admin can manage the anonymization blocklist

### Web Dashboard

- FR34: Team members can access the system through a web-based dashboard
- FR35: Team members must authenticate before accessing any system content
- FR36: The dashboard can display different views based on the authenticated user's role
- FR37: Team members can view their daily briefings through the dashboard
- FR38: Team members can perform natural language searches through the dashboard
- FR39: PMs can view the "Gone Quiet" silence detection dashboard
- FR40: Admin can access roster management, channel configuration, anonymization staging, silence threshold tuning, and blocklist management through the dashboard

## Non-Functional Requirements

### Performance

- Batch ingestion pipeline must process a full day's thread volume (~10 threads across ~4 channels) within a single batch cycle window
- Natural language search queries must return sourced results in under 5 seconds
- Daily briefing generation for all active roles must complete before the start of the earliest team member's workday (accounting for India timezone — earliest start)
- SPA initial page load must complete in under 3 seconds
- Client-side navigation between dashboard views must complete in under 500ms
- Anonymization staging pipeline (blocklist scan + LLM entity detection) must complete per briefing within the batch cycle window

### Security

- All dashboard routes must require authentication — no anonymous access to any system content
- All data in transit between the SPA and backend API must be encrypted via HTTPS/TLS
- Encryption at rest is not required for V1 — the OpenShift cluster's existing security posture is sufficient
- Slack bot token must be stored securely and never exposed in client-side code or logs
- The anonymization staging pipeline must gate all output — no briefing or search result reaches users without passing through the pipeline
- System must never write to Slack channels or modify any Slack data (Silent Observer enforcement)
- Admin operations (roster, channel config, anonymization review, blocklist) must be restricted to the admin role

### Integration

- System must integrate with Slack API using a read-only bot token for thread ingestion
- System must handle Slack API rate limits gracefully — retry with backoff, no data loss on throttling
- System must support automatic fallback to Gemini Pro when the primary CPU-only LLM produces output below the quality threshold for classification or summarization
- LLM integration must be abstracted so the underlying model can be swapped without changing the processing pipeline
- Slack API version changes must not silently break ingestion — the system should detect and surface API compatibility issues

### Reliability

- A system outage of up to one day or a weekend is acceptable — no high-availability requirement for V1
- If the system is down during a scheduled briefing cycle, briefings should be generated on the next successful run covering the missed period
- Ingested thread data must not be lost due to application crashes — data persistence must survive process restarts
- The batch ingestion pipeline must be idempotent — re-running a batch must not create duplicate threads or corrupt existing data
