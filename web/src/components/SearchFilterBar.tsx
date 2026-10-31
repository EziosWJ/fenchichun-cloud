import { useId, type ReactNode } from 'react';
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

interface FilterFieldProps {
  label: string;
  children: ReactNode;
  wide?: boolean;
  date?: boolean;
}

/** 为筛选控件提供持久可见标签，避免选中值后只靠 placeholder 识别字段含义。 */
export function FilterField({ label, children, wide = false, date = false }: FilterFieldProps) {
  return (
    <div
      className={[styles.field, wide ? styles.fieldWide : '', date ? styles.fieldDate : '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

export function SearchFilterBar({
  children,
  onSubmit,
  onReset,
  dirty = false,
  resetLabel = '重置',
}: SearchFilterBarProps) {
  const hintId = useId();

  return (
    <form
      className={styles.bar}
      role="search"
      aria-label="搜索与筛选"
      aria-describedby={dirty ? hintId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className={styles.fields}>{children}</div>
      <div className={styles.actions}>
        {dirty && (
          <span id={hintId} className={styles.dirtyHint} role="status">
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
