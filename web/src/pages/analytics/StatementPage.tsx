import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { useListUrlState } from '../../hooks/useListUrlState';
import { getApiErrorMessage } from '../../lib/api/errors';
import { paths } from '../../config/paths';
import {
  exportStatementParties,
  statementParties,
  type StatementParty,
} from '../../features/analytics/api';
import { materials, sites } from '../../features/weighbridge/api';
import { formatMilliTonne as tonnes, statementDirectionLabels as directionLabels } from '../../features/analytics/format';
import { formatDateTime, formatPercent } from '../../utils/format';
import styles from './StatementPage.module.css';

const config = {
  filters: {
    direction: ['inbound', 'outbound'],
    siteCode: 'text',
    from: 'text',
    to: 'text',
    materialCode: 'text',
  },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

function dateValue(value?: string) {
  return value && dayjs(value).isValid() ? dayjs(value) : null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function StatementPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { state, actions } = useListUrlState(config);
  const initialized = useRef(false);
  const [keyword, setKeyword] = useState(state.keyword);
  const [exporting, setExporting] = useState(false);

  const defaultFrom = dayjs().startOf('month').format('YYYY-MM-DD');
  const defaultTo = dayjs().endOf('month').format('YYYY-MM-DD');
  const direction = state.filters.direction === 'inbound' ? 'inbound' : 'outbound';
  const from = state.filters.from || defaultFrom;
  const to = state.filters.to || defaultTo;

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const next: Record<string, string> = {};
    if (!state.filters.direction) next.direction = 'outbound';
    if (!state.filters.from) next.from = defaultFrom;
    if (!state.filters.to) next.to = defaultTo;
    if (Object.keys(next).length) actions.setFilters(next);
  }, [actions, state.filters.direction, state.filters.from, state.filters.to, defaultFrom, defaultTo]);

  const params = useMemo(
    () => ({
      direction,
      siteCode: state.filters.siteCode || undefined,
      keyword: state.keyword || undefined,
      materialCode: state.filters.materialCode || undefined,
      from,
      to,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [direction, state.filters.siteCode, state.filters.materialCode, state.keyword, from, to, state.page, state.pageSize],
  );

  const list = useQuery({
    queryKey: ['weighbridge', 'statements', params],
    queryFn: () => statementParties(params),
  });
  const sitesQuery = useQuery({ queryKey: ['weighbridge', 'sites'], queryFn: sites });
  const materialsQuery = useQuery({ queryKey: ['weighbridge', 'materials'], queryFn: materials });

  const summary = list.data?.summary;
  const cards = [
    { label: '往来方', value: summary ? String(summary.partyCount) : '—', unit: '家' },
    { label: '有效车次', value: summary ? String(summary.ticketCount) : '—', unit: '车' },
    { label: '毛重合计', value: summary ? tonnes(summary.grossMilliTonne) : '—', unit: '吨' },
    { label: '皮重合计', value: summary ? tonnes(summary.tareMilliTonne) : '—', unit: '吨' },
    { label: '净重调整合计', value: summary ? tonnes(summary.netAdjustmentMilliTonne) : '—', unit: '吨' },
    { label: '最终净重合计', value: summary ? tonnes(summary.netMilliTonne) : '—', unit: '吨' },
  ];

  const setPeriod = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
    actions.setFilters({ from: start.format('YYYY-MM-DD'), to: end.format('YYYY-MM-DD') });
  };

  const reset = () => {
    actions.setFilters({
      direction: 'outbound',
      from: defaultFrom,
      to: defaultTo,
      siteCode: '',
      materialCode: '',
    });
    actions.setKeyword('');
    setKeyword('');
  };

  const exportSummary = async () => {
    setExporting(true);
    try {
      const blob = await exportStatementParties(params);
      downloadBlob(blob, `客户对账-${directionLabels[direction]}-${from}至${to}.csv`);
      message.success('汇总 CSV 已导出');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const openDetail = (row: StatementParty) => {
    const query = new URLSearchParams({
      siteCode: row.siteCode,
      partyCode: row.partyCode,
      direction,
      from,
      to,
    });
    navigate(`${paths.analyticsStatementDetail}?${query.toString()}`);
  };

  const columns: ColumnsType<StatementParty> = [
    {
      title: '厂区',
      key: 'site',
      width: 160,
      render: (_, row) => (
        <div>
          <div>{row.siteName || row.siteCode}</div>
          <Typography.Text type="secondary" className={styles.codeText}>{row.siteCode}</Typography.Text>
        </div>
      ),
    },
    {
      title: '往来方',
      key: 'party',
      width: 240,
      render: (_, row) => (
        <div>
          <div>{row.partyName}</div>
          <Typography.Text type="secondary" className={styles.codeText}>{row.partyCode}</Typography.Text>
        </div>
      ),
    },
    { title: '有效车次', dataIndex: 'ticketCount', key: 'ticketCount', align: 'right', width: 100 },
    { title: '毛重（吨）', key: 'gross', align: 'right', width: 130, render: (_, row) => tonnes(row.grossMilliTonne) },
    { title: '皮重（吨）', key: 'tare', align: 'right', width: 130, render: (_, row) => tonnes(row.tareMilliTonne) },
    { title: '净重调整（吨）', key: 'adjustment', align: 'right', width: 140, render: (_, row) => tonnes(row.netAdjustmentMilliTonne) },
    {
      title: '最终净重（吨）',
      key: 'net',
      align: 'right',
      width: 150,
      render: (_, row) => <Typography.Text strong>{tonnes(row.netMilliTonne)}</Typography.Text>,
    },
    {
      title: '单车平均（吨）',
      key: 'average',
      align: 'right',
      width: 140,
      render: (_, row) => (row.ticketCount ? tonnes(row.netMilliTonne / row.ticketCount) : '—'),
    },
    {
      title: '占比',
      key: 'share',
      align: 'right',
      width: 90,
      render: (_, row) => (summary?.netMilliTonne ? formatPercent((row.netMilliTonne / summary.netMilliTonne) * 100, 2) : '—'),
    },
    {
      title: '首次 / 最后出单',
      key: 'issued',
      width: 190,
      render: (_, row) => (
        <div className={styles.dateText}>
          <div>{formatDateTime(row.firstIssuedAt)}</div>
          <Typography.Text type="secondary">{formatDateTime(row.lastIssuedAt)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, row) => <Button type="link" onClick={() => openDetail(row)}>查看对账单</Button>,
    },
  ];

  return (
    <>
      <PageHeader
        title="客户对账"
        description=""
      />
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="仅统计当前有效单据；作废单不计入，重开单只计新的有效单。日期按出单时间、北京时间归属。"
        />
        <Tabs
          activeKey={direction}
          onChange={(key) => actions.setFilter('direction', key)}
          items={[
            { key: 'outbound', label: '销售客户（出厂装货）' },
            { key: 'inbound', label: '采购供应商（入厂卸货）' },
          ]}
        />
        <Card size="small">
          <div className={styles.filters} role="group" aria-label="客户对账筛选">
            <Input.Search
              className={styles.keyword}
              aria-label="往来方名称或编码"
              placeholder="往来方名称 / 编码"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onSearch={(value) => actions.setKeyword(value)}
              allowClear
            />
            <Select
              className={styles.select}
              aria-label="厂区"
              placeholder="全部厂区"
              allowClear
              value={state.filters.siteCode || undefined}
              onChange={(value) => actions.setFilter('siteCode', value)}
              options={(sitesQuery.data ?? []).map((site) => ({
                value: site.code,
                label: `${site.name}（${site.code}）${site.enabled ? '' : ' · 停用'}`,
              }))}
              loading={sitesQuery.isLoading}
              showSearch
              optionFilterProp="label"
            />
            <Select
              className={styles.select}
              aria-label="物料"
              placeholder="全部物料"
              allowClear
              value={state.filters.materialCode || undefined}
              onChange={(value) => actions.setFilter('materialCode', value)}
              options={(materialsQuery.data ?? []).map((material) => ({
                value: material.code,
                label: [material.name, material.spec, material.code].filter(Boolean).join(' / '),
              }))}
              loading={materialsQuery.isLoading}
              showSearch
              optionFilterProp="label"
            />
            <DatePicker
              className={styles.date}
              aria-label="开始日期"
              placeholder="开始日期"
              format="YYYY-MM-DD"
              allowClear={false}
              value={dateValue(state.filters.from || defaultFrom)}
              onChange={(value) => actions.setFilter('from', value ? value.format('YYYY-MM-DD') : '')}
            />
            <DatePicker
              className={styles.date}
              aria-label="结束日期"
              placeholder="结束日期"
              format="YYYY-MM-DD"
              allowClear={false}
              value={dateValue(state.filters.to || defaultTo)}
              onChange={(value) => actions.setFilter('to', value ? value.format('YYYY-MM-DD') : '')}
            />
            <Space size={4} wrap>
              <Button size="small" onClick={() => setPeriod(dayjs().startOf('month'), dayjs().endOf('month'))}>本月</Button>
              <Button size="small" onClick={() => setPeriod(dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month'))}>上月</Button>
              <Button size="small" onClick={() => setPeriod(dayjs().subtract(2, 'month').startOf('month'), dayjs().endOf('month'))}>近3个月</Button>
              <Button size="small" onClick={() => setPeriod(dayjs().startOf('year'), dayjs().endOf('year'))}>本年</Button>
            </Space>
            <Button className={styles.reset} onClick={reset}>重置</Button>
          </div>
        </Card>
        {list.isError && (
          <Alert
            type="error"
            message={`客户对账加载失败：${getApiErrorMessage(list.error)}`}
            action={<Button onClick={() => void list.refetch()}>重试</Button>}
          />
        )}
        <Row gutter={[16, 16]}>
          {cards.map((card) => (
            <Col xs={24} sm={12} xl={4} key={card.label}>
              <Card size="small">
                <Statistic title={card.label} value={card.value} suffix={card.unit} />
              </Card>
            </Col>
          ))}
        </Row>
        <DataTable
          tableKey="weighbridge-statement-parties"
          rowKey={(row) => `${row.siteCode}:${row.partyCode}`}
          columns={columns}
          dataSource={list.data?.records ?? []}
          total={list.data?.total ?? 0}
          page={state.page}
          pageSize={state.pageSize}
          onPageChange={actions.setPage}
          loading={list.isLoading}
          onRefresh={() => void list.refetch()}
          title="往来方汇总"
          toolbarActions={<Button onClick={() => void exportSummary()} loading={exporting}>导出汇总 CSV</Button>}
          emptyDescription="当前期间没有符合条件的有效过磅单"
        />
      </Space>
    </>
  );
}
