import { useMemo } from 'react';
import { Button, Card, Col, Empty, List, Progress, Row, Skeleton, Space, Statistic, Tag, Typography } from 'antd';
import { ArrowRight, BellRing, FileText, MonitorCog } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { routeDefinitions } from '../config/routes';
import { collectMenuPaths, isAdmin } from '../lib/menus';
import { queryKeys } from '../lib/queryKeys';
import { useAuthStore } from '../stores/useAuthStore';
import { getUnreadCount } from '../features/notifications/api';
import { listAnnouncements } from '../features/announcements/api';
import { getMonitorSnapshot } from '../features/monitoring/api';
import { formatDateTime } from '../utils/format';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const menus = useAuthStore((state) => state.menus);
  const menuPaths = useMemo(() => collectMenuPaths(menus), [menus]);

  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: getUnreadCount,
    staleTime: 30_000,
  });

  const announcementsQuery = useQuery({
    queryKey: queryKeys.announcements.list('INTERNAL', 1, 5),
    queryFn: () => listAnnouncements('INTERNAL', 1, 5),
    staleTime: 60_000,
  });

  const monitorAccess = menuPaths.has('/monitor/server');
  const monitorQuery = useQuery({
    queryKey: queryKeys.monitoring.overview,
    queryFn: () => getMonitorSnapshot(),
    enabled: monitorAccess,
    staleTime: 30_000,
    retry: 0,
  });

  const quickRoutes = useMemo(
    () =>
      routeDefinitions
        .filter((route) => !route.hideInMenu)
        .filter((route) => (route.menuPath ? menuPaths.has(route.menuPath) : !route.adminOnly))
        .filter((route) => route.path !== '/dashboard')
        .slice(0, 8),
    [menuPaths],
  );

  const roleText = user?.roles?.map((role) => role.roleName).join('、') || '—';
  const snapshot = monitorQuery.data;
  const cpu = snapshot?.cpu.data;
  const memory = snapshot?.memory.data;

  return (
    <div className="pageStack">
      <PageHeader
        title={`你好，${user?.nickname || user?.username || '管理员'}`}
        description={`${roleText} · ${user?.dept?.deptName ?? '未分配部门'} · 最近登录 ${formatDateTime(user?.lastLoginTime)}`}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title="未读通知" value={unreadQuery.data ?? 0} suffix="条" loading={unreadQuery.isLoading} />
            <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate('/notifications')}>
              查看通知 <ArrowRight size={14} />
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title="可访问模块" value={quickRoutes.length + 1} suffix="个" />
            <Typography.Text type="secondary">由当前角色菜单决定</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title="登录账号" value={user?.username ?? '—'} />
            <Typography.Text type="secondary">登录 IP：{user?.lastLoginIp ?? '—'}</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card>
            <Statistic title="有效公告" value={announcementsQuery.data?.total ?? 0} suffix="条" loading={announcementsQuery.isLoading} />
            <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate('/announcements')}>
              查看公告 <ArrowRight size={14} />
            </Button>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="快捷入口" extra={<Typography.Text type="secondary">按当前菜单生成</Typography.Text>}>
            {quickRoutes.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前账号暂无其他可访问模块" />
            ) : (
              <Row gutter={[12, 12]}>
                {quickRoutes.map((route) => {
                  const Icon = route.icon;
                  return (
                    <Col xs={12} md={8} key={route.path}>
                      <Button
                        block
                        size="large"
                        style={{ height: 64, justifyContent: 'flex-start' }}
                        onClick={() => navigate(route.path)}
                        icon={Icon ? <Icon size={18} /> : undefined}
                      >
                        {route.label}
                      </Button>
                    </Col>
                  );
                })}
              </Row>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            title="最新站内公告"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/announcements')}>
                全部
              </Button>
            }
          >
            {announcementsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : announcementsQuery.isError ? (
              <Typography.Text type="danger">公告加载失败，请稍后重试。</Typography.Text>
            ) : (announcementsQuery.data?.items.length ?? 0) === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无有效站内公告" />
            ) : (
              <List
                size="small"
                dataSource={announcementsQuery.data?.items ?? []}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="view" type="link" size="small" onClick={() => navigate('/announcements')}>
                        查看
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<FileText size={16} aria-hidden="true" />}
                      title={item.title}
                      description={formatDateTime(item.publishTime)}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="账号信息" extra={<Tag color={isAdmin(user) ? 'blue' : 'default'}>{isAdmin(user) ? 'ADMIN' : '普通账号'}</Tag>}>
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <InfoLine label="用户名" value={user?.username ?? '—'} />
              <InfoLine label="昵称" value={user?.nickname ?? '—'} />
              <InfoLine label="部门" value={user?.dept?.deptName ?? '—'} />
              <InfoLine label="角色" value={roleText} />
              <InfoLine label="手机号" value={user?.phone ?? '—'} />
              <InfoLine label="邮箱" value={user?.email ?? '—'} />
              <Button type="link" style={{ paddingInline: 0 }} onClick={() => navigate('/account/profile')}>
                前往个人中心 <ArrowRight size={14} />
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            title="服务器状态"
            extra={
              monitorAccess ? (
                <Button type="link" size="small" onClick={() => navigate('/monitor/server')}>
                  详情
                </Button>
              ) : undefined
            }
          >
            {!monitorAccess ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前角色未开放服务器监控菜单" />
            ) : monitorQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 4 }} title={false} />
            ) : monitorQuery.isError || !snapshot ? (
              <Space orientation="vertical">
                <Typography.Text type="danger">暂时无法读取主机指标。</Typography.Text>
                <Button size="small" onClick={() => void monitorQuery.refetch()}>重试</Button>
              </Space>
            ) : (
              <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                <InfoLine label="主机" value={snapshot.host.data?.hostname ?? '—'} />
                <div>
                  <Typography.Text type="secondary">CPU 使用率</Typography.Text>
                  <Progress percent={Math.round(cpu?.usagePercent ?? 0)} status={cpu?.usagePercent == null ? 'normal' : 'active'} />
                </div>
                <div>
                  <Typography.Text type="secondary">内存使用率</Typography.Text>
                  <Progress percent={Math.round(memory?.usagePercent ?? 0)} />
                </div>
                <Typography.Text type="secondary">
                  采样时间 {formatDateTime(snapshot.sampledAt)} · 1 分钟负载 {cpu?.load1 ?? '—'}
                </Typography.Text>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      <Card>
        <Space wrap size={16}>
          <Button icon={<BellRing size={16} />} onClick={() => navigate('/notifications')}>我的通知</Button>
          <Button icon={<FileText size={16} />} onClick={() => navigate('/announcements')}>公告</Button>
          {monitorAccess && <Button icon={<MonitorCog size={16} />} onClick={() => navigate('/monitor/server')}>服务器监控</Button>}
          <Link to="/account/change-password">修改登录密码</Link>
        </Space>
      </Card>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', fontSize: 14 }}>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text>{value}</Typography.Text>
    </div>
  );
}
