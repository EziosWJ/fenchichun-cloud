import { Tag } from 'antd';
import styles from './StatusTag.module.css';

export interface StatusTagOption {
  value: string | number;
  label: string;
  color: string;
}

interface StatusTagProps {
  value: string | number;
  options: readonly StatusTagOption[];
}

export function StatusTag({ value, options }: StatusTagProps) {
  const option = options.find((item) => String(item.value) === String(value));
  if (!option) return <Tag variant="outlined" className={styles.tag}>{String(value ?? '—')}</Tag>;
  return (
    <Tag color={option.color} variant="filled" className={styles.tag}>
      <span className={styles.dot} aria-hidden="true" />
      {option.label}
    </Tag>
  );
}
