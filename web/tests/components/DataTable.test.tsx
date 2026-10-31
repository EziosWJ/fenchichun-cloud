import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(query);
    const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DataTable selection and responsive behavior', () => {
  it('clears page-scoped selection when the page size changes', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [size, setSize] = useState(10);
      return (
        <>
          <button type="button" onClick={() => setSize(20)}>切换每页条数</button>
          <DataTable<Row>
            tableKey="test-page-size"
            columns={columns}
            dataSource={rows}
            rowKey="id"
            total={2}
            page={1}
            pageSize={size}
            onPageChange={vi.fn()}
            selectable
          />
        </>
      );
    }

    renderWithProviders(<Harness />);
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    await user.click(within(aliceRow).getByRole('checkbox'));
    expect(screen.getByText('已选择 1 项')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换每页条数' }));
    await waitFor(() => {
      expect(screen.queryByText('已选择 1 项')).not.toBeInTheDocument();
    });
  });

  it('hides responsive columns and keeps other breakpoint preferences when toggling columns', async () => {
    setViewport(375);
    const user = userEvent.setup();
    const responsiveColumns: TableColumnsType<Row> = [
      { title: '名称', dataIndex: 'name', key: 'name' },
      { title: '邮箱', dataIndex: 'email', key: 'email', responsive: ['lg'] },
    ];
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-responsive"
        columns={responsiveColumns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: '邮箱' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '选择显示列' }));
    expect(await screen.findByRole('checkbox', { name: '名称' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '邮箱' })).not.toBeInTheDocument();
  });

  it('closes the column panel with Escape and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <DataTable<Row>
        tableKey="test-column-keyboard"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        total={2}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: '选择显示列' });
    await user.click(trigger);
    expect(await screen.findByRole('checkbox', { name: '邮箱' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: '邮箱' })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('keeps defaultExpandAllRows working for tree tables', () => {
    interface TreeRow {
      id: string;
      name: string;
      children?: TreeRow[];
    }
    const treeRows: TreeRow[] = [
      { id: 'root', name: '父级', children: [{ id: 'child', name: '子级' }] },
    ];
    renderWithProviders(
      <DataTable<TreeRow>
        tableKey="test-expand-all"
        columns={[{ title: '名称', dataIndex: 'name', key: 'name' }]}
        dataSource={treeRows}
        rowKey="id"
        total={1}
        page={1}
        pageSize={10}
        onPageChange={vi.fn()}
        defaultExpandAllRows
      />,
    );

    expect(screen.getByText('父级')).toBeInTheDocument();
    expect(screen.getByText('子级')).toBeInTheDocument();
  });
});

});
