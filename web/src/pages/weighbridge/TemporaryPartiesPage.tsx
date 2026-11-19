import { useState } from 'react';
import { Alert, App, Button, Descriptions, Input, Modal, Radio, Select, Space, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/DataTable';
import { FilterField } from '../../components/SearchFilterBar';
import {
  decideTemporaryParty, parties, temporaryParties,
  type PartyIdentities, type TemporaryParty, type TemporaryPartyDecision, type TemporaryPartyStatus,
} from '../../features/weighbridge/api';
import { useListUrlState } from '../../hooks/useListUrlState';
import { ApiError, getApiErrorMessage } from '../../lib/api/errors';

const queryKey = ['weighbridge', 'temporary-parties'];
const identities = [
  ['isSupplier', '供货商'],
  ['isCustomer', '客户'],
  ['isCarrier', '承运商'],
] as const;
const statusLabels = {
  pending: '待确认',
  needs_info: '待补资料',
  merged: '已归并',
  disabled: '已停用',
} satisfies Record<TemporaryPartyStatus, string>;
const statusColors = { pending: 'blue', needs_info: 'gold', merged: 'green', disabled: 'default' };
const statusOptions = [
  { value: 'open', label: '待处理' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
  { value: 'all', label: '全部' },
];
const listConfig = {
  filters: { status: statusOptions.map(({ value }) => value) },
  sortKeys: [],
  defaultPageSize: 10,
  pageSizeOptions: [10, 20, 50],
};
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
});

function identityLabel(party: PartyIdentities) {
  return identities.filter(([field]) => party[field]).map(([, label]) => label).join('、');
}

function canProcess(row: TemporaryParty) {
  return row.status === 'pending' || row.status === 'needs_info';
}

type DecisionStatus = TemporaryPartyDecision['status'];
const decisionLabels: Record<DecisionStatus, string> = {
  merged: '确认归并',
  needs_info: '标记待补资料',
  disabled: '停用临时主体',
};

