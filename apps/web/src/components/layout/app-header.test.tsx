import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header.js';

describe('AppHeader', () => {
  const mockUser = {
    sub: 'user-1',
    email: 'shebi@example.com',
    name: 'Shebi',
    role: 'ADMIN' as const,
  };

  it('renders the app title as a span (not h1 — brand, not page heading)', () => {
    const { container } = render(<AppHeader user={mockUser} />);
    expect(screen.getByText('Slack Thread Manager')).toBeInTheDocument();
    expect(container.querySelector('h1')).not.toBeInTheDocument();
    expect(container.querySelector('span')).toBeInTheDocument();
  });

  it('renders the role badge when user has a role', () => {
    render(<AppHeader user={mockUser} />);
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByLabelText('Role: ADMIN')).toBeInTheDocument();
  });

  it('renders app version in the status slot', () => {
    render(<AppHeader user={mockUser} />);
    const versionEl = screen.getByRole('status', { name: 'App version' });
    expect(versionEl).toBeInTheDocument();
    expect(versionEl.textContent).toMatch(/^v/);
  });

  it('renders the brand accent bar', () => {
    const { container } = render(<AppHeader user={mockUser} />);
    const accent = container.querySelector('.bg-\\[--color-brand-red\\]');
    expect(accent).toBeInTheDocument();
  });

  it('renders logout button when onLogout is provided', () => {
    const onLogout = vi.fn();
    render(<AppHeader user={mockUser} onLogout={onLogout} />);
    expect(screen.getByLabelText('Sign out')).toBeInTheDocument();
  });

  it('does not render logout button when onLogout is not provided', () => {
    render(<AppHeader user={mockUser} />);
    expect(screen.queryByLabelText('Sign out')).not.toBeInTheDocument();
  });

  it('calls onLogout when sign out button is clicked', async () => {
    const onLogout = vi.fn();
    render(<AppHeader user={mockUser} onLogout={onLogout} />);
    screen.getByLabelText('Sign out').click();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('uses semantic header element', () => {
    const { container } = render(<AppHeader user={mockUser} />);
    expect(container.querySelector('header')).toBeInTheDocument();
  });

  it('does not render role badge when user is null', () => {
    render(<AppHeader user={null} />);
    expect(screen.queryByText('ADMIN')).not.toBeInTheDocument();
  });
});
