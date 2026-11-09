import { useAuthStore } from '../stores/useAuthStore';

/** 读取当前用户的权限码，用于显隐操作按钮。 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions);
  return {
    permissions,
    has: (code: string) => permissions.includes(code),
  };
}
