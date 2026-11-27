import { useMemo } from 'react';
import { Button, Card, Col, Empty, List, Progress, Row, Skeleton, Space, Tag, Typography } from 'antd';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BellRing,
  Building2,
  FileText,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import { paths } from '../config/paths';
import { routeDefinitions } from '../config/routes';
import { collectMenuPaths, isAdmin } from '../lib/menus';
import { queryKeys } from '../lib/queryKeys';
import { useAuthStore } from '../stores/useAuthStore';
import { getUnreadCount } from '../features/notifications/api';
import { listAnnouncements } from '../features/announcements/api';
import { getMonitorSnapshot } from '../features/monitoring/api';
import { analyticsOverview } from '../features/analytics/api';
import { formatMilliTonne } from '../features/analytics/format';
import { taskSyncStatus } from '../features/weighbridge/api';
import { formatBeijingTime } from '../features/weighbridge/time';
import { formatDateTime, formatNumber } from '../utils/format';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const menus = useAuthStore((state) => state.menus);
  const menuPaths = useMemo(() => collectMenuPaths(menus), [menus]);

  const overviewAccess = menuPaths.has(paths.analyticsOverview);
  const tasksAccess = menuPaths.has(paths.weighbridgeTasks);
  const tripsAccess = menuPaths.has('/grain-intake/trips');
  const ticketsAccess = menuPaths.has(paths.weighbridgeTickets);
  const monitorAccess = menuPaths.has('/monitor/server');

  const monthRange = useMemo(
    () => ({
      from: dayjs().startOf('month').format('YYYY-MM-DD'),
      to: dayjs().endOf('month').format('YYYY-MM-DD'),
    }),
    [],
  );

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

  const overviewQuery = useQuery({
    queryKey: ['analytics', 'overview', 'dashboard', monthRange],
    queryFn: () => analyticsOverview(monthRange),
    enabled: overviewAccess,
    staleTime: 60_000,
    retry: 0,
  });

  const syncSitesQuery = useQuery({
    queryKey: ['weighbridge', 'task-sync-status', 'dashboard'],
    queryFn: taskSyncStatus,
    enabled: tasksAccess,
    staleTime: 60_000,
    retry: 0,
  });

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
        .slice(0, 9),
    [menuPaths],
  );

  const roleText = user?.roles?.map((role) => role.roleName).join('、') || '—';
  const snapshot = monitorQuery.data;
  const cpu = snapshot?.cpu.data;
  const memory = snapshot?.memory.data;
  const summary = overviewQuery.data?.summary;
  const siteStatuses = syncSitesQuery.data ?? [];
  const totalAwaiting = siteStatuses.reduce((sum, item) => sum + (item.awaitingCount ?? 0), 0);
  const todayLabel = dayjs().format('YYYY年MM月DD日 dddd');

  return (
    <div className="pageStack">
      <section className={styles.hero} aria-label="工作台概览">
        <div className={styles.heroMain}>
          <div className={styles.heroEyebrow}>
            <span>{todayLabel}</span>
            <Tag color={isAdmin(user) ? 'volcano' : 'default'} style={{ marginInlineEnd: 0 }}>
              {roleText}
            </Tag>
          </div>
          <h1 className={styles.heroTitle}>你好，{user?.nickname || user?.username || '管理员'}</h1>
          <p className={styles.heroMeta}>
            {user?.dept?.deptName ?? '未分配部门'} · 最近登录 {formatDateTime(user?.lastLoginTime)}
          </p>
        </div>
        <div className={styles.heroActions}>
          {tripsAccess && (
            <Button type="primary" onClick={() => navigate('/grain-intake/trips')}>
              原粮流转单
            </Button>
          )}
          {overviewAccess && (
            <Button onClick={() => navigate(paths.analyticsOverview)}>经营总览</Button>
          )}
          {ticketsAccess && (
            <Button onClick={() => navigate(paths.weighbridgeTickets)}>过磅单查询</Button>
          )}
        </div>
      </section>

      <Row gutter={[16, 16]}>
        {overviewAccess ? (
          <>
            <Col xs={24} sm={12} xl={6}>
              <Card className={styles.kpiCard}>
                <div>
                  <div className={styles.kpiHead}>
                    <span>本月入厂净重</span>
                    <span className={styles.kpiIcon} aria-hidden="true">
                      <ArrowDownToLine size={16} />
                    </span>
                  </div>
                  <div className={styles.kpiValueRow}>
                    <span className={styles.kpiValue}>
                      {overviewQuery.isLoading ? '…' : summary ? formatMilliTonne(summary.inboundNetMilliTonne) : '—'}
                    </span>
                    <span className={styles.kpiUnit}>吨</span>
                  </div>
                </div>
                <div className={styles.kpiFoot}>
                  <span>{summary ? `${formatNumber(summary.inboundTickets)} 车次` : '本月统计'}</span>
                  <Link to={paths.analyticsFlow}>查看分析</Link>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card className={styles.kpiCard}>
                <div>
                  <div className={styles.kpiHead}>
                    <span>本月出厂净重</span>
                    <span className={`${styles.kpiIcon} ${styles.kpiIconAccent}`} aria-hidden="true">
                      <ArrowUpFromLine size={16} />
                    </span>
                  </div>
                  <div className={styles.kpiValueRow}>
                    <span className={styles.kpiValue}>
                      {overviewQuery.isLoading ? '…' : summary ? formatMilliTonne(summary.outboundNetMilliTonne) : '—'}
                    </span>
                    <span className={styles.kpiUnit}>吨</span>
                  </div>
                </div>
                <div className={styles.kpiFoot}>
                  <span>{summary ? `${formatNumber(summary.outboundTickets)} 车次` : '本月统计'}</span>
                  <Link to={paths.analyticsStatement}>客户对账</Link>
                </div>
              </Card>
            </Col>
          </>
        ) : (
          <>
            <Col xs={24} sm={12} xl={6}>
              <Card className={styles.kpiCard}>
                <div>
                  <div className={styles.kpiHead}>
                    <span>可访问模块</span>
                    <span className={styles.kpiIcon} aria-hidden="true">
                      <ShieldCheck size={16} />
                    </span>
                  </div>
                  <div className={styles.kpiValueRow}>
                    <span className={styles.kpiValue}>{quickRoutes.length + 1}</span>
                    <span className={styles.kpiUnit}>个</span>
                  </div>
                </div>
                <div className={styles.kpiFoot}>
                  <span>按当前岗位角色授权</span>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card className={styles.kpiCard}>
                <div>
                  <div className={styles.kpiHead}>
                    <span>当前账号</span>
                    <span className={`${styles.kpiIcon} ${styles.kpiIconMuted}`} aria-hidden="true">
                      <Building2 size={16} />
                    </span>
                  </div>
                  <div className={styles.kpiValueRow}>
                    <span className={styles.kpiValue} style={{ fontSize: 22 }}>
                      {user?.username ?? '—'}
                    </span>
                  </div>
                </div>
                <div className={styles.kpiFoot}>
                  <span>IP：{user?.lastLoginIp ?? '—'}</span>
                  <Link to="/account/profile">个人中心</Link>
                </div>
              </Card>
            </Col>
          </>
        )}

        <Col xs={24} sm={12} xl={6}>
          <Card className={styles.kpiCard}>
            <div>
              <div className={styles.kpiHead}>
                <span>{tasksAccess ? '待回磅车辆' : '有效公告'}</span>
                <span className={`${styles.kpiIcon} ${styles.kpiIconAccent}`} aria-hidden="true">
                  {tasksAccess ? <Scale size={16} /> : <FileText size={16} />}
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>
                  {tasksAccess
                    ? (syncSitesQuery.isLoading ? '…' : totalAwaiting)
                    : (announcementsQuery.isLoading ? '…' : (announcementsQuery.data?.total ?? 0))}
                </span>
                <span className={styles.kpiUnit}>{tasksAccess ? '车' : '条'}</span>
              </div>
            </div>
            <div className={styles.kpiFoot}>
              <span>{tasksAccess ? `覆盖 ${siteStatuses.length} 个已接入厂区` : '站内有效公告'}</span>
              <Link to={tasksAccess ? paths.weighbridgeTasks : '/announcements'}>
                {tasksAccess ? '查看任务' : '查看公告'}
              </Link>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} xl={6}>
          <Card className={styles.kpiCard}>
            <div>
              <div className={styles.kpiHead}>
                <span>未读通知</span>
                <span className={`${styles.kpiIcon} ${styles.kpiIconMuted}`} aria-hidden="true">
                  <BellRing size={16} />
                </span>
              </div>
              <div className={styles.kpiValueRow}>
                <span className={styles.kpiValue}>
                  {unreadQuery.isLoading ? '…' : (unreadQuery.data ?? 0)}
                </span>
                <span className={styles.kpiUnit}>条</span>
              </div>
            </div>
            <div className={styles.kpiFoot}>
              <span>有效公告 {announcementsQuery.data?.total ?? 0} 条</span>
              <Link to="/notifications">查看通知</Link>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            className={styles.panelCard}
            title="常用业务入口"
            extra={<Typography.Text type="secondary">按当前角色菜单生成</Typography.Text>}
          >
            {quickRoutes.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前账号暂无其他可访问模块" />
            ) : (
              <div className={styles.quickGrid}>
                {quickRoutes.map((route) => {
                  const Icon = route.icon;
                  return (
                    <button
                      type="button"
                      key={route.path}
                      className={styles.quickTile}
                      onClick={() => navigate(route.path)}
                    >
                      <span className={styles.quickIcon} aria-hidden="true">
                        {Icon ? <Icon size={17} /> : <ArrowRight size={17} />}
                      </span>
                      <span className={styles.quickLabel}>{route.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card
            className={styles.panelCard}
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
                    className={styles.announcementRow}
                    actions={[
                      <Button key="view" type="link" size="small" onClick={() => navigate('/announcements')}>
                        查看
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<FileText size={16} aria-hidden="true" style={{ color: 'var(--ant-color-link)' }} />}
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
        {tasksAccess && (
          <Col xs={24} xl={monitorAccess ? 12 : 14}>
            <Card
              className={styles.panelCard}
              title="各厂区待回磅状态"
              extra={
                <Button type="link" size="small" onClick={() => navigate(paths.weighbridgeTasks)}>
                  全部任务
                </Button>
              }
            >
              {syncSitesQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} title={false} />
              ) : syncSitesQuery.isError ? (
                <Typography.Text type="danger">厂区同步状态加载失败。</Typography.Text>
              ) : siteStatuses.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无厂区同步记录" />
              ) : (
                <div className={styles.siteList}>
                  {siteStatuses.map((site) => (
                    <button
                      type="button"
                      key={site.siteCode}
                      className={styles.siteTile}
                      onClick={() => navigate(`${paths.weighbridgeTasks}?siteCode=${encodeURIComponent(site.siteCode)}`)}
                    >
                      <div className={styles.siteTop}>
                        <span className={styles.siteName}>{site.siteName}</span>
                        <Tag style={{ marginInlineEnd: 0 }}>{site.siteCode}</Tag>
                      </div>
                      <div className={styles.siteCount}>
                        {site.awaitingCount ?? 0} <span className={styles.kpiUnit}>车待回磅</span>
                      </div>
                      <div className={styles.siteMeta}>
                        同步 {formatBeijingTime(site.lastSyncedAt)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        )}

        <Col xs={24} xl={tasksAccess ? (monitorAccess ? 12 : 10) : 12}>
          <Card
            className={styles.panelCard}
            title={monitorAccess ? '主机运行简报' : '账号信息'}
            extra={
              monitorAccess ? (
                <Button type="link" size="small" onClick={() => navigate('/monitor/server')}>
                  监控详情
                </Button>
              ) : (
                <Space size={8}>
                  <Link to="/account/profile">个人中心</Link>
                  <Link to="/account/change-password">修改密码</Link>
                </Space>
              )
            }
          >
            {monitorAccess ? (
              monitorQuery.isLoading ? (
                <Skeleton active paragraph={{ rows: 4 }} title={false} />
              ) : monitorQuery.isError || !snapshot ? (
                <Space orientation="vertical">
                  <Typography.Text type="danger">暂时无法读取主机指标。</Typography.Text>
                  <Button size="small" onClick={() => void monitorQuery.refetch()}>重试</Button>
                </Space>
              ) : (
                <Space orientation="vertical" size={14} style={{ width: '100%' }}>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoCell}>
                      <span className={styles.infoLabel}>宿主机</span>
                      <span className={styles.infoValue}>{snapshot.host.data?.hostname ?? '—'}</span>
                    </div>
                    <div className={styles.infoCell}>
                      <span className={styles.infoLabel}>1 分钟负载</span>
                      <span className={styles.infoValue}>{cpu?.load1 ?? '—'}</span>
                    </div>
                  </div>
                  <div className={styles.metricBlock}>
                    <div className={styles.metricHead}>
                      <span>CPU 使用率</span>
                      <span>{Math.round(cpu?.usagePercent ?? 0)}%</span>
                    </div>
                    <Progress percent={Math.round(cpu?.usagePercent ?? 0)} showInfo={false} />
                  </div>
                  <div className={styles.metricBlock}>
                    <div className={styles.metricHead}>
                      <span>内存使用率</span>
                      <span>{Math.round(memory?.usagePercent ?? 0)}%</span>
                    </div>
                    <Progress percent={Math.round(memory?.usagePercent ?? 0)} showInfo={false} />
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    采样时间 {formatDateTime(snapshot.sampledAt)}
                  </Typography.Text>
                </Space>
              )
            ) : (
              <div className={styles.infoGrid}>
                <div className={styles.infoCell}>
                  <span className={styles.infoLabel}>用户名</span>
                  <span className={styles.infoValue}>{user?.username ?? '—'}</span>
                </div>
                <div className={styles.infoCell}>
                  <span className={styles.infoLabel}>部门</span>
                  <span className={styles.infoValue}>{user?.dept?.deptName ?? '—'}</span>
                </div>
                <div className={styles.infoCell}>
                  <span className={styles.infoLabel}>手机号</span>
                  <span className={styles.infoValue}>{user?.phone ?? '—'}</span>
                </div>
                <div className={styles.infoCell}>
                  <span className={styles.infoLabel}>邮箱</span>
                  <span className={styles.infoValue}>{user?.email ?? '—'}</span>
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
