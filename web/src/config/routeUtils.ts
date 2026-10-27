import { matchPath } from 'react-router-dom';
import { routeDefinitions, type AppRouteDefinition } from './routes';

export interface RouteMatchResult {
  route: AppRouteDefinition;
  params: Record<string, string | undefined>;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function findRouteDefinition(pathname: string): RouteMatchResult | undefined {
  const normalized = normalizePathname(pathname);
  const candidates = [...routeDefinitions].sort((left, right) => right.path.length - left.path.length);
  for (const route of candidates) {
    const match = matchPath({ path: route.path, end: true }, normalized);
    if (match) {
      return { route, params: match.params as Record<string, string | undefined> };
    }
  }
  return undefined;
}

export function findRouteDefinitionByComponent(component: string): AppRouteDefinition | undefined {
  return routeDefinitions.find((route) => route.menuComponent === component);
}

export function fillPathPattern(pattern: string, params: Record<string, string | undefined>): string {
  return pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const value = params[segment.slice(1)];
      return value ? encodeURIComponent(value) : '';
    })
    .join('/');
}

export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const matched = findRouteDefinition(pathname);
  if (!matched) return [{ label: '工作台', href: '/dashboard' }, { label: '页面未找到' }];

  const chain: BreadcrumbItem[] = [];
  let current: AppRouteDefinition | undefined = matched.route;
  const visited = new Set<string>();

  while (current && !visited.has(current.path)) {
    visited.add(current.path);
    chain.unshift({
      label: current.label,
      href: fillPathPattern(current.path, matched.params),
    });
    current = current.parentPath
      ? routeDefinitions.find((route) => route.path === current?.parentPath)
      : undefined;
  }

  if (chain[0]?.label !== '工作台') {
    chain.unshift({ label: '工作台', href: '/dashboard' });
  }

  return chain.map((item, index) =>
    index === chain.length - 1 ? { label: item.label } : { label: item.label, href: item.href },
  );
}

export function getActiveMenuPath(pathname: string): string {
  const matched = findRouteDefinition(pathname);
  if (!matched) return '/dashboard';
  let current: AppRouteDefinition | undefined = matched.route;
  const visited = new Set<string>();
  while (current?.parentPath && !visited.has(current.path)) {
    visited.add(current.path);
    current = routeDefinitions.find((route) => route.path === current?.parentPath) ?? current;
  }
  return current.menuPath ?? current.path;
}

export function getTabLabel(pathname: string): string {
  return findRouteDefinition(pathname)?.route.label ?? '页面未找到';
}

export function getPageTitle(pathname: string): string {
  return findRouteDefinition(pathname)?.route.title ?? '页面未找到';
}

export function getTabKey(pathname: string): string {
  return normalizePathname(pathname);
}
