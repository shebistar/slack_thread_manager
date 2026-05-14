import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkstreamFilter } from './workstream-filter.js';

describe('WorkstreamFilter', () => {
  const workstreams = ['Platform', 'DevOps', 'Infrastructure'];

  it('renders "All Workstreams" pill plus one pill per workstream', () => {
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText('All Workstreams')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('DevOps')).toBeInTheDocument();
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
  });

  it('marks "All Workstreams" as pressed when selectedWorkstream is null', () => {
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText('All Workstreams')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Platform')).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks selected workstream pill as pressed', () => {
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream="DevOps" onSelect={vi.fn()} />,
    );

    expect(screen.getByText('All Workstreams')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('DevOps')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with workstream name when a pill is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream={null} onSelect={onSelect} />,
    );

    await user.click(screen.getByText('Platform'));

    expect(onSelect).toHaveBeenCalledWith('Platform');
  });

  it('calls onSelect with null when "All Workstreams" is clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream="Platform" onSelect={onSelect} />,
    );

    await user.click(screen.getByText('All Workstreams'));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('has group role with accessible label', () => {
    render(
      <WorkstreamFilter workstreams={workstreams} selectedWorkstream={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('group', { name: /filter by workstream/i })).toBeInTheDocument();
  });

  it('renders focus-visible ring classes for keyboard support', () => {
    render(
      <WorkstreamFilter workstreams={['Test']} selectedWorkstream={null} onSelect={vi.fn()} />,
    );

    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn.className).toContain('focus-visible:ring-2');
    }
  });
});
