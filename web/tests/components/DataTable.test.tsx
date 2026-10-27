import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TableColumnsType } from 'antd';
import { DataTable } from '../../src/components/DataTable';
import { renderWithProviders } from '../utils/renderWithProviders';

interface Row {
  id: string;
  name: string;
  email: string;
}

const rows: Row[] = [
  { id: 'r1', name: 'Alice', email: 'alice@example.com' },
  { id: 'r2', name: 'Bob', email: 'bob@example.com' },
];

const columns: TableColumnsType<Row> = [
  { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
  { title: '邮箱', dataIndex: 'email', key: 'email' },
];

describe('DataTable', () => {
  it('renders rows with an explicit row key and sorts through the controlled URL callback', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-sort"
        title="测试列表"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        sortBy={undefined}
        sortOrder={undefined}
        onSortChange={onSortChange}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(screen.getByRole('columnheader', { name: /名称/ }));
    expect(onSortChange).toHaveBeenCalledWith('name', 'asc');
  });

  it('hides and restores configurable columns without removing all columns', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-columns"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('columnheader', { name: '邮箱' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '选择显示列' }));
    const emailToggle = await screen.findByRole('checkbox', { name: '邮箱' });
    await user.click(emailToggle);

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: '邮箱' })).not.toBeInTheDocument();
    });
  });

  it('supports density switching', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-density"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '调整表格密度' }));
    await user.click(await screen.findByText('紧凑'));
    await waitFor(() => {
      expect(document.querySelector('.ant-table-small')).not.toBeNull();
    });
  });

  it('selects rows and exposes selected records to batch actions', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-selection"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        selectable
        onSelectionChange={onSelectionChange}
        batchActions={(selected) => <button type="button">批量处理 {selected.length}</button>}
      />,
    );

    const aliceRow = screen.getByText('Alice').closest('tr')!;
    await user.click(within(aliceRow).getByRole('checkbox'));

    await waitFor(() => {
      expect(screen.getByText('已选择 1 项')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '批量处理 1' })).toBeInTheDocument();
    expect(onSelectionChange).toHaveBeenLastCalledWith([rows[0]]);
  });

  it('requests the next page through the controlled pagination callback', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-pagination"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={25}
        page={1}
        pageSize={10}
        onPageChange={onPageChange}
      />,
    );

    await user.click(screen.getByTitle('2'));
    expect(onPageChange).toHaveBeenCalledWith(2, 10);
  });

  it('shows the configured empty state', () => {
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-empty"
        columns={columns}
        dataSource={[]}
        rowKey="id"
        total={0}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        emptyDescription="没有匹配记录"
      />,
    );

    expect(screen.getByText('没有匹配记录')).toBeInTheDocument();
  });
});
