import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge.js';

export const Route = createFileRoute('/help')({
  component: HelpPage,
});

type Section = 'overview' | 'getting-started' | 'features' | 'roles' | 'changelog';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'features', label: 'Features' },
  { id: 'roles', label: 'Roles & Permissions' },
  { id: 'changelog', label: 'Changelog' },
];

function HelpPage() {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  useEffect(() => {
    document.title = 'Help — Slack Thread Manager';
  }, []);

  return (
    <div className="flex gap-8">
      <aside className="hidden lg:block w-48 shrink-0">
        <nav aria-label="Help sections" className="sticky top-6">
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                    activeSection === s.id
                      ? 'bg-[--color-gray-20] text-[--color-gray-95] font-medium'
                      : 'text-[--color-gray-50] hover:text-[--color-gray-95] hover:bg-[--color-gray-10]'
                  }`}
                  aria-current={activeSection === s.id ? 'true' : undefined}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-8">
          <h1 className="text-2xl font-medium text-[--color-gray-95]">
            Help & Documentation
          </h1>
          <Badge variant="outline">v{__APP_VERSION__}</Badge>
        </div>

        <div className="lg:hidden mb-6">
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as Section)}
            className="w-full border border-[--color-gray-20] rounded-md px-3 py-2 text-sm bg-white text-[--color-gray-95]"
            aria-label="Select help section"
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="prose max-w-none">
          {activeSection === 'overview' && <OverviewSection />}
          {activeSection === 'getting-started' && <GettingStartedSection />}
          {activeSection === 'features' && <FeaturesSection />}
          {activeSection === 'roles' && <RolesSection />}
          {activeSection === 'changelog' && <ChangelogSection />}
        </div>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <section>
      <h2 className="text-xl font-medium text-[--color-gray-95] mb-4">
        Overview
      </h2>
      <p className="text-sm text-[--color-gray-70] mb-4">
        Slack Thread Manager is an internal tool that passively monitors your
        team's Slack channels, ingests discussion threads, and transforms them
        into actionable knowledge. It delivers personalized daily briefings
        tailored to each team member's role so no one misses critical decisions,
        action items, or cross-workstream connections.
      </p>
      <h3 className="text-base font-medium text-[--color-gray-95] mt-6 mb-3">
        Key Capabilities
      </h3>
      <ul className="list-disc pl-5 text-sm text-[--color-gray-70] space-y-2">
        <li>
          <strong>Silent Observer</strong> — reads Slack channels in read-only
          mode; never posts or modifies any data in Slack.
        </li>
        <li>
          <strong>Daily Briefings</strong> — role-aware summaries highlighting
          decisions, blockers, and action items relevant to you.
        </li>
        <li>
          <strong>Cross-channel Intelligence</strong> — detects when the same
          topic is discussed across multiple channels and surfaces connections.
        </li>
        <li>
          <strong>Semantic Search</strong> — find any past discussion regardless
          of which channel it occurred in.
        </li>
        <li>
          <strong>Silence Detection</strong> — monitors active topics that go
          quiet beyond configurable thresholds.
        </li>
        <li>
          <strong>Content Anonymization</strong> — scrubs customer names, URLs,
          and identifiers before surfacing content.
        </li>
      </ul>
    </section>
  );
}

function GettingStartedSection() {
  return (
    <section>
      <h2 className="text-xl font-medium text-[--color-gray-95] mb-4">
        Getting Started
      </h2>
      <ol className="list-decimal pl-5 text-sm text-[--color-gray-70] space-y-4">
        <li>
          <strong>Sign in</strong> — authenticate with your corporate SSO
          credentials. You'll be redirected to the identity provider
          automatically.
        </li>
        <li>
          <strong>View your Briefing</strong> — the Briefing tab is your landing
          page. Once briefings are generated, you'll see a personalized summary
          of recent Slack activity relevant to your role and workstreams.
        </li>
        <li>
          <strong>Search</strong> — use the Search tab to find past discussions,
          decisions, or action items across all monitored channels.
        </li>
        <li>
          <strong>Admin Setup</strong> (admin only) — configure the system under
          the Admin tab:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>Roster</strong> — add team members with their Slack
              handles, roles, and workstream assignments.
            </li>
            <li>
              <strong>Channels</strong> — configure which Slack channels the
              system monitors and map them to workstreams.
            </li>
            <li>
              <strong>System</strong> — view pipeline health and system status.
            </li>
          </ul>
        </li>
      </ol>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section>
      <h2 className="text-xl font-medium text-[--color-gray-95] mb-4">
        Features
      </h2>

      <div className="space-y-6">
        <div>
          <h3 className="text-base font-medium text-[--color-gray-95] mb-2">
            Daily Briefings
          </h3>
          <p className="text-sm text-[--color-gray-70]">
            Briefings are generated on a schedule and personalized based on your
            role and assigned workstreams. Each briefing highlights new
            decisions, unresolved blockers, detected action items, and topics
            that have gone quiet. Source links take you directly to the original
            Slack threads.
          </p>
        </div>

        <div>
          <h3 className="text-base font-medium text-[--color-gray-95] mb-2">
            Search & Discovery
          </h3>
          <p className="text-sm text-[--color-gray-70]">
            Full-text and semantic search across all ingested threads. Results
            are returned regardless of which channel the discussion occurred in.
            Semantic search understands intent, so you can ask questions
            naturally (e.g., "what was decided about storage classes?").
          </p>
        </div>

        <div>
          <h3 className="text-base font-medium text-[--color-gray-95] mb-2">
            Team Roster
          </h3>
          <p className="text-sm text-[--color-gray-70]">
            Admins manage the team roster mapping display names, emails, Slack
            handles, and common nicknames to roles and workstream assignments.
            The roster drives personalized briefings and role-based access.
          </p>
        </div>

        <div>
          <h3 className="text-base font-medium text-[--color-gray-95] mb-2">
            Channel Configuration
          </h3>
          <p className="text-sm text-[--color-gray-70]">
            Admins configure which Slack channels the system monitors. Each
            channel is mapped to a workstream and can be toggled active or
            inactive to pause ingestion without removing the configuration.
          </p>
        </div>

        <div>
          <h3 className="text-base font-medium text-[--color-gray-95] mb-2">
            Silence Detection
          </h3>
          <p className="text-sm text-[--color-gray-70]">
            The system monitors active discussion topics. When a topic goes
            quiet beyond a configurable threshold (workday-aware), it's flagged
            in briefings so dropped conversations don't slip through the cracks.
          </p>
        </div>
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section>
      <h2 className="text-xl font-medium text-[--color-gray-95] mb-4">
        Roles & Permissions
      </h2>
      <p className="text-sm text-[--color-gray-70] mb-4">
        Access is determined by the role assigned in the team roster. Each role
        receives briefings scoped to their relevant workstreams.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-[--color-gray-20] rounded-md">
          <thead>
            <tr className="bg-[--color-gray-10] border-b border-[--color-gray-20]">
              <th className="text-left px-4 py-2 font-medium text-[--color-gray-95]">
                Role
              </th>
              <th className="text-left px-4 py-2 font-medium text-[--color-gray-95]">
                Briefing
              </th>
              <th className="text-left px-4 py-2 font-medium text-[--color-gray-95]">
                Search
              </th>
              <th className="text-left px-4 py-2 font-medium text-[--color-gray-95]">
                Admin
              </th>
            </tr>
          </thead>
          <tbody className="text-[--color-gray-70]">
            {[
              { role: 'Admin', briefing: true, search: true, admin: true },
              { role: 'Architect', briefing: true, search: true, admin: false },
              { role: 'PM', briefing: true, search: true, admin: false },
              { role: 'Consultant', briefing: true, search: true, admin: false },
              { role: 'Sales', briefing: true, search: true, admin: false },
              { role: 'Training', briefing: true, search: true, admin: false },
            ].map((r) => (
              <tr
                key={r.role}
                className="border-b border-[--color-gray-20] last:border-b-0"
              >
                <td className="px-4 py-2 font-medium">{r.role}</td>
                <td className="px-4 py-2">{r.briefing ? 'Yes' : '—'}</td>
                <td className="px-4 py-2">{r.search ? 'Yes' : '—'}</td>
                <td className="px-4 py-2">{r.admin ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChangelogSection() {
  return (
    <section>
      <h2 className="text-xl font-medium text-[--color-gray-95] mb-4">
        Changelog
      </h2>

      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-base font-medium text-[--color-gray-95]">
              v0.1.0
            </h3>
            <Badge variant="secondary">Current</Badge>
            <span className="text-xs text-[--color-gray-50]">2026-05-07</span>
          </div>
          <p className="text-sm text-[--color-gray-70] mb-2">
            Initial foundation release — project infrastructure, authentication,
            and admin tooling.
          </p>
          <ul className="list-disc pl-5 text-sm text-[--color-gray-70] space-y-1">
            <li>Monorepo scaffold with Turborepo, NestJS API, and React/Vite frontend</li>
            <li>PostgreSQL 17 with Drizzle ORM, migrations, and seed data</li>
            <li>Keycloak OIDC authentication with corporate SSO</li>
            <li>Role-based access control with route guards (6 roles)</li>
            <li>Dashboard shell with responsive navigation</li>
            <li>Team roster management (CRUD with workstream assignments)</li>
            <li>Channel configuration (Slack channel monitoring and workstream mapping)</li>
            <li>Help page with documentation and changelog</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
