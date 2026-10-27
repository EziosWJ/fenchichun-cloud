import { useState } from 'react';
import { Alert, App, Button, Card, DatePicker, Form, Input, Modal, Radio, Space, Tag, Typography } from 'antd';
import { Plus } from 'lucide-react';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import {
  listAdminAnnouncements,
  publishAnnouncement,
  saveAnnouncement,
  withdrawAnnouncement,
} from '../../features/announcements/api';
import type { Announcement, AnnouncementScope } from '../../types/messages';
import type { ColumnsType } from 'antd/es/table';

interface AnnouncementFormValues {
  title: string;
  content: string;
  scope: AnnouncementScope;
  expiresAt?: Dayjs | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  WITHDRAWN: '已撤下',
};

export default function AnnouncementAdminPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Announcement | null>(null);
  const [form] = Form.useForm<AnnouncementFormValues>();

  const listQuery = useQuery({
    queryKey: queryKeys.announcements.admin(page, pageSize),
    queryFn: () => listAdminAnnouncements(page, pageSize),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread });
  };

  const saveMutation = useMutation({
    mutationFn: (values: AnnouncementFormValues) =>
      saveAnnouncement(
        {
          title: values.title,
          content: values.content,
          scope: values.scope,
          expiresAt: values.expiresAt ? values.expiresAt.toISOString() : null,
        },
        editing?.id,
      ),
    onSuccess: () => {
      message.success('公告草稿已保存');
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ item, publish }: { item: Announcement; publish: boolean }) =>
      publish ? publishAnnouncement(item.id) : withdrawAnnouncement(item.id),
    onSuccess: (_data, variables) => {
      message.success(variables.publish ? '公告已发布' : '公告已撤下');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ scope: 'INTERNAL' });
    setFormOpen(true);
  };

  const openEdit = (item: Announcement) => {
    setEditing(item);
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      scope: item.scope,
      expiresAt: item.expiresAt ? dayjs(item.expiresAt) : null,
    });
    setFormOpen(true);
  };

  const columns: ColumnsType<Announcement> = [
    { title: '标题', dataIndex: 'title' },
    { title: '范围', dataIndex: 'scope', width: 120, render: (value: AnnouncementScope) => (value === 'PUBLIC' ? <Tag color="orange">公开公告</Tag> : <Tag color="blue">站内公告</Tag>) },
    { title: '状态', dataIndex: 'status', width: 110, render: (value: string) => STATUS_LABEL[value] ?? value },
    { title: '发布时间', dataIndex: 'publishTime', width: 170, render: (value) => formatDateTime(value) },
    { title: '到期时间', dataIndex: 'expiresAt', width: 170, render: (value) => (value ? formatDateTime(value) : '长期有效') },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="link" size="small" onClick={() => setDetail(record)}>查看</Button>
          {record.status === 'DRAFT' && (
            <>
              <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
              <Button
                type="link"
                size="small"
                onClick={() =>
                  modal.confirm({
                    title: `发布公告“${record.title}”`,
                    content: record.scope === 'PUBLIC' ? '公开公告无需登录即可查看，发布后内容不可修改。' : '站内公告仅登录用户可查看，发布后内容不可修改。',
                    okText: '发布',
                    cancelText: '取消',
                    onOk: () => transitionMutation.mutateAsync({ item: record, publish: true }),
                  })
                }
              >
                发布
              </Button>
            </>
          )}
          {record.status === 'PUBLISHED' && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() =>
                modal.confirm({
                  title: `撤下公告“${record.title}”`,
                  content: '撤下后公告不再对访问者可见，内容仍保留在管理历史中。',
                  okText: '撤下',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => transitionMutation.mutateAsync({ item: record, publish: false }),
                })
              }
            >
              撤下
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="公告管理"
        description="公开公告无需登录即可查看，发布前请确认内容适合公开。该页面仅对 ADMIN 角色开放。"
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>新建公告草稿</Button>}
      />

      {listQuery.isError && <Alert type="error" showIcon title="公告历史加载失败" description={getApiErrorMessage(listQuery.error)} />}

      <DataTable<Announcement>
        tableKey="system-announcement-admin"
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
        title={editing ? `编辑公告草稿：${editing.title}` : '新建公告草稿'}
        open={formOpen}
        width={680}
        onCancel={() => setFormOpen(false)}
        onOk={() => void form.submit()}
        okText="保存草稿"
        cancelText="取消"
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form<AnnouncementFormValues> form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true, message: '请输入标题' }]}>
            <Input maxLength={200} showCount />
          </Form.Item>
          <Form.Item name="scope" label="可见范围" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="INTERNAL">站内公告（登录后可见）</Radio>
              <Radio value="PUBLIC">公开公告（无需登录）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true, whitespace: true, message: '请输入正文' }]}>
            <Input.TextArea rows={6} maxLength={100000} showCount />
          </Form.Item>
          <Form.Item name="expiresAt" label="到期时间" extra="留空表示长期有效。">
            <DatePicker showTime style={{ width: '100%' }} disabledDate={(current) => current && current.isBefore(dayjs(), 'day')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detail?.title ?? '公告详情'}
        open={Boolean(detail)}
        onCancel={() => setDetail(null)}
        width={640}
        footer={<Button onClick={() => setDetail(null)}>关闭</Button>}
      >
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {detail?.scope === 'PUBLIC' ? '公开公告' : '站内公告'} · {STATUS_LABEL[detail?.status ?? ''] ?? detail?.status} · {formatDateTime(detail?.publishTime)}
          </Typography.Text>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{detail?.content}</Typography.Paragraph>
        </Space>
      </Modal>

      <Card size="small">
        <Typography.Text type="secondary">
          公开公告可通过 <Typography.Text code>/api/v1/public/announcement/page</Typography.Text> 在登录前读取；站内公告需要登录后访问。
        </Typography.Text>
      </Card>
    </div>
  );
}
