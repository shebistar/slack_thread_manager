import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>{children}</a>
  ),
  useRouterState: () => ({
    location: { pathname: '/briefings' },
  }),
}));

vi.mock('@/lib/role-layout.js', () => ({
  isAdmin: (user: any) => user?.role === 'ADMIN',
}));

import { NavBar } from './nav-bar.js';

describe('NavBar', () => {
  const adminUser = {
    sub: 'user-1',
    email: 'shebi@example.com',
    name: 'Shebi',
    role: 'ADMIN' as const,
  };

  const regularUser = {
    sub: 'user-2',
    email: 'alex@example.com',
    name: 'Alex',
    role: 'ARCHITECT' as const,
  };

  it('renders Briefing and Search nav items for all users', () => {
    render(<NavBar user={regularUser} />);
    expect(screen.getByText('Briefing')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders Admin nav item only for admin users', () => {
    render(<NavBar user={adminUser} />);
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('does not render Admin nav item for non-admin users', () => {
    render(<NavBar user={regularUser} />);
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('renders 4 nav links for admin user (Briefing, Search, Admin, Help)', () => {
    render(<NavBar user={adminUser} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
  });

  it('renders 3 nav links for non-admin user (Briefing, Search, Help)', () => {
    render(<NavBar user={regularUser} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
  });

  it('uses semantic nav element with aria-label', () => {
    const { container } = render(<NavBar user={regularUser} />);
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'Main navigation');
  });

  it('marks the active route with aria-current', () => {
    render(<NavBar user={regularUser} />);
    const briefingLink = screen.getByText('Briefing');
    expect(briefingLink).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark inactive routes with aria-current', () => {
    render(<NavBar user={regularUser} />);
    const searchLink = screen.getByText('Search');
    expect(searchLink).not.toHaveAttribute('aria-current');
  });

  it('nav links have motion-reduce transition guard alongside transition-colors', () => {
    render(<NavBar user={regularUser} />);
    const briefingLink = screen.getByText('Briefing');
    expect(briefingLink.className).toContain('transition-colors');
    expect(briefingLink.className).toContain('motion-reduce:transition-none');
  });
});
