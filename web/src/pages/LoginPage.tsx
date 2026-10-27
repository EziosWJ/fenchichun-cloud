import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Typography } from 'antd';
import { LockKeyhole, Moon, Sun, UserRound } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { appConfig } from '../config/app.config';
import { useAppPreferences } from '../app/AppProviders';
import { getApiErrorMessage } from '../lib/api/errors';
import { useAuthStore } from '../stores/useAuthStore';
import styles from './LoginPage.module.css';

const REMEMBERED_USERNAME_KEY = 'base-admin-remembered-username';

interface LoginFormValues {
  username: string;
  password: string;
  remember?: boolean;
}

function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return '/dashboard';
  }
  return value;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const token = useAuthStore((state) => state.token);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const { themeMode, toggleTheme } = useAppPreferences();
  const [form] = Form.useForm<LoginFormValues>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const redirect = safeRedirect(new URLSearchParams(location.search).get('redirect'));

  useEffect(() => {
    if (token && status === 'idle') void bootstrap();
  }, [bootstrap, status, token]);

  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(REMEMBERED_USERNAME_KEY);
      if (remembered) form.setFieldsValue({ username: remembered, remember: true });
    } catch {
      // 本地存储不可用时不影响登录。
    }
  }, [form]);

  if (status === 'authenticated') {
    return <Navigate to={redirect} replace />;
  }

  const handleSubmit = async (values: LoginFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values.username.trim(), values.password);
      try {
        if (values.remember) {
          window.localStorage.setItem(REMEMBERED_USERNAME_KEY, values.username.trim());
        } else {
          window.localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }
      } catch {
        // 本地存储不可用时仍以登录结果为准。
      }
      navigate(redirect, { replace: true });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.brandPanel} aria-label="平台介绍">
        <div className={styles.brandMark}>
          <span className={styles.brandLogo}>{appConfig.logoText}</span>
          <span>{appConfig.brandName}</span>
        </div>
        <div className={styles.brandBody}>
          <p className={styles.brandEyebrow}>GO REST API · REACT ADMIN</p>
          <h1 className={styles.brandTitle}>{appConfig.loginTitle}</h1>
          <p className={styles.brandDesc}>{appConfig.loginSubtitle}</p>
        </div>
        <p className={styles.brandFoot}>{appConfig.footerText}</p>
      </section>

      <section className={styles.formPanel}>
        <Button
          className={styles.themeToggle}
          type="text"
          aria-label={themeMode === 'dark' ? '切换浅色主题' : '切换深色主题'}
          icon={themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          onClick={toggleTheme}
        />
        <Card variant="borderless" className={styles.formCard}>
          <Typography.Title level={2} className={styles.formTitle}>
            登录
          </Typography.Title>
          <p className={styles.formSubtitle}>请输入系统账号进入管理后台。</p>

          {error && (
            <Alert
              type="error"
              showIcon
              role="alert"
              title={error}
              style={{ marginBottom: 20 }}
            />
          )}

          <Form<LoginFormValues>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ remember: false }}
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, whitespace: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserRound size={16} aria-hidden="true" />}
                autoComplete="username"
                placeholder="请输入用户名"
                size="large"
                maxLength={64}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockKeyhole size={16} aria-hidden="true" />}
                autoComplete="current-password"
                placeholder="请输入密码"
                size="large"
                maxLength={128}
              />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>记住用户名</Checkbox>
            </Form.Item>
            <Button
              className={styles.submit}
              type="primary"
              htmlType="submit"
              size="large"
              loading={submitting}
            >
              登录
            </Button>
          </Form>

          <p className={styles.footerHint}>
            登录状态失效时会返回本页，登录后回到原页面。
          </p>
        </Card>
      </section>
    </div>
  );
}
