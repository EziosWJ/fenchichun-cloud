import { setupServer } from 'msw/node';

// 断言层测试可按需注册 handlers；默认不拦截请求。
export const server = setupServer();
