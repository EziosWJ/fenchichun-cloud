import { get } from '../../lib/api/client';
import type { MonitorSnapshot } from '../../types/monitoring';

export function getMonitorSnapshot(signal?: AbortSignal): Promise<MonitorSnapshot> {
  return get<MonitorSnapshot>('/monitoring/overview', undefined, { signal });
}
