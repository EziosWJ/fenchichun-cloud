import { useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Space, Tag, Typography } from 'antd';
import { CheckCheck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import {
  getNotification,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../features/notifications/api';
import type { NotificationRecord } from '../../types/messages';
import type { ColumnsType } from 'antd/es/table';

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: '管理员发布',
  ROLE_CHANGE: '角色变更',
  BUSINESS: '业务通知',
};

function safeJumpPath(value?: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default function NotificationsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list({ page, pageSize }),
    queryFn: () => listNotifications({ page, pageSize }),
  });
  const unreadQuery = useQuery({ queryKey: queryKeys.notifications.unread, queryFn: getUnreadCount });
  const detailId = id ? Number(id) : null;
  const detailQuery = useQuery({
    queryKey: queryKeys.notifications.detail(detailId ?? 0),
    queryFn: () => getNotification(detailId!),
    enabled: detailId !== null && Number.isFinite(detailId),
  });

  useEffect(() => {
    if (detailId === null) return;
    void markNotificationRead(detailId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      })
      .catch(() => undefined);
  }, [detailId, queryClient]);

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      message.success('已全部标记为已读');
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const columns: ColumnsType<NotificationRecord> = [
    {
      title: '标题',
      dataIndex: 'title',
      render: (value, record) => (
        <Typography.Text strong={record.isRead === 0}>{value}</Typography.Text>
      ),
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      width: 130,
      render: (value: string) => <Tag>{SOURCE_LABEL[value] ?? value}</Tag>,
    },
    { title: '发布时间', dataIndex: 'publishTime', width: 170, render: (value) => formatDateTime(value) },
    {
      title: '状态',
      dataIndex: 'isRead',
      width: 100,
      render: (value: 0 | 1) => (value === 1 ? <Tag color="default">已读</Tag> : <Tag color="blue">未读</Tag>),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/notifications/${record.id}`)}>
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="我的通知"
        description={`共 ${unreadQuery.data ?? 0} 条未读通知。打开详情即视为已读。`}
        extra={
          <Button
            icon={<CheckCheck size={16} />}
            loading={readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            全部已读
          </Button>
        }
      />

      {listQuery.isError && <Alert type="error" showIcon title="通知加载失败" description={getApiErrorMessage(listQuery.error)} />}

      <DataTable<NotificationRecord>
        tableKey="notifications"
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
        emptyDescription="暂无通知"
      />

      <Modal
        title={detailQuery.data?.title ?? '通知详情'}
        open={detailId !== null}
        onCancel={() => navigate('/notifications')}
        width={680}
        destroyOnHidden
        footer={
          <Space>
            {safeJumpPath(detailQuery.data?.jumpPath) && (
              <Button type="primary" onClick={() => navigate(safeJumpPath(detailQuery.data?.jumpPath)!)}>
                前往相关页面
              </Button>
            )}
            <Button onClick={() => navigate('/notifications')}>关闭</Button>
          </Space>
        }
      >
        {detailQuery.isError ? (
          <Alert type="error" showIcon title="通知详情加载失败" description={getApiErrorMessage(detailQuery.error)} />
        ) : (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              {formatDateTime(detailQuery.data?.publishTime)} · {SOURCE_LABEL[detailQuery.data?.sourceType ?? ''] ?? detailQuery.data?.sourceType}
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
