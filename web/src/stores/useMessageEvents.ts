import { create } from 'zustand';
import { API_PREFIX, env } from '../config/env';
import { useAuthStore } from './useAuthStore';

type StreamStatus = 'connecting' | 'connected' | 'reconnecting';

interface MessageState {
  privateReady: boolean;
  status: StreamStatus;
  notificationVersion: number;
  announcementVersion: number;
}

export const useMessageEvents = create<MessageState>(() => ({
  privateReady: false,
  status: 'connecting',
  notificationVersion: 0,
  announcementVersion: 0,
}));

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

/** 使用带 Bearer 头的 fetch 读取 SSE；EventSource 无法附加认证头。 */
export function connectMessages(token: string): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const url = `${env.apiOrigin}${API_PREFIX}/system/notification/events`;
  useMessageEvents.setState({ privateReady: false, status: 'connecting' });

  const receive = (value: { type: string }) => {
    if (signal.aborted) return;
    if (value.type === 'heartbeat') return;
    useMessageEvents.setState((state) => {
      if (value.type === 'ready') {
        return {
          privateReady: true,
          status: 'connected',
          notificationVersion: state.notificationVersion + 1,
          announcementVersion: state.announcementVersion + 1,
        };
      }
      if (value.type === 'notification' || value.type === 'read') {
        return { notificationVersion: state.notificationVersion + 1 };
      }
      if (value.type === 'announcement') {
        return { announcementVersion: state.announcementVersion + 1 };
      }
      return state;
    });
  };

  void (async () => {
    let attempt = 0;
    while (!signal.aborted) {
      try {
        const response = await fetch(url, {
          signal,
          headers: { Authorization: token, Accept: 'text/event-stream' },
          cache: 'no-store',
        });
        if (signal.aborted) {
          await response.body?.cancel().catch(() => undefined);
          return;
        }
        if (response.status === 401) {
          useAuthStore.getState().clearSession();
          return;
        }
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('text/event-stream') || !response.body) {
          throw new Error('消息连接暂不可用');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (!signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
            if (buffer.length > 65_536) throw new Error('消息连接数据异常');
            let end: number;
            while ((end = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = frame
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n');
              if (data) {
                const event = JSON.parse(data) as { type: string };
                receive(event);
                if (event.type === 'ready') attempt = 0;
              }
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } catch {
        // 断线后按退避重连；不轮询消息接口。
      }
      if (signal.aborted) break;
      useMessageEvents.setState({ status: 'reconnecting' });
      await pause(Math.min(1000 * 2 ** attempt++, 15_000), signal);
    }
  })();

  return () => {
    controller.abort();
    useMessageEvents.setState({ privateReady: false, status: 'connecting' });
  };
}
