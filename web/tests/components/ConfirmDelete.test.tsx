import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDelete } from '../../src/components/ConfirmDelete';
import { renderWithProviders } from '../utils/renderWithProviders';

describe('ConfirmDelete', () => {
  it('states the target and consequence, and focuses the cancel action', async () => {
    const user = userEvent.setup({ delay: null });
    const onConfirm = vi.fn();
    renderWithProviders(<ConfirmDelete entityName="星云科技" onConfirm={onConfirm} label="删除客户" />);

    await user.click(screen.getByRole('button', { name: '删除客户' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/星云科技/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/删除后不可恢复/)).toBeInTheDocument();

    const cancel = within(dialog).getByRole('button', { name: '取消' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    await user.click(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('runs the confirm callback after the dangerous action', async () => {
    const user = userEvent.setup({ delay: null });
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<ConfirmDelete entityName="星云科技" onConfirm={onConfirm} label="删除客户" />);

    await user.click(screen.getByRole('button', { name: '删除客户' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('删除成功')).toBeInTheDocument();
  });
});
