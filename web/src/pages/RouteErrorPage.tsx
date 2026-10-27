import { Button, Result } from 'antd';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';

export default function RouteErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;

  return (
    <Result
      status={notFound ? '404' : '500'}
      title={notFound ? '页面不存在' : '页面加载失败'}
      subTitle={
        notFound
          ? '请检查地址，或返回应用首页。'
          : '页面遇到问题。请重试或返回首页；生产环境不会展示内部堆栈。'
      }
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          返回工作台
        </Button>
      }
    />
  );
}
