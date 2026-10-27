import { Alert, Button, Card, Col, Descriptions, Empty, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import { RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatBytes, formatDateTime, formatPercent } from '../../utils/format';
import { getMonitorSnapshot } from '../../features/monitoring/api';
import type { DiskMetrics, FilesystemMetrics, NetworkMetrics, Region } from '../../types/monitoring';
import type { ColumnsType } from 'antd/es/table';

function uptimeText(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时 ${minutes} 分钟`;
}

function RegionAlert({ region, name }: { region: Region<unknown>; name: string }) {
  if (region.status === 'ok') return null;
  return (
    <Alert
      type={region.status === 'error' ? 'error' : 'warning'}
      showIcon
      title={`${name}数据状态：${region.status}`}
      description={region.message || '当前没有可用的采集数据。'}
      style={{ marginBottom: 12 }}
    />
  );
}

export default function ServerMonitorPage() {
  const query = useQuery({
    queryKey: queryKeys.monitoring.overview,
    queryFn: () => getMonitorSnapshot(),
    refetchInterval: 30_000,
    retry: 0,
  });

  const snapshot = query.data;
  const cpu = snapshot?.cpu.data;
  const memory = snapshot?.memory.data;
  const host = snapshot?.host.data;

  const filesystemColumns: ColumnsType<FilesystemMetrics> = [
    { title: '挂载点', dataIndex: 'mountpoint', width: 180 },
    { title: '设备', dataIndex: 'device', width: 180 },
    { title: '类型', dataIndex: 'type', width: 110 },
    { title: '总量', dataIndex: 'totalBytes', width: 120, render: (value: number) => formatBytes(value) },
    { title: '已用', dataIndex: 'usedBytes', width: 120, render: (value: number) => formatBytes(value) },
    { title: '可用', dataIndex: 'availableBytes', width: 120, render: (value: number) => formatBytes(value) },
    {
      title: '使用率',
      dataIndex: 'usagePercent',
      width: 180,
      render: (value: number | null) => <Progress percent={Math.round(value ?? 0)} size="small" />,
    },
    { title: '说明', dataIndex: 'message', ellipsis: true, render: (value: string) => value || '—' },
  ];

  const networkColumns: ColumnsType<NetworkMetrics> = [
    { title: '网卡', dataIndex: 'id', width: 130 },
    {
      title: '地址',
      dataIndex: 'addresses',
      width: 220,
      render: (value: { ip: string }[] | null | undefined) => value?.map((item) => item.ip).join(', ') || '—',
    },
    { title: '状态', dataIndex: 'state', width: 100, render: (value: string) => <Tag>{value || '—'}</Tag> },
    { title: '接收速率', dataIndex: 'receiveBytesPerSecond', width: 140, render: (value: number | null) => (value === null ? '—' : `${formatBytes(value)}/s`) },
    { title: '发送速率', dataIndex: 'transmitBytesPerSecond', width: 140, render: (value: number | null) => (value === null ? '—' : `${formatBytes(value)}/s`) },
    { title: '接收总量', dataIndex: 'receiveBytes', width: 130, render: (value: number) => formatBytes(value) },
    { title: '发送总量', dataIndex: 'transmitBytes', width: 130, render: (value: number) => formatBytes(value) },
    { title: '说明', dataIndex: 'message', ellipsis: true, render: (value: string) => value || '—' },
  ];

  const diskColumns: ColumnsType<DiskMetrics> = [
    { title: '磁盘', dataIndex: 'id', width: 140 },
    { title: '读速率', dataIndex: 'readBytesPerSecond', width: 150, render: (value: number | null) => (value === null ? '—' : `${formatBytes(value)}/s`) },
    { title: '写速率', dataIndex: 'writeBytesPerSecond', width: 150, render: (value: number | null) => (value === null ? '—' : `${formatBytes(value)}/s`) },
    { title: '读 IOPS', dataIndex: 'readIops', width: 120, render: (value: number | null) => value ?? '—' },
    { title: '写 IOPS', dataIndex: 'writeIops', width: 120, render: (value: number | null) => value ?? '—' },
    { title: '说明', dataIndex: 'message', ellipsis: true, render: (value: string) => value || '—' },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="服务器监控"
        description="查看 API 所在宿主机的资源指标；每 30 秒自动刷新。"
        extra={
          <Button icon={<RefreshCw size={16} />} loading={query.isFetching} onClick={() => void query.refetch()}>
            立即刷新
          </Button>
        }
      />

      {query.isError && <Alert type="error" showIcon title="监控数据加载失败" description={getApiErrorMessage(query.error)} />}
      {snapshot && snapshot.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`存在 ${snapshot.warnings.length} 条采集告警`}
          description={snapshot.warnings.map((warning) => `${warning.resource}/${warning.device}：${warning.message}`).join('；')}
        />
      )}

      {snapshot && (
        <>
          <Card title="主机信息" extra={<Typography.Text type="secondary">采样时间 {formatDateTime(snapshot.sampledAt)}</Typography.Text>}>
            <RegionAlert region={snapshot.host} name="主机" />
            <Descriptions column={{ xs: 1, sm: 2, xl: 4 }} size="small">
              <Descriptions.Item label="主机名">{host?.hostname ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{host?.os ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="内核">{host?.kernel ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="运行时间">{uptimeText(host?.uptimeSeconds)}</Descriptions.Item>
              <Descriptions.Item label="数据源">{snapshot.sourceId}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card title="CPU">
                <RegionAlert region={snapshot.cpu} name="CPU" />
                {cpu ? (
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <Progress percent={Math.round(cpu.usagePercent ?? 0)} status={cpu.usagePercent === null ? 'normal' : 'active'} />
                    <Typography.Text type="secondary">
                      {cpu.model} · {cpu.logicalCores} 逻辑核心 / {cpu.physicalCores} 物理核心
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      负载：1 分钟 {cpu.load1 ?? '—'} · 5 分钟 {cpu.load5 ?? '—'} · 15 分钟 {cpu.load15 ?? '—'}
                    </Typography.Text>
                    <Space size={4} wrap>
                      {cpu.perCore.map((value, index) => (
                        <Tag key={index}>核心 {index}：{value === null ? '—' : formatPercent(value)}</Tag>
                      ))}
                    </Space>
                  </Space>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 CPU 数据" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="内存">
                <RegionAlert region={snapshot.memory} name="内存" />
                {memory ? (
                  <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                    <Progress percent={Math.round(memory.usagePercent)} status="active" />
                    <Typography.Text type="secondary">
                      已用 {formatBytes(memory.usedBytes)} / 总量 {formatBytes(memory.totalBytes)} · 可用 {formatBytes(memory.availableBytes)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      交换分区：{memory.swapUnsupported ? '不支持' : `${formatBytes(memory.swapUsedBytes)} / ${formatBytes(memory.swapTotalBytes)}`}
                    </Typography.Text>
                  </Space>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内存数据" />
                )}
              </Card>
            </Col>
          </Row>

          <Card title="文件系统">
            <RegionAlert region={snapshot.filesystems} name="文件系统" />
            <Table
              rowKey="id"
              size="small"
              columns={filesystemColumns}
              dataSource={snapshot.filesystems.data ?? []}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无文件系统数据" /> }}
            />
          </Card>

          <Card title="磁盘 I/O">
            <RegionAlert region={snapshot.disks} name="磁盘" />
            <Table
              rowKey="id"
              size="small"
              columns={diskColumns}
              dataSource={snapshot.disks.data ?? []}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无磁盘数据" /> }}
            />
          </Card>

          <Card title="网络">
            <RegionAlert region={snapshot.network} name="网络" />
            <Table
              rowKey="id"
              size="small"
              columns={networkColumns}
              dataSource={snapshot.network.data ?? []}
              pagination={false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无网络数据" /> }}
            />
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card title="GPU">
                <RegionAlert region={snapshot.gpu} name="GPU" />
                {snapshot.gpu.data?.length ? (
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    {snapshot.gpu.data.map((gpu) => (
                      <Card key={gpu.id} size="small">
                        <Typography.Text strong>{gpu.name}</Typography.Text>
                        <Progress percent={Math.round(gpu.usagePercent ?? 0)} size="small" />
                        <Typography.Text type="secondary">
                          显存 {formatBytes(gpu.memoryUsedBytes)} / {formatBytes(gpu.memoryTotalBytes)} · 温度 {gpu.temperatureCelsius ?? '—'} °C · 功耗 {gpu.powerWatts ?? '—'} W
                        </Typography.Text>
                      </Card>
                    ))}
                  </Space>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未检测到 GPU" />
                )}
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title="占用最高的进程">
                <RegionAlert region={snapshot.processes} name="进程" />
                <Row gutter={16}>
                  <Col span={12}>
                    <Typography.Text strong>CPU TOP 5</Typography.Text>
                    {(snapshot.processes.data?.cpu ?? []).slice(0, 5).map((item) => (
                      <div key={`cpu-${item.pid}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span>{item.name}</span>
                        <span>{item.cpuPercent === null ? '—' : formatPercent(item.cpuPercent)}</span>
                      </div>
                    ))}
                  </Col>
                  <Col span={12}>
                    <Typography.Text strong>内存 TOP 5</Typography.Text>
                    {(snapshot.processes.data?.memory ?? []).slice(0, 5).map((item) => (
                      <div key={`mem-${item.pid}`} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                        <span>{item.name}</span>
                        <span>{formatBytes(item.memoryBytes)}</span>
                      </div>
                    ))}
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
