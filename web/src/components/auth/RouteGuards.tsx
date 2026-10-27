import { useMemo, type ReactNode } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { collectMenuPaths, isAdmin } from '../../lib/menus';
import { ForbiddenPage } from '../../pages/ForbiddenPage';

export function MenuAccessGuard({ menuPath, children }: { menuPath: string; children: ReactNode }) {
  const menus = useAuthStore((state) => state.menus);
  const paths = useMemo(() => collectMenuPaths(menus), [menus]);

  if (!paths.has(menuPath)) {
    return (
      <ForbiddenPage
        description="当前账号可访问的菜单中没有这个页面。请联系管理员调整角色菜单后重新登录。"
      />
    );
  }
  return <>{children}</>;
}

export function AdminGuard({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  if (!isAdmin(user)) {
    return <ForbiddenPage description="该页面仅对 ADMIN 角色开放。前端隐藏入口不代表服务端授权，接口仍会按后端既有规则校验。" />;
  }
  return <>{children}</>;
}
