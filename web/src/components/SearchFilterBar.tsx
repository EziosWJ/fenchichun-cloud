import type { ReactNode } from 'react';
import { Button, Space } from 'antd';
import { RotateCcw, Search } from 'lucide-react';
import styles from './SearchFilterBar.module.css';

interface SearchFilterBarProps {
  children: ReactNode;
  onSubmit: () => void;
  onReset: () => void;
  dirty?: boolean;
  resetLabel?: string;
}

export function SearchFilterBar({
  children,
  onSubmit,
  onReset,
  dirty = false,
  resetLabel = '重置',
}: SearchFilterBarProps) {
  return (
    <form
      className={styles.bar}
      role="search"
      aria-label="搜索与筛选"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.fields}>{children}</div>
      <div className={styles.actions}>
        {dirty && (
          <span className={styles.dirtyHint} role="status">
            条件已修改，点击查询生效
          </span>
        )}
        <Space size={8} className={styles.buttons}>
          <Button type="primary" htmlType="submit" icon={<Search size={15} aria-hidden="true" />}>
            查询
          </Button>
          <Button icon={<RotateCcw size={15} aria-hidden="true" />} onClick={onReset}>
            {resetLabel}
          </Button>
        </Space>
      </div>
    </form>
  );
}
