export type RegionStatus = 'ok' | 'collecting' | 'no_device' | 'unsupported' | 'error' | 'stale';

export interface Region<T> {
  status: RegionStatus;
  collectedAt: string | null;
  message: string;
  partial: boolean;
  stale: boolean;
  data: T | null;
}

export interface HostMetrics {
  hostname: string;
  os: string;
  kernel: string;
  uptimeSeconds: number;
}

export interface CPUMetrics {
  model: string;
  logicalCores: number;
  physicalCores: number;
  usagePercent: number | null;
  perCore: (number | null)[];
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

export interface MemoryMetrics {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapUsagePercent: number | null;
  swapUnsupported?: boolean;
}

export interface FilesystemMetrics {
  id: string;
  device: string;
  mountpoint: string;
  type: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number | null;
  message: string;
}

export interface DiskMetrics {
  id: string;
  readBytesPerSecond: number | null;
  writeBytesPerSecond: number | null;
  readIops: number | null;
  writeIops: number | null;
  message: string;
}

export interface IPAddress {
  family: 'IPv4' | 'IPv6';
  ip: string;
  prefixLength: number;
}

export interface NetworkMetrics {
  id: string;
  addresses?: IPAddress[] | null;
  addressError?: string;
  loopback: boolean;
  virtual: boolean;
  state: string;
  speedBitsPerSecond: number | null;
  receiveBytes: number;
  transmitBytes: number;
  receiveBytesPerSecond: number | null;
  transmitBytesPerSecond: number | null;
  receiveUsagePercent: number | null;
  transmitUsagePercent: number | null;
  receiveErrors: number;
  transmitErrors: number;
  receiveDropped: number;
  transmitDropped: number;
  message: string;
}

export interface GPUMetrics {
  id: string;
  name: string;
  usagePercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  temperatureCelsius: number | null;
  powerWatts: number | null;
  message: string;
}

export interface ProcessMetrics {
  pid: number;
  name: string;
  cpuPercent: number | null;
  memoryBytes: number;
}

export type MonitorResource = 'cpu' | 'memory' | 'filesystem' | 'disk' | 'network' | 'gpu';

export interface MonitorSnapshot {
  sourceId: string;
  sampledAt: string;
  host: Region<HostMetrics>;
  cpu: Region<CPUMetrics>;
  memory: Region<MemoryMetrics>;
  filesystems: Region<FilesystemMetrics[]>;
  disks: Region<DiskMetrics[]>;
  network: Region<NetworkMetrics[]>;
  gpu: Region<GPUMetrics[]>;
  processes: Region<{ cpu: ProcessMetrics[]; memory: ProcessMetrics[] }>;
  warnings: { resource: string; device: string; since: string; message: string }[];
}
