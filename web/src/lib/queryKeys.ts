export const queryKeys = {
  auth: {
    user: ['auth', 'user'] as const,
    menus: ['auth', 'menus'] as const,
  },
  users: {
    all: ['system', 'users'] as const,
    list: (query: Record<string, unknown>) => ['system', 'users', 'list', query] as const,
    detail: (id: number) => ['system', 'users', 'detail', id] as const,
  },
  roles: {
    all: ['system', 'roles'] as const,
    list: (query: Record<string, unknown>) => ['system', 'roles', 'list', query] as const,
    options: ['system', 'roles', 'options'] as const,
  },
  menus: {
    all: ['system', 'menus'] as const,
    tree: ['system', 'menus', 'tree'] as const,
  },
  depts: {
    all: ['system', 'depts'] as const,
    tree: ['system', 'depts', 'tree'] as const,
    options: ['system', 'depts', 'options'] as const,
  },
  dicts: {
    all: ['system', 'dicts'] as const,
    types: (query: Record<string, unknown>) => ['system', 'dicts', 'types', query] as const,
    data: (query: Record<string, unknown>) => ['system', 'dicts', 'data', query] as const,
  },
  configs: {
    all: ['system', 'configs'] as const,
    list: (query: Record<string, unknown>) => ['system', 'configs', 'list', query] as const,
  },
  files: {
    all: ['system', 'files'] as const,
    list: (query: Record<string, unknown>) => ['system', 'files', 'list', query] as const,
  },
  logs: {
    loginAll: ['system', 'logs', 'login'] as const,
    login: (query: Record<string, unknown>) => ['system', 'logs', 'login', query] as const,
    operAll: ['system', 'logs', 'oper'] as const,
    oper: (query: Record<string, unknown>) => ['system', 'logs', 'oper', query] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (query: Record<string, unknown>) => ['notifications', 'list', query] as const,
    detail: (id: number) => ['notifications', 'detail', id] as const,
    unread: ['notifications', 'unread'] as const,
    admin: (query: Record<string, unknown>) => ['notifications', 'admin', query] as const,
  },
  announcements: {
    all: ['announcements'] as const,
    list: (scope: string, page: number, pageSize: number) => ['announcements', scope, page, pageSize] as const,
    detail: (scope: string, id: number) => ['announcements', scope, 'detail', id] as const,
    admin: (page: number, pageSize: number) => ['announcements', 'admin', page, pageSize] as const,
  },
  monitoring: {
    overview: ['monitoring', 'overview'] as const,
  },
} as const;
