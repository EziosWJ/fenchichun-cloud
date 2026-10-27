import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { Download, Eye, Plus, Upload as UploadIcon } from 'lucide-react';
import type { UploadFile } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { SearchFilterBar } from '../../components/SearchFilterBar';
import { DataTable } from '../../components/DataTable';
import { StatusTag } from '../../components/StatusTag';
import { ENABLED_STATUS_OPTIONS } from '../../config/options';
import { commonMessages } from '../../config/messages';
import { useListUrlState } from '../../hooks/useListUrlState';
import { useListDraft } from '../../hooks/useListDraft';
import { queryKeys } from '../../lib/queryKeys';
import { getApiErrorMessage } from '../../lib/api/errors';
import { getAssetBlob } from '../../lib/api/client';
import { formatDateTime, formatFileSize } from '../../utils/format';
import {
  deleteFile,
  deleteFiles,
  downloadFile,
  listFiles,
  setFileStatus,
  updateFile,
  uploadFiles,
} from '../../features/files/api';
import type { FileRecord } from '../../types/files';
import type { ColumnsType } from 'antd/es/table';

const listConfig = {
  filters: { originalName: 'text', businessModule: 'text', mimeType: 'text', status: ['0', '1'] },
  sortKeys: [],
  pageSizeOptions: [10, 20, 50, 100],
  defaultPageSize: 10,
} as const;

interface FileMetaValues {
  businessModule?: string;
  remark?: string;
}

const MAX_BATCH_FILES = 20;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_BATCH_BYTES = 200 * 1024 * 1024;

