import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export function ForbiddenPage({ description }: { description?: string }) {
  const navigate = useNavigate();
  return (
    <Result
      status="403"
      title="无权访问该页面"
      subTitle={description ?? '当前账号没有访问该页面的权限。'}
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      }
    />
  );
}

export default ForbiddenPage;
