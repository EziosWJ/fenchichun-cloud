import { useCallback, useEffect, useMemo, useRef, useState, type Key, type ReactNode } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Dropdown,
  Empty,
  Popover,
  Segmented,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableColumnsType,
  type TableProps,
} from 'antd';
import { Columns3, RefreshCw, Rows3 } from 'lucide-react';
import type { SortOrder } from '../types/api';
import {
  loadTablePreferences,
  saveTablePreferences,
  TABLE_DENSITY_LABELS,
  type SelectionMode,
  type TableDensity,
  type TablePreferences,
} from '../utils/tablePreferences';
import styles from './DataTable.module.css';

const DENSITY_TO_SIZE: Record<TableDensity, 'small' | 'middle' | 'large'> = {
  compact: 'small',
  default: 'middle',
  comfortable: 'large',
};

function columnKeyOf(column: TableColumnsType<unknown>[number], index: number): string {
  if (column.key !== undefined && column.key !== null) return String(column.key);
  if ('dataIndex' in column && typeof column.dataIndex === 'string') return column.dataIndex;
  return `column-${index}`;
}

interface DataTableProps<T extends object> {
  tableKey: string;
  columns: TableColumnsType<T>;
  dataSource: T[];
  rowKey: keyof T | ((row: T) => Key);
  title?: ReactNode;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  sortBy?: string;
  sortOrder?: SortOrder;
  onSortChange?: (sortBy: string | undefined, sortOrder: SortOrder | undefined) => void;
  loading?: boolean;
  toolbarActions?: ReactNode;
  selectable?: boolean;
  batchActions?: (selectedRows: T[]) => ReactNode;
  onSelectionChange?: (selectedRows: T[]) => void;
  selectionResetKey?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  emptyDescription?: ReactNode;
  scrollX?: number | 'max-content';
  size?: TableProps<T>['size'];
  defaultExpandAllRows?: boolean;
}