export default function FilesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const { state, actions } = useListUrlState(listConfig);
  const { draft, setKeyword, setFilter, reset } = useListDraft(state.keyword, state.filters);
  const [selectedRows, setSelectedRows] = useState<FileRecord[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadList, setUploadList] = useState<UploadFile[]>([]);
  const [uploadMeta, setUploadMeta] = useState<FileMetaValues>({});
  const [editRecord, setEditRecord] = useState<FileRecord | null>(null);
  const [preview, setPreview] = useState<{ record: FileRecord; url: string; text?: string } | null>(null);
  const [editForm] = Form.useForm<FileMetaValues>();

  const query = useMemo(
    () => ({
      page: state.page,
      pageSize: state.pageSize,
      originalName: state.filters.originalName || undefined,
      businessModule: state.filters.businessModule || undefined,
      mimeType: state.filters.mimeType || undefined,
      status: state.filters.status === '0' ? (0 as const) : state.filters.status === '1' ? (1 as const) : undefined,
    }),
    [state],
  );

  const filesQuery = useQuery({ queryKey: queryKeys.files.list(query), queryFn: () => listFiles(query) });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.files.all });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const rawFiles = uploadList
        .map((item) => item.originFileObj)
        .filter(Boolean) as File[];
      if (rawFiles.length === 0) throw new Error('请选择要上传的文件');
      if (rawFiles.length > MAX_BATCH_FILES) throw new Error(`一次最多上传 ${MAX_BATCH_FILES} 个文件`);
      if (rawFiles.some((file) => file.size > MAX_FILE_BYTES)) throw new Error('单个文件不能超过 50 MiB');
      if (rawFiles.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) throw new Error('批次总大小不能超过 200 MiB');
      return uploadFiles(rawFiles, uploadMeta);
    },
    onSuccess: (result) => {
      const failed = result.failed?.length ?? 0;
      if (failed > 0) {
        message.warning(`上传完成：成功 ${result.succeeded.length} 个，失败 ${failed} 个`);
      } else {
        message.success(`已上传 ${result.succeeded.length} 个文件`);
      }
      setUploadList([]);
      setUploadOpen(false);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 0 | 1 }) => setFileStatus(id, status),
    onSuccess: () => {
      message.success('状态已更新');
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteFiles(ids),
    onSuccess: () => {
      message.success(commonMessages.deleted);
      setSelectedRows([]);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: FileMetaValues }) => updateFile(id, values),
    onSuccess: () => {
      message.success(commonMessages.updated);
      setEditRecord(null);
      invalidate();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const handleDownload = async (record: FileRecord) => {
    try {
      const blob = await downloadFile(record.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = record.originalName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  const handlePreview = async (record: FileRecord) => {
    try {
      const blob = await getAssetBlob(record.accessUrl);
      const url = URL.createObjectURL(blob);
      if (record.mimeType.startsWith('text/')) {
        const text = await blob.text();
        setPreview({ record, url, text: text.slice(0, 20_000) });
      } else {
        setPreview({ record, url });
      }
    } catch (error) {
      message.error(getApiErrorMessage(error));
    }
  };

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const columns: ColumnsType<FileRecord> = [
    { title: '文件名', dataIndex: 'originalName', width: 260, ellipsis: true },
    { title: '类型', dataIndex: 'mimeType', width: 200, ellipsis: true, render: (value, record) => <Space size={4}><Tag>{record.extension || '—'}</Tag><span>{value}</span></Space> },
    { title: '大小', dataIndex: 'fileSize', width: 110, render: (value: number) => formatFileSize(value) },
    { title: '业务模块', dataIndex: 'businessModule', width: 140, render: (value) => value || '—' },
    { title: '备注', dataIndex: 'remark', width: 180, ellipsis: true, render: (value) => value || '—' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 140,
      render: (value: 0 | 1, record) => (
        <Space size={6}>
          <Switch
            size="small"
            checked={value === 1}
            aria-label={`切换文件 ${record.originalName} 状态`}
            loading={statusMutation.isPending}
            onChange={(checked) => statusMutation.mutate({ id: record.id, status: checked ? 1 : 0 })}
          />
          <StatusTag value={value} options={ENABLED_STATUS_OPTIONS} />
        </Space>
      ),
    },
    { title: '上传时间', dataIndex: 'createTime', width: 170, render: (value) => formatDateTime(value) },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right',
      render: (_, record) => (
        <Space size={2} wrap>
          <Button type="link" size="small" icon={<Eye size={14} />} onClick={() => void handlePreview(record)}>预览</Button>
          <Button type="link" size="small" icon={<Download size={14} />} onClick={() => void handleDownload(record)}>下载</Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setEditRecord(record);
              editForm.setFieldsValue({ businessModule: record.businessModule ?? undefined, remark: record.remark ?? undefined });
            }}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() =>
              modal.confirm({
                title: `删除文件“${record.originalName}”`,
                content: '删除后文件列表不再显示该记录，物理内容由后端按既有策略处理。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => deleteMutation.mutateAsync(record.id),
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="pageStack">
      <PageHeader
        title="文件管理"
        description="上传、预览、下载与维护文件元数据。单文件上限 50 MiB，单批次最多 20 个文件。"
        extra={<Button type="primary" icon={<Plus size={16} />} onClick={() => setUploadOpen(true)}>上传文件</Button>}
      />

      <SearchFilterBar
        onSubmit={() =>
          actions.applyFilters(draft.keyword, {
            originalName: draft.filters.originalName,
            businessModule: draft.filters.businessModule,
            mimeType: draft.filters.mimeType,
            status: draft.filters.status,
          })
        }
        onReset={() => {
          reset();
          actions.reset();
        }}
      >
        <Input allowClear placeholder="文件名" value={draft.filters.originalName ?? ''} onChange={(event) => setFilter('originalName', event.target.value)} style={{ width: 180 }} aria-label="按文件名筛选" />
        <Input allowClear placeholder="业务模块" value={draft.filters.businessModule ?? ''} onChange={(event) => setFilter('businessModule', event.target.value)} style={{ width: 160 }} aria-label="按业务模块筛选" />
        <Input allowClear placeholder="MIME 类型" value={draft.filters.mimeType ?? ''} onChange={(event) => setFilter('mimeType', event.target.value)} style={{ width: 170 }} aria-label="按 MIME 类型筛选" />
        <Select allowClear placeholder="状态" value={draft.filters.status} onChange={(value) => setFilter('status', value)} style={{ width: 120 }} options={ENABLED_STATUS_OPTIONS} aria-label="按状态筛选" />
        <Input allowClear placeholder="关键词" value={draft.keyword} onChange={(event) => setKeyword(event.target.value)} style={{ width: 200 }} aria-label="关键词搜索" />
      </SearchFilterBar>

      {filesQuery.isError && <Alert type="error" showIcon title="文件列表加载失败" description={getApiErrorMessage(filesQuery.error)} />}

      <DataTable<FileRecord>
        tableKey="system-files"
        columns={columns}
        dataSource={filesQuery.data?.items ?? []}
        rowKey="id"
        total={filesQuery.data?.total}
        page={state.page}
        pageSize={state.pageSize}
        onPageChange={(page, pageSize) => actions.setPage(page, pageSize)}
        loading={filesQuery.isLoading}
        selectable
        onSelectionChange={setSelectedRows}
        selectionResetKey={JSON.stringify(query)}
        batchActions={(rows) => (
          <Button
            danger
            disabled={rows.length === 0}
            onClick={() =>
              modal.confirm({
                title: `批量删除 ${rows.length} 个文件`,
                content: '删除后列表不再显示这些记录。',
                okText: '删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: () => batchDeleteMutation.mutateAsync(rows.map((row) => row.id)),
              })
            }
          >
            批量删除
          </Button>
        )}
        onRefresh={() => void filesQuery.refetch()}
        refreshing={filesQuery.isFetching}
        toolbarActions={<Typography.Text type="secondary">已选 {selectedRows.length} 项</Typography.Text>}
      />

      <Modal
        title="上传文件"
        open={uploadOpen}
        width={620}
        onCancel={() => setUploadOpen(false)}
        onOk={() => uploadMutation.mutate()}
        okText="开始上传"
        cancelText="取消"
        confirmLoading={uploadMutation.isPending}
        destroyOnHidden
      >
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Upload.Dragger
            multiple
            fileList={uploadList}
            beforeUpload={() => false}
            onChange={({ fileList }) => setUploadList(fileList)}
            onRemove={(file) => setUploadList((current) => current.filter((item) => item.uid !== file.uid))}
          >
            <p className="ant-upload-drag-icon"><UploadIcon size={28} /></p>
            <p className="ant-upload-text">点击或拖拽文件到此处</p>
            <p className="ant-upload-hint">单文件 ≤ 50 MiB，单批次 ≤ 20 个文件、总量 ≤ 200 MiB</p>
          </Upload.Dragger>
          <Form layout="vertical">
            <Form.Item label="业务模块">
              <Input
                value={uploadMeta.businessModule ?? ''}
                onChange={(event) => setUploadMeta((current) => ({ ...current, businessModule: event.target.value }))}
                placeholder="例如 system"
                maxLength={50}
              />
            </Form.Item>
            <Form.Item label="备注">
              <Input.TextArea
                value={uploadMeta.remark ?? ''}
                onChange={(event) => setUploadMeta((current) => ({ ...current, remark: event.target.value }))}
                rows={2}
                maxLength={500}
                showCount
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      <Modal
        title={`编辑文件：${editRecord?.originalName ?? ''}`}
        open={Boolean(editRecord)}
        onCancel={() => setEditRecord(null)}
        onOk={() => void editForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={editMutation.isPending}
        destroyOnHidden
      >
        <Form<FileMetaValues>
          form={editForm}
          layout="vertical"
          onFinish={(values) => editRecord && editMutation.mutate({ id: editRecord.id, values })}
        >
          <Form.Item name="businessModule" label="业务模块"><Input maxLength={50} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={preview?.record.originalName}
        open={Boolean(preview)}
        width={900}
        footer={<Button onClick={() => setPreview(null)}>关闭</Button>}
        onCancel={() => setPreview(null)}
        destroyOnHidden
      >
        {preview && preview.text !== undefined ? (
          <pre style={{ maxHeight: '60vh', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>{preview.text}</pre>
        ) : preview && preview.record.mimeType.startsWith('image/') ? (
          <img src={preview.url} alt={preview.record.originalName} style={{ maxWidth: '100%', maxHeight: '65vh', display: 'block', margin: '0 auto' }} />
        ) : preview && (preview.record.mimeType === 'application/pdf' || preview.record.extension === 'pdf') ? (
          <iframe src={preview.url} title={preview.record.originalName} style={{ width: '100%', height: '65vh', border: 0 }} />
        ) : (
          <Alert type="info" showIcon title="该文件类型不支持内嵌预览，请使用下载。" />
        )}
      </Modal>
    </div>
  );
}
