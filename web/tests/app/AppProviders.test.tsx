import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders, useAppPreferences } from '../../src/app/AppProviders';
import { THEME_STORAGE_KEY } from '../../src/config/theme';
import { createTestQueryClient } from '../utils/renderWithProviders';

function ThemeProbe() {
  const { themeMode, toggleTheme } = useAppPreferences();
  return (
    <button type="button" onClick={toggleTheme}>
      当前主题：{themeMode}
    </button>
  );
}

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

describe('AppProviders theme', () => {
  it('restores a stored dark preference and applies it to the document', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const user = userEvent.setup({ delay: null });
    render(
      <AppProviders client={createTestQueryClient()}>
        <ThemeProbe />
      </AppProviders>,
    );

    expect(screen.getByRole('button', { name: '当前主题：dark' })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: '当前主题：light' })).toBeInTheDocument();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
