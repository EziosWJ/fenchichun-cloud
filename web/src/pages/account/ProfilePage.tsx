import { useState } from 'react';
import { App, Avatar, Button, Card, Descriptions, Space, Tag, Typography, Upload } from 'antd';
import { RefreshCw, Upload as UploadIcon } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { appConfig } from '../../config/app.config';
import { getApiErrorMessage } from '../../lib/api/errors';
import { formatDateTime } from '../../utils/format';
import { useAuthenticatedBlobUrl } from '../../hooks/useAuthenticatedBlobUrl';
import { useAuthStore } from '../../stores/useAuthStore';
import { updateCurrentAvatar } from '../../features/account/api';
import { uploadFile } from '../../features/files/api';

export default function ProfilePage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const [refreshing, setRefreshing] = useState(false);
  const avatarUrl = useAuthenticatedBlobUrl(user?.avatar);

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await uploadFile(file, { businessModule: 'avatar' });
      await updateCurrentAvatar({ avatar: uploaded.accessUrl });
      return refreshUser();
    },
    onSuccess: () => message.success('头像已更新'),
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
      message.success('账号信息已刷新');
    } catch (error) {
      message.error(getApiErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  const roles = user?.roles?.map((role) => role.roleName).join('、') || '—';

  return (
    <div className="pageStack">
      <PageHeader
        title="个人中心"
        description="查看当前账号资料与登录信息；头像修改会写入操作审计日志。"
        extra={<Button icon={<RefreshCw size={16} />} loading={refreshing} onClick={() => void handleRefresh()}>刷新</Button>}
      />

      <Card>
        <Space size={24} align="start" wrap>
          <Space orientation="vertical" align="center" size={10}>
            {avatarUrl ? (
              <Avatar size={88} src={avatarUrl} alt="当前用户头像" />
            ) : (
              <Avatar size={88} style={{ background: appConfig.brandColor, fontSize: 32 }}>
                {(user?.nickname || user?.username || 'U').slice(0, 1)}
              </Avatar>
            )}
            <Upload
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => {
                if (!file.type.startsWith('image/')) {
                  message.error('请选择图片文件');
                  return Upload.LIST_IGNORE;
                }
                if (file.size > 5 * 1024 * 1024) {
                  message.error('头像不能超过 5 MiB');
                  return Upload.LIST_IGNORE;
                }
                avatarMutation.mutate(file);
                return false;
              }}
            >
              <Button size="small" icon={<UploadIcon size={14} />} loading={avatarMutation.isPending}>
                更换头像
              </Button>
            </Upload>
          </Space>

          <div style={{ flex: 1, minWidth: 320 }}>
            <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="用户名">{user?.username ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="昵称">{user?.nickname ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="部门">{user?.dept?.deptName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="角色">
                <Space size={4} wrap>
                  {user?.roles?.length ? user.roles.map((role) => <Tag key={role.id} color={role.roleCode === 'ADMIN' ? 'blue' : 'default'}>{role.roleName}</Tag>) : '—'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="手机号">{user?.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{user?.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="最近登录时间">{formatDateTime(user?.lastLoginTime)}</Descriptions.Item>
              <Descriptions.Item label="最近登录 IP">{user?.lastLoginIp || '—'}</Descriptions.Item>
              <Descriptions.Item label="角色说明">
                <Typography.Text type="secondary">{roles}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </div>
        </Space>
      </Card>
    </div>
  );
}
