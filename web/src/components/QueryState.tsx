import type { ReactNode } from 'react';
import { Button, Empty, Result, Skeleton } from 'antd';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { getApiErrorMessage } from '../lib/api/errors';
import styles from './QueryState.module.css';

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyDescription?: ReactNode;
  emptyExtra?: ReactNode;
  skeletonRows?: number;
  children: ReactNode;
}

export function QueryState({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty = false,
  emptyDescription = '暂无符合条件的数据',
  emptyExtra,
  skeletonRows = 6,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div className={styles.panel} aria-live="polite" aria-busy="true">
        <Skeleton active title={false} paragraph={{ rows: skeletonRows }} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className={styles.panel}>
        <Result
          status="error"
          icon={<TriangleAlert size={44} aria-hidden="true" />}
          title="数据加载失败"
          subTitle={getApiErrorMessage(error)}
          extra={
            onRetry && (
              <Button type="primary" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={onRetry}>
                重新加载
              </Button>
            )
          }
        />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className={styles.panel}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          className={styles.empty}
          description={emptyDescription}
        >
          {emptyExtra}
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
