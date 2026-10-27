import { useEffect, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    if (status === 'idle') void bootstrap();
  }, [bootstrap, status]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="routeLoading" aria-live="polite" aria-busy="true">
        <Spin size="large" />
        <span>正在恢复登录状态…</span>
      </div>
    );
  }

  if (status !== 'authenticated') {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return <>{children}</>;
}
