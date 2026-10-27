import { useState } from 'react';
import { Alert, Button, Modal, Segmented, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { getAnnouncement, listAnnouncements } from '../../features/announcements/api';
import type { Announcement, AnnouncementScope } from '../../types/messages';
import type { ColumnsType } from 'antd/es/table';

export default function AnnouncementsPage() {
  const [scope, setScope] = useState<AnnouncementScope>('PUBLIC');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailId, setDetailId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.announcements.list(scope, page, pageSize),
    queryFn: () => listAnnouncements(scope, page, pageSize),
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.announcements.detail(scope, detailId ?? 0),
    queryFn: () => getAnnouncement(scope, detailId!),
    enabled: detailId !== null,
  });

  const columns: ColumnsType<Announcement> = [
    { title: '标题', dataIndex: 'title' },
    { title: '范围', dataIndex: 'scope', width: 120, render: (value: AnnouncementScope) => <Tag>{value === 'PUBLIC' ? '公开公告' : '站内公告'}</Tag> },
    { title: '发布时间', dataIndex: 'publishTime', width: 170, render: (value) => formatDateTime(value) },
    { title: '到期时间', dataIndex: 'expiresAt', width: 170, render: (value) => (value ? formatDateTime(value) : '长期有效') },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => <Button type="link" size="small" onClick={() => setDetailId(record.id)}>查看</Button>,
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="公告"
        description="公开公告无需登录即可查看；站内公告仅登录用户可见。"
        extra={
          <Segmented
            value={scope}
            onChange={(value) => { setScope(value as AnnouncementScope); setPage(1); }}
            options={[
              { value: 'PUBLIC', label: '公开公告' },
              { value: 'INTERNAL', label: '站内公告' },
            ]}
          />
        }
      />

      {listQuery.isError && <Alert type="error" showIcon title="公告加载失败" description={getApiErrorMessage(listQuery.error)} />}

      <DataTable<Announcement>
        tableKey={`announcements-${scope}`}
        columns={columns}
        dataSource={listQuery.data?.items ?? []}
        rowKey="id"
        total={listQuery.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }}
        loading={listQuery.isLoading}
        onRefresh={() => void listQuery.refetch()}
        refreshing={listQuery.isFetching}
      />

      <Modal
        title={detailQuery.data?.title ?? '公告详情'}
        open={detailId !== null}
        onCancel={() => setDetailId(null)}
        width={680}
        destroyOnHidden
        footer={<Button onClick={() => setDetailId(null)}>关闭</Button>}
      >
        {detailQuery.isError ? (
          <Alert type="error" showIcon title="公告详情加载失败" description={getApiErrorMessage(detailQuery.error)} />
        ) : (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              {detailQuery.data?.scope === 'PUBLIC' ? '公开公告' : '站内公告'} · {formatDateTime(detailQuery.data?.publishTime)}
            </Typography.Text>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {detailQuery.data?.content}
            </Typography.Paragraph>
          </Space>
        )}
      </Modal>
    </div>
  );
}
