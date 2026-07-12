import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: Record<string, unknown>) => {
    (globalThis as Record<string, unknown>).__helpPageComponent = opts.component;
    return { component: opts.component };
  },
}));

async function getHelpPage() {
  await import('./help.js');
  return (globalThis as Record<string, unknown>).__helpPageComponent as React.ComponentType;
}

describe('HelpPage', () => {
  let HelpPage: React.ComponentType;

  beforeEach(async () => {
    HelpPage = await getHelpPage();
  });

  it('renders the canonical page-frame header with brand-red bottom border', () => {
    const { container } = render(<HelpPage />);
    const header = container.querySelector('.border-b-\\[--color-brand-red\\]');
    expect(header).toBeInTheDocument();
  });

  it('renders "Help & Documentation" as an h1 in the page frame header', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Help & Documentation' })).toBeInTheDocument();
  });

  it('renders the app version badge inside the header', () => {
    const { container } = render(<HelpPage />);
    const header = container.querySelector('.border-b-\\[--color-brand-red\\]');
    expect(header?.textContent).toMatch(/v/);
  });

  it('renders section navigation with accessible label', () => {
    render(<HelpPage />);
    expect(screen.getByRole('navigation', { name: 'Help sections' })).toBeInTheDocument();
  });

  it('shows Overview section content by default', () => {
    render(<HelpPage />);
    expect(screen.getByRole('heading', { name: 'Overview', level: 2 })).toBeInTheDocument();
  });

  it('switches to Getting Started section when nav button is clicked', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);
    await user.click(screen.getByRole('button', { name: 'Getting Started' }));
    expect(
      screen.getByRole('heading', { name: 'Getting Started', level: 2 }),
    ).toBeInTheDocument();
  });

  it('marks the active section nav button with aria-current', async () => {
    const user = userEvent.setup();
    render(<HelpPage />);
    const overviewBtn = screen.getByRole('button', { name: 'Overview' });
    expect(overviewBtn).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Features' }));
    expect(screen.getByRole('button', { name: 'Features' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('renders the mobile section <select> for small viewports', () => {
    render(<HelpPage />);
    expect(screen.getByRole('combobox', { name: 'Select help section' })).toBeInTheDocument();
  });

  it('sets document.title to "Help — Slack Thread Manager"', () => {
    render(<HelpPage />);
    expect(document.title).toBe('Help — Slack Thread Manager');
  });
});
