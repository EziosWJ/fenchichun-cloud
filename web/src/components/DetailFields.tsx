import type { ReactNode } from 'react';
import { Descriptions } from 'antd';
import styles from './DetailFields.module.css';

export interface DetailItem {
  key: string;
  label: ReactNode;
  children: ReactNode;
  span?: number | 'filled';
}

interface DetailFieldsProps {
  items: DetailItem[];
  column?: number | Record<string, number>;
  size?: 'small' | 'middle' | 'default';
}

export function DetailFields({ items, column = { xs: 1, sm: 2, xl: 3 }, size = 'middle' }: DetailFieldsProps) {
  return (
    <Descriptions
      bordered
      size={size}
      column={column}
      className={styles.descriptions}
      items={items.map((item) => ({
        key: item.key,
        label: item.label,
        children: item.children,
        span: item.span,
      }))}
    />
  );
}
