import type { ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from '../../src/app/AppProviders';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  route?: string;
  path?: string;
  client?: QueryClient;
}

export function renderWithProviders(ui: ReactNode, options: RenderOptions = {}): RenderResult {
  const { route = '/', path, client = createTestQueryClient() } = options;
  return render(
    <AppProviders client={client}>
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </MemoryRouter>
    </AppProviders>,
  );
}