export default function TemporaryPartiesPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const [keyword, setKeyword] = useState(state.keyword);
  const [selected, setSelected] = useState<TemporaryParty | null>(null);
  const [decision, setDecision] = useState<DecisionStatus>('merged');
  const [formalCode, setFormalCode] = useState<string>();
  const [reason, setReason] = useState('');
  const registrations = useQuery({ queryKey, queryFn: temporaryParties });
  const formalParties = useQuery({
    queryKey: ['weighbridge', 'parties'], queryFn: parties, enabled: !!selected && decision === 'merged',
  });
  const save = useMutation({
    mutationFn: ({ id, input }: { id: number; input: TemporaryPartyDecision }) => decideTemporaryParty(id, input),
    onSuccess: () => {
      message.success('处理结果已保存');
      setSelected(null);
      void client.invalidateQueries({ queryKey: ['weighbridge'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) void registrations.refetch();
    },
  });

  const matches = (registrations.data ?? []).filter((row) => {
    const status = state.filters.status ?? 'open';
    const matchesStatus = status === 'open' ? canProcess(row) : status === 'all' || status === row.status;
    const text = [row.name, row.temporaryCode, row.siteCode, row.siteName, row.formalPartyCode].join(' ').toLowerCase();
    return matchesStatus && text.includes(state.keyword.toLowerCase());
  });
  const latest = registrations.data?.find(({ id }) => id === selected?.id);
  const stale = !!selected && !!latest && (latest.version !== selected.version || !canProcess(latest));
  const candidates = selected ? (formalParties.data ?? []).filter((party) =>
    identities.every(([field]) => !selected[field] || party[field])) : [];
  const formal = candidates.find((party) => party.enabled && party.code === formalCode);
  const sameName = formalParties.data?.some(({ name }) => name.trim() === selected?.name);
  const modalError = save.isError ? getApiErrorMessage(save.error) : undefined;

  const review = (row: TemporaryParty) => {
    save.reset();
    setSelected(row);
    setDecision('merged');
    setFormalCode(undefined);
    setReason(row.reason);
  };
  const columns: TableColumnsType<TemporaryParty> = [
    { title: '发起厂区', key: 'site', render: (_, row) => <>{row.siteName}（{row.siteCode}）</> },
    { title: '临时主体', key: 'party', render: (_, row) => (
      <Space orientation="vertical" size={0}>
        <Typography.Text strong>{row.name}</Typography.Text>
        <Typography.Text type="secondary">{row.temporaryCode}</Typography.Text>
      </Space>
    ) },
    { title: '业务身份', key: 'identities', render: (_, row) => identityLabel(row) },
    { title: '登记版本', dataIndex: 'version' },
    { title: '接收时间', dataIndex: 'receivedAt', render: (value: string) => timeFormat.format(new Date(value)) },
    { title: '状态', key: 'status', render: (_, row) => (
      <Space orientation="vertical" size={0}>
        <Tag color={statusColors[row.status]}>{statusLabels[row.status]}</Tag>
        {row.formalPartyCode && <Typography.Text type="secondary">{row.formalPartyCode}</Typography.Text>}
        {row.reason && <Typography.Text type="secondary">{row.reason}</Typography.Text>}
      </Space>
    ) },
    { title: '操作', key: 'actions', render: (_, row) => canProcess(row)
      ? <Button type="link" aria-label={`核对 ${row.name}`} onClick={() => review(row)}>核对</Button>
      : row.processedAt && timeFormat.format(new Date(row.processedAt)) },
  ];
  const start = (state.page - 1) * state.pageSize;
  return (
    <>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap align="end">
          <FilterField label="主体或厂区" wide>
            <Input.Search aria-label="主体或厂区" placeholder="名称或编码" allowClear
              value={keyword} onChange={(event) => setKeyword(event.target.value)}
              onSearch={(value) => actions.setKeyword(value)} />
          </FilterField>
          <FilterField label="状态">
            <Select aria-label="状态" value={state.filters.status ?? 'open'} options={statusOptions}
              onChange={(value) => actions.setFilter('status', value === 'open' ? undefined : value)} />
          </FilterField>
        </Space>
        {registrations.isError && <Alert type="error" title={getApiErrorMessage(registrations.error)}
          action={<Button onClick={() => void registrations.refetch()}>重试</Button>} />}
        <DataTable tableKey="weighbridge-temporary-parties" columns={columns} rowKey="id"
          dataSource={matches.slice(start, start + state.pageSize)} total={matches.length}
          page={state.page} pageSize={state.pageSize} onPageChange={actions.setPage}
          loading={registrations.isLoading} onRefresh={() => void registrations.refetch()} />
      </Space>
      <Modal title="核对临时主体" open={!!selected} destroyOnHidden width={680} cancelText="取消"
        okText={decisionLabels[decision]} confirmLoading={save.isPending}
        cancelButtonProps={{ disabled: save.isPending }}
        okButtonProps={{
          danger: decision === 'disabled',
          disabled: stale || (decision === 'merged' && (!formal || formalParties.isError)) ||
            (decision === 'needs_info' && !reason.trim()),
        }}
        onCancel={() => { if (!save.isPending) setSelected(null); }}
        onOk={() => {
          if (selected) save.mutate({ id: selected.id, input: {
            version: selected.version, status: decision,
            formalPartyCode: decision === 'merged' ? formal?.code : undefined,
            reason: decision !== 'merged' ? reason.trim() : undefined,
          } });
        }}>
        {selected && (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} items={[
              { key: 'site', label: '发起厂区', children: `${selected.siteName}（${selected.siteCode}）` },
              { key: 'version', label: '登记版本', children: selected.version },
              { key: 'party', label: '临时主体', children: selected.name },
              { key: 'code', label: '临时编码', children: selected.temporaryCode },
              { key: 'nature', label: '主体性质', children: selected.nature === 'enterprise' ? '企业' : '个人' },
              { key: 'identities', label: '业务身份', children: identityLabel(selected) },
            ]} />
            {modalError && <Alert type="error" title={modalError} />}
            {stale && <Alert type="warning" title="登记已更新，请核对最新资料。"
              action={<Button onClick={() => { if (latest && canProcess(latest)) review(latest); else setSelected(null); }}>
                {latest && canProcess(latest) ? '核对最新版' : '返回列表'}
              </Button>} />}
            <FilterField label="处理方式">
              <Radio.Group aria-label="处理方式" value={decision} disabled={save.isPending}
                onChange={(event) => { save.reset(); setDecision(event.target.value); }}>
                <Space wrap>
                  <Radio value="merged">归并到正式主体</Radio>
                  <Radio value="needs_info">待补资料</Radio>
                  <Radio value="disabled">停用</Radio>
                </Space>
              </Radio.Group>
            </FilterField>
            {decision === 'merged' ? (
              <>
                {sameName && <Alert type="warning" title="总部资料中有同名主体，请核实实际业务归属。" />}
                {formalParties.isError && <Alert type="error" title={getApiErrorMessage(formalParties.error)}
                  action={<Button onClick={() => void formalParties.refetch()}>重试</Button>} />}
                {formalParties.isSuccess && !candidates.some(({ enabled }) => enabled) && (
                  <Alert type="warning" title="暂无可归并的正式主体"
                    description="正式主体须已启用，并覆盖临时主体的全部业务身份。" />
                )}
                <FilterField label="拟归并的正式主体">
                  <Select aria-label="拟归并的正式主体" showSearch={{ optionFilterProp: 'label' }}
                    placeholder="搜索正式主体名称或编码" value={formalCode} onChange={setFormalCode}
                    allowClear loading={formalParties.isFetching} disabled={save.isPending}
                    options={candidates.map((party) => ({
                      value: party.code,
                      label: `${party.name}（${party.code}）${party.enabled ? '' : ' · 已停用'}`,
                      disabled: !party.enabled,
                    }))}
                    notFoundContent={formalParties.isFetching ? '正在加载正式主体…' : '没有匹配的正式主体'} />
                </FilterField>
                {formal && <Alert type="info" title={`归并至 ${formal.name}（${formal.code}）`}
                  description={`正式主体业务身份：${identityLabel(formal)}。确认后关联固定。`} />}
              </>
            ) : (
              <>
                {decision === 'disabled' && <Alert type="warning" title="厂端下次同步后，此临时主体将移出新开单候选。" />}
                <FilterField label={decision === 'needs_info' ? '待补资料原因（必填）' : '停用原因（选填）'} wide>
                  <Input.TextArea aria-label="处理原因" value={reason} maxLength={500} rows={3}
                    disabled={save.isPending} onChange={(event) => setReason(event.target.value)} />
                </FilterField>
              </>
            )}
          </Space>
        )}
      </Modal>
    </>
  );
}
