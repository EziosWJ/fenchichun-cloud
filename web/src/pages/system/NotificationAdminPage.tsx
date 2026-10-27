import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Radio, Select, Space, Typography } from 'antd';
import { Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { listAdminNotifications, publishNotification } from '../../features/notifications/api';
import { listUsers } from '../../features/users/api';
import type { NotificationPublishInput, NotificationRecord } from '../../types/messages';
import type { ColumnsType } from 'antd/es/table';

interface PublishFormValues {
  title: string;
  content: string;
  jumpPath?: string;
  target: 'all' | 'selected';
  userIds?: number[];
}

export default function NotificationAdminPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form] = Form.useForm<PublishFormValues>();

  const historyQuery = useQuery({
    queryKey: queryKeys.notifications.admin({ page, pageSize }),
    queryFn: () => listAdminNotifications({ page, pageSize }),
  });
  const usersQuery = useQuery({
    queryKey: queryKeys.users.list({ page: 1, pageSize: 500, status: 1 }),
    queryFn: () => listUsers({ page: 1, pageSize: 500, status: 1 }),
  });

  const publishMutation = useMutation({
    mutationFn: (values: PublishFormValues) => {
      const input: NotificationPublishInput = {
        title: values.title,
        content: values.content,
        jumpPath: values.jumpPath || undefined,
        allUsers: values.target === 'all',
        userIds: values.target === 'all' ? [] : values.userIds ?? [],
      };
      return publishNotification(input);
    },
    onSuccess: () => {
      message.success('通知已发布');
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const columns: ColumnsType<NotificationRecord> = [
    { title: '标题', dataIndex: 'title' },
    {
      title: '来源',
      dataIndex: 'sourceType',
      width: 130,
      render: (value: string) => (value === 'ROLE_CHANGE' ? '角色变更' : value === 'BUSINESS' ? '业务通知' : '管理员发布'),
    },
    {
      title: '接收 / 已读',
      key: 'read',
      width: 130,
      render: (_, record) => `${record.recipientCount ?? 0} / ${record.readCount ?? 0}`,
    },
    { title: '发布时间', dataIndex: 'publishTime', width: 180, render: (value) => formatDateTime(value) },
  ];

  return (
    <div className="pageStack">
      <PageHeader title="通知管理" description="向启用用户发布站内通知，并查看接收与已读情况。该页面仅对 ADMIN 角色开放。" />

      <Card title="发布通知">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="通知发布后立即对目标用户可见；接收范围以发布时已启用的用户为准。"
        />
        <Form<PublishFormValues>
          form={form}
          layout="vertical"
          initialValues={{ target: 'all' }}
          onFinish={(values) => publishMutation.mutate(values)}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: '请输入标题' }]}>
            <Input maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, whitespace: true, message: '请输入正文' }]}>
            <Input.TextArea rows={5} maxLength={100000} showCount />
          </Form.Item>
          <Form.Item name="jumpPath" label="跳转路径" rules={[{ pattern: /^\/(?!\/)/, message: '请输入以 / 开头的站内路径' }]} extra="可选，例如 /system/user。只允许站内路径。">
            <Input maxLength={1000} placeholder="/system/user" />
          </Form.Item>
          <Form.Item name="target" label="接收范围">
            <Radio.Group>
              <Radio value="all">发布时全部启用用户</Radio>
              <Radio value="selected">指定用户</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.target !== next.target}>
            {({ getFieldValue }) =>
              getFieldValue('target') === 'selected' ? (
                <Form.Item name="userIds" label="选择用户" rules={[{ required: true, type: 'array', min: 1, message: '请选择至少一个用户' }]}>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    loading={usersQuery.isLoading}
                    maxTagCount="responsive"
                    options={(usersQuery.data?.items ?? []).map((user) => ({
                      value: user.id,
                      label: `${user.nickname || user.username}（${user.username}）`,
                    }))}
                    placeholder="搜索并选择启用用户"
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" icon={<Send size={16} />} loading={publishMutation.isPending}>
              立即发布
            </Button>
            <Typography.Text type="secondary">发布操作会写入操作审计日志。</Typography.Text>
          </Space>
        </Form>
      </Card>

      {historyQuery.isError && <Alert type="error" showIcon title="通知历史加载失败" description={getApiErrorMessage(historyQuery.error)} />}

      <DataTable<NotificationRecord>
        tableKey="system-notification-history"
        title="发布历史"
        columns={columns}
        dataSource={historyQuery.data?.items ?? []}
        rowKey="id"
        total={historyQuery.data?.total}
        page={page}
        pageSize={pageSize}
        onPageChange={(nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); }}
        loading={historyQuery.isLoading}
        onRefresh={() => void historyQuery.refetch()}
        refreshing={historyQuery.isFetching}
      />
    </div>
  );
}
