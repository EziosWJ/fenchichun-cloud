import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from '../../src/app/AppProviders';
import { createTestQueryClient } from '../utils/renderWithProviders';

function ExplodingView(): never {
  throw new Error('boom');
}

describe('global application error boundary', () => {
  it('renders a safe fallback without exposing the stack', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppProviders client={createTestQueryClient()}>
        <ExplodingView />
      </AppProviders>,
    );

    expect(screen.getByText('应用遇到问题')).toBeInTheDocument();
    expect(screen.getByText(/生产环境不会展示内部堆栈信息/)).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