export function DataTable<T extends object>({
  tableKey,
  columns,
  dataSource,
  rowKey,
  title,
  total,
  page = 1,
  pageSize = 10,
  onPageChange,
  sortBy,
  sortOrder,
  onSortChange,
  loading = false,
  toolbarActions,
  selectable = false,
  batchActions,
  onSelectionChange,
  selectionResetKey,
  onRefresh,
  refreshing = false,
  emptyDescription = '暂无符合条件的数据',
  scrollX = 'max-content',
  size,
  defaultExpandAllRows = false,
}: DataTableProps<T>) {
  const [preferences, setPreferences] = useState<TablePreferences>(() => loadTablePreferences(tableKey));
  const [selectedRows, setSelectedRows] = useState<Map<Key, T>>(new Map());
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    saveTablePreferences(tableKey, preferences);
  }, [preferences, tableKey]);

  useEffect(() => {
    setSelectedRows((current) => (current.size === 0 ? current : new Map()));
  }, [selectionResetKey]);

  const getRowKey = useCallback(
    (row: T): Key => (typeof rowKey === 'function' ? rowKey(row) : (row[rowKey] as Key)),
    [rowKey],
  );

  useEffect(() => {
    if (!selectable || preferences.selectionMode !== 'page') return;
    setSelectedRows((current) => (current.size === 0 ? current : new Map()));
  }, [page, preferences.selectionMode, selectable]);

  useEffect(() => {
    onSelectionChangeRef.current?.(Array.from(selectedRows.values()));
  }, [selectedRows]);

  const columnDescriptors = useMemo(
    () =>
      columns
        .map((column, index) => ({
          key: columnKeyOf(column as TableColumnsType<unknown>[number], index),
          title: column.title,
        }))
        .filter((item) => item.key !== 'actions'),
    [columns],
  );

  const hidden = useMemo(
    () => new Set(preferences.hiddenColumns.filter((key) => columnDescriptors.some((item) => item.key === key))),
    [columnDescriptors, preferences.hiddenColumns],
  );

  const visibleColumnKeys = columnDescriptors.filter((item) => !hidden.has(item.key)).map((item) => item.key);

  const visibleColumns = useMemo(
    () =>
      columns
        .map((column, index) => ({ column, key: columnKeyOf(column as TableColumnsType<unknown>[number], index) }))
        .filter((item) => !hidden.has(item.key))
        .map(({ column, key }) => {
          if (!onSortChange || !column.sorter) return column;
          const active = sortBy === key;
          return {
            ...column,
            sortOrder: active ? (sortOrder === 'asc' ? 'ascend' : 'descend') : null,
          };
        }) as TableColumnsType<T>,
    [columns, hidden, onSortChange, sortBy, sortOrder],
  );

  const handleTableChange: TableProps<T>['onChange'] = (pagination, _filters, sorter) => {
    const nextPage = pagination.current ?? page;
    const nextPageSize = pagination.pageSize ?? pageSize;
    if (nextPage !== page || nextPageSize !== pageSize) {
      onPageChange?.(nextPage, nextPageSize);
    }
    if (onSortChange) {
      const single = Array.isArray(sorter) ? sorter[0] : sorter;
      const nextSortBy = single?.order ? String(single.columnKey) : undefined;
      const nextSortOrder: SortOrder | undefined = single?.order
        ? single.order === 'ascend'
          ? 'asc'
          : 'desc'
        : undefined;
      if (nextSortBy !== sortBy || (nextSortOrder ?? undefined) !== (sortOrder ?? undefined)) {
        onSortChange(nextSortBy, nextSortOrder);
      }
    }
  };

  const handleRowSelectionChange = (keys: Key[], rows: T[]) => {
    setSelectedRows((current) => {
      if (preferences.selectionMode === 'page') {
        return new Map(rows.map((row) => [getRowKey(row), row]));
      }
      const next = new Map(current);
      const currentPageKeys = new Set(dataSource.map(getRowKey));
      currentPageKeys.forEach((key) => {
        if (!keys.includes(key)) next.delete(key);
      });
      rows.forEach((row) => next.set(getRowKey(row), row));
      return next;
    });
  };

  const clearSelection = () => setSelectedRows(new Map());

  const columnMenu = (
    <div className={styles.columnPanel}>
      <Checkbox.Group
        value={visibleColumnKeys}
        onChange={(values) => {
          if (values.length === 0) return;
          setPreferences((current) => ({
            ...current,
            hiddenColumns: columnDescriptors
              .map((item) => item.key)
              .filter((key) => !values.includes(key)),
          }));
        }}
      >
        <Space orientation="vertical" size={6}>
          {columnDescriptors.map((item) => (
            <Checkbox key={item.key} value={item.key}>
              {typeof item.title === 'string' ? item.title : item.key}
            </Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
      <Button
        type="link"
        size="small"
        onClick={() => setPreferences((current) => ({ ...current, hiddenColumns: [] }))}
      >
        恢复默认列
      </Button>
    </div>
  );

  const densityMenu = {
    items: (Object.keys(TABLE_DENSITY_LABELS) as TableDensity[]).map((density) => ({
      key: density,
      label: TABLE_DENSITY_LABELS[density],
    })),
    selectable: true,
    selectedKeys: [preferences.density],
    onClick: ({ key }: { key: string }) =>
      setPreferences((current) => ({ ...current, density: key as TableDensity })),
  };

  const selectedValues = Array.from(selectedRows.values());
  const tableSize = size ?? DENSITY_TO_SIZE[preferences.density];

  return (
    <Card variant="outlined" className={styles.card} styles={{ body: { padding: 0 } }}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTitle}>
          {title && <span className={styles.title}>{title}</span>}
          {typeof total === 'number' && <span className={styles.total}>共 {total} 条</span>}
        </div>
        <div className={styles.toolbarActions}>
          {toolbarActions}
          {toolbarActions && <span className={styles.toolbarDivider} aria-hidden="true" />}
          <Space size={2}>
            {onRefresh && (
              <Tooltip title="刷新列表">
                <Button
                  type="text"
                  className={styles.iconButton}
                  aria-label="刷新列表"
                  icon={<RefreshCw size={16} aria-hidden="true" />}
                  loading={refreshing}
                  onClick={onRefresh}
                />
              </Tooltip>
            )}
            <Dropdown menu={densityMenu} trigger={['click']}>
              <Tooltip title={`表格密度：${TABLE_DENSITY_LABELS[preferences.density]}`}>
                <Button
                  type="text"
                  className={styles.iconButton}
                  aria-label="调整表格密度"
                  icon={<Rows3 size={16} aria-hidden="true" />}
                />
              </Tooltip>
            </Dropdown>
            <Popover
              content={columnMenu}
              title={`列设置（${visibleColumnKeys.length}/${columnDescriptors.length}）`}
              trigger="click"
              placement="bottomRight"
            >
              <Tooltip title="列设置">
                <Button
                  type="text"
                  className={styles.iconButton}
                  aria-label="选择显示列"
                  icon={<Columns3 size={16} aria-hidden="true" />}
                />
              </Tooltip>
            </Popover>
          </Space>
        </div>
      </div>

      {selectable && selectedValues.length > 0 && (
        <div className={styles.selectionBar}>
          <Space wrap size={8}>
            <Typography.Text role="status" aria-live="polite">
              已选择 {selectedValues.length} 项
            </Typography.Text>
            <Segmented
              size="small"
              aria-label="选择范围"
              value={preferences.selectionMode}
              onChange={(value) => {
                const mode = value as SelectionMode;
                setPreferences((current) => ({ ...current, selectionMode: mode }));
                if (mode === 'page') {
                  const currentKeys = new Set(dataSource.map(getRowKey));
                  setSelectedRows((current) => {
                    const next = new Map(Array.from(current).filter(([key]) => currentKeys.has(key)));
                    return next;
                  });
                }
              }}
              options={[
                { label: '本页', value: 'page' },
                { label: '跨页', value: 'all' },
              ]}
            />
            <Button type="link" size="small" onClick={clearSelection}>
              清除选择
            </Button>
          </Space>
          {batchActions && (
            <>
              <span className={styles.batchDivider} aria-hidden="true" />
              <Space wrap>{batchActions(selectedValues)}</Space>
            </>
          )}
        </div>
      )}

      <Table<T>
        rowKey={rowKey}
        columns={visibleColumns}
        dataSource={dataSource}
        loading={loading}
        size={tableSize}
        onChange={handleTableChange}
        scroll={{ x: scrollX }}
        defaultExpandAllRows={defaultExpandAllRows}
        pagination={
          onPageChange
            ? {
                current: page,
                pageSize,
                total: total ?? dataSource.length,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                responsive: true,
                showLessItems: true,
              }
            : false
        }
        rowSelection={
          selectable
            ? {
                selectedRowKeys: Array.from(selectedRows.keys()),
                onChange: handleRowSelectionChange,
                preserveSelectedRowKeys: preferences.selectionMode === 'all',
                columnWidth: 44,
              }
            : undefined
        }
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />,
        }}
      />
    </Card>
  );
}
