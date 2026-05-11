import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BlocklistFormDialog } from './blocklist-form-dialog.js';
import type { BlocklistEntryResponse } from '@slack-thread-manager/shared';

const mockEntry: BlocklistEntryResponse = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  term: 'Acme Corp',
  replacement: '[COMPANY]',
  category: 'company_name',
  createdAt: '2026-05-01T10:00:00.000Z',
};

describe('BlocklistFormDialog — create mode', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSubmitCreate: vi.fn().mockResolvedValue({}),
  };

  it('renders all fields', () => {
    render(<BlocklistFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Term')).toBeInTheDocument();
    expect(screen.getByLabelText('Replacement')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Entry' })).toBeInTheDocument();
  });

  it('shows validation error for empty term on submit', async () => {
    render(<BlocklistFormDialog {...defaultProps} />);

    const submitBtn = screen.getByRole('button', { name: 'Add Entry' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const errors = screen.getAllByText(/String must contain at least 1/);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    expect(defaultProps.onSubmitCreate).not.toHaveBeenCalled();
  });

  it('calls onSubmitCreate with valid data', async () => {
    render(<BlocklistFormDialog {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Term'), {
      target: { value: 'Acme Corp' },
    });
    fireEvent.change(screen.getByLabelText('Replacement'), {
      target: { value: '[COMPANY]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() => {
      expect(defaultProps.onSubmitCreate).toHaveBeenCalledWith({
        term: 'Acme Corp',
        replacement: '[COMPANY]',
        category: 'company_name',
      });
    });
  });

  it('shows conflict error message on 409', async () => {
    const onSubmitCreate = vi
      .fn()
      .mockRejectedValue(new Error('API 409: conflict'));

    render(
      <BlocklistFormDialog {...defaultProps} onSubmitCreate={onSubmitCreate} />,
    );

    fireEvent.change(screen.getByLabelText('Term'), {
      target: { value: 'Duplicate' },
    });
    fireEvent.change(screen.getByLabelText('Replacement'), {
      target: { value: '[DUP]' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() => {
      expect(
        screen.getByText('A blocklist entry with this term already exists'),
      ).toBeInTheDocument();
    });
  });
});

describe('BlocklistFormDialog — edit mode', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    entry: mockEntry,
    onSubmitUpdate: vi.fn().mockResolvedValue({}),
  };

  it('pre-fills form with entry data', () => {
    render(<BlocklistFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Term')).toHaveValue('Acme Corp');
    expect(screen.getByLabelText('Replacement')).toHaveValue('[COMPANY]');
  });

  it('shows Save Changes button in edit mode', () => {
    render(<BlocklistFormDialog {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });
});

describe('BlocklistFormDialog — prefill mode (staging quick-add)', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    prefill: {
      term: 'Jane Smith',
      category: 'person_name' as const,
      replacement: '[PERSON]',
    },
    onSubmitCreate: vi.fn().mockResolvedValue({}),
  };

  it('pre-fills form with prefill data from staging', () => {
    render(<BlocklistFormDialog {...defaultProps} />);
    expect(screen.getByLabelText('Term')).toHaveValue('Jane Smith');
    expect(screen.getByLabelText('Replacement')).toHaveValue('[PERSON]');
  });

  it('submits prefilled data correctly', async () => {
    render(<BlocklistFormDialog {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }));

    await waitFor(() => {
      expect(defaultProps.onSubmitCreate).toHaveBeenCalledWith({
        term: 'Jane Smith',
        replacement: '[PERSON]',
        category: 'person_name',
      });
    });
  });
});
