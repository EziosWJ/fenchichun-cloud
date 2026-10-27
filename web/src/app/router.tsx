import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Spin } from 'antd';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { env } from '../config/env';
import { routeDefinitions, type AppRouteDefinition } from '../config/routes';
import AppLayout from '../layouts/AppLayout';
import { RequireAuth } from '../components/auth/RequireAuth';
import { AdminGuard, MenuAccessGuard } from '../components/auth/RouteGuards';
import LoginPage from '../pages/LoginPage';

const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));
const RouteErrorPage = lazy(() => import('../pages/RouteErrorPage'));
const ForbiddenPage = lazy(() => import('../pages/ForbiddenPage'));

function PageFallback() {
  return (
    <div className="routeLoading" aria-live="polite" aria-busy="true">
      <Spin size="large" />
      <span>页面加载中…</span>
    </div>
  );
}

function lazyElement(Component: ComponentType): ReactNode {
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

function guardedElement(definition: AppRouteDefinition): ReactNode {
  let element: ReactNode = lazyElement(definition.component);
  if (definition.adminOnly) {
    element = <AdminGuard>{element}</AdminGuard>;
  } else if (definition.menuPath) {
    element = <MenuAccessGuard menuPath={definition.menuPath}>{element}</MenuAccessGuard>;
  }
  return element;
}

function toRouteObject(definition: AppRouteDefinition): RouteObject {
  const element = guardedElement(definition);
  return {
    path: definition.path.replace(/^\//, ''),
    element,
    handle: { title: definition.title, label: definition.label },
  };
}

export function createAppRouter() {
  return createBrowserRouter(
    [
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        errorElement: lazyElement(RouteErrorPage),
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          ...routeDefinitions.map(toRouteObject),
          { path: 'forbidden', element: lazyElement(ForbiddenPage) },
          { path: '*', element: lazyElement(NotFoundPage) },
        ],
      },
    ],
    { basename: env.basePath === '/' ? undefined : env.basePath },
  );
}

const appRouter = createAppRouter();

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}
