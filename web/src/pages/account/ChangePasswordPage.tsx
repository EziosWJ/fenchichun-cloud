import { App, Alert, Button, Card, Form, Input } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';
import { getApiErrorMessage } from '../../lib/api/errors';
import { changeCurrentPassword } from '../../features/account/api';

interface PasswordFormValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<PasswordFormValues>();

  const mutation = useMutation({
    mutationFn: (values: PasswordFormValues) =>
      changeCurrentPassword({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
    onSuccess: () => {
      message.success('密码已修改，请在下次登录时使用新密码');
      form.resetFields();
    },
    onError: (error) => message.error(getApiErrorMessage(error)),
  });

  return (
    <div className="pageStack">
      <PageHeader title="修改密码" description="修改当前登录账号的密码，需要验证原密码。" />

      <Card className="formCard">
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
          title="新密码长度为 6–50 个字符。修改成功后当前登录状态保持有效。"
        />
        <Form<PasswordFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
          requiredMark={false}
        >
          <Form.Item
            name="oldPassword"
            label="原密码"
            rules={[{ required: true, message: '请输入原密码' }]}
          >
            <Input.Password autoComplete="current-password" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, max: 50, message: '新密码长度为 6–50 个字符' },
            ]}
          >
            <Input.Password autoComplete="new-password" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator: (_rule, value) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('两次输入的新密码不一致')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" maxLength={50} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            保存新密码
          </Button>
        </Form>
      </Card>
    </div>
  );
}
