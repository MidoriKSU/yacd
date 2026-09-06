import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';

import { StartedService } from './gen/daemon/started_service_pb.js';



export interface SingBoxStatus {
  memory: number; // in bytes
  memoryRaw?: bigint;
  goroutines: number;
  connectionsIn?: number;
  connectionsOut?: number;
  trafficAvailable: boolean;
  uplink: number; // bytes/s
  downlink: number; // bytes/s
  uplinkTotal: number; // bytes
  downlinkTotal: number; // bytes
}

export type SingBoxConnectionPhase =
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface SingBoxSnapshot {
  phase: SingBoxConnectionPhase;
  error?: string;
  status: SingBoxStatus | null;
  endpoint: string;
  isConfigured: boolean;
}

export interface SingBoxConfig {
  endpoint: string;
  secret: string;
}

export interface TrafficChartSource {
  labels: (number | string)[];
  up: (number | undefined)[];
  down: (number | undefined)[];
  subscribe: (fn: () => void) => () => void;
}

export interface MemoryChartSource {
  labels: (number | string)[];
  inuse: (number | undefined)[];
  subscribe: (fn: () => void) => () => void;
}

export function normalizeEndpoint(raw: string): string {
  let u = (raw || '').trim();
  if (!u) return '';
  if (/^https?:\/*$/i.test(u)) {
    return u;
  }
  u = u.replace(/\/+$/, '');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(u)) {
    return u;
  }
  return 'http://' + u;
}

export interface EndpointValidationResult {
  valid: boolean;
  error?: string;
  url?: string;
  isLoopback?: boolean;
  isPrivate?: boolean;
}

export function validateEndpoint(raw: string): EndpointValidationResult {
  const trimmed = (raw || '').trim();
  if (!trimmed || /^https?:\/*$/i.test(trimmed)) {
    return { valid: false, error: 'Endpoint is empty or missing host' };
  }
  const normalized = normalizeEndpoint(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Unsupported scheme (must be http:// or https://)' };
  }

  if (!parsed.hostname) {
    return { valid: false, error: 'Missing host in endpoint URL' };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1' ||
    host.startsWith('127.') ||
    host.endsWith('.localhost');

  const isPrivate =
    !isLoopback &&
    (host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.startsWith('169.254.') ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd'));

  return {
    valid: true,
    url: normalized,
    isLoopback,
    isPrivate,
  };
}

export function getTargetAddressSpace(urlStr: string): 'loopback' | 'local' | undefined {
  const val = validateEndpoint(urlStr);
  if (!val.valid) return undefined;
  if (val.isLoopback) return 'loopback';
  if (val.isPrivate) return 'local';
  return undefined;
}

export function getFetchInitWithLNA(init: RequestInit, targetUrl: string): RequestInit {
  const options: RequestInit = { ...init };
  const targetSpace = getTargetAddressSpace(targetUrl);
  if (
    targetSpace &&
    typeof Request !== 'undefined' &&
    'targetAddressSpace' in Request.prototype
  ) {
    (options as any).targetAddressSpace = targetSpace;
  }
  return options;
}

// Protobuf wire-format helpers
export function decodeVarint(bytes: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let i = offset;
  while (i < bytes.length) {
    const byte = bytes[i++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return [result, i];
}

export function encodeVarint(val: bigint | number): Uint8Array {
  let v = BigInt(val);
  const bytes: number[] = [];
  while (v >= 0x80n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v & 0x7fn));
  return new Uint8Array(bytes);
}

// Decode daemon.Status protobuf message
export function decodeStatus(bytes: Uint8Array): SingBoxStatus {
  let i = 0;
  const s: SingBoxStatus = {
    memory: 0,
    memoryRaw: 0n,
    goroutines: 0,
    connectionsIn: 0,
    connectionsOut: 0,
    trafficAvailable: false,
    uplink: 0,
    downlink: 0,
    uplinkTotal: 0,
    downlinkTotal: 0,
  };

  while (i < bytes.length) {
    const [tag, nextTag] = decodeVarint(bytes, i);
    i = nextTag;
    const field = Number(tag >> 3n);
    const wire = Number(tag & 0x07n);

    if (wire === 0) {
      const [val, nextVal] = decodeVarint(bytes, i);
      i = nextVal;
      switch (field) {
        case 1:
          s.memoryRaw = val;
          s.memory = Number(val);
          break;
        case 2:
          s.goroutines = Number(val);
          break;
        case 3:
          s.connectionsIn = Number(val);
          break;
        case 4:
          s.connectionsOut = Number(val);
          break;
        case 5:
          s.trafficAvailable = val !== 0n;
          break;
        case 6:
          s.uplink = Number(val);
          break;
        case 7:
          s.downlink = Number(val);
          break;
        case 8:
          s.uplinkTotal = Number(val);
          break;
        case 9:
          s.downlinkTotal = Number(val);
          break;
      }
    } else if (wire === 2) {
      const [len, nextLen] = decodeVarint(bytes, i);
      i = nextLen + Number(len);
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 5) {
      i += 4;
    } else {
      break;
    }
  }
  return s;
}

export function decodeStartedAt(bytes: Uint8Array): number | null {
  let i = 0;
  let startedAt: number | null = null;
  while (i < bytes.length) {
    const [tag, nextTag] = decodeVarint(bytes, i);
    i = nextTag;
    const field = Number(tag >> 3n);
    const wire = Number(tag & 0x07n);
    if (wire === 0) {
      const [val, nextVal] = decodeVarint(bytes, i);
      i = nextVal;
      if (field === 1) startedAt = Number(val);
    } else if (wire === 2) {
      const [len, nextLen] = decodeVarint(bytes, i);
      i = nextLen + Number(len);
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 5) {
      i += 4;
    } else {
      break;
    }
  }
  return startedAt;
}

export function formatUptime(epochMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const MEM_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
export function formatMemoryBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1000) return n + ' B';
  const exponent = Math.min(Math.floor(Math.log10(n) / 3), MEM_UNITS.length - 1);
  const formatted = Number((n / Math.pow(1000, exponent)).toPrecision(3));
  return `${formatted} ${MEM_UNITS[exponent]}`;
}

export function parseGrpcTrailers(text: string): { grpcStatus?: string; grpcMessage?: string } {
  const lines = text.split(/\r?\n/);
  let grpcStatus: string | undefined;
  let grpcMessage: string | undefined;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      if (key === 'grpc-status') {
        grpcStatus = val;
      } else if (key === 'grpc-message') {
        try {
          grpcMessage = decodeURIComponent(val);
        } catch {
          grpcMessage = val;
        }
      }
    }
  }
  return { grpcStatus, grpcMessage };
}

// Build 5-byte framed SubscribeStatusRequest protobuf message (interval = 1s = 1e9 ns)
export function buildSubscribeStatusPayload(): Uint8Array {
  // tag: field 1, wire type 0 = (1 << 3) | 0 = 0x08
  const tag = new Uint8Array([0x08]);
  const varintInterval = encodeVarint(1_000_000_000n);
  const msg = new Uint8Array(tag.length + varintInterval.length);
  msg.set(tag, 0);
  msg.set(varintInterval, tag.length);

  // 5-byte gRPC-web frame prefix: 0x00 flag + 4-byte big-endian length
  const frame = new Uint8Array(5 + msg.length);
  frame[0] = 0x00;
  frame[1] = (msg.length >>> 24) & 0xff;
  frame[2] = (msg.length >>> 16) & 0xff;
  frame[3] = (msg.length >>> 8) & 0xff;
  frame[4] = msg.length & 0xff;
  frame.set(msg, 5);
  return frame;
}

// Build 6-byte framed SubscribeStatusRequest protobuf message for grpc-websockets:
export function buildSubscribeStatusWsPayload(): Uint8Array {
  const grpcFrame = buildSubscribeStatusPayload();
  const wsFrame = new Uint8Array(1 + grpcFrame.length);
  wsFrame[0] = 0x00; // WebSocket DATA frame signal
  wsFrame.set(grpcFrame, 1);
  return wsFrame;
}

const STORAGE_CONFIG_KEY = 'yacd.singbox.config';
const CHART_SIZE = 150;

export class SingBoxClient {
  private abortController: AbortController | null = null;
  private listeners = new Set<(snapshot: SingBoxSnapshot) => void>();
  private reconnectTimer: any = null;

  private phase: SingBoxConnectionPhase = 'unconfigured';
  private error?: string;
  private currentStatus: SingBoxStatus | null = null;

  private chartListeners = new Set<() => void>();
  private chartLabels: (number | string)[] = Array(CHART_SIZE).fill(0);
  private chartUp: (number | undefined)[] = Array(CHART_SIZE);
  private chartDown: (number | undefined)[] = Array(CHART_SIZE);
  private chartInuse: (number | undefined)[] = Array(CHART_SIZE);

  public readonly trafficChartSource: TrafficChartSource = {
    labels: this.chartLabels,
    up: this.chartUp,
    down: this.chartDown,
    subscribe: (fn: () => void) => {
      this.chartListeners.add(fn);
      return () => {
        this.chartListeners.delete(fn);
      };
    },
  };

  public readonly memoryChartSource: MemoryChartSource = {
    labels: this.chartLabels,
    inuse: this.chartInuse,
    subscribe: (fn: () => void) => {
      this.chartListeners.add(fn);
      return () => {
        this.chartListeners.delete(fn);
      };
    },
  };

  private endpoint = '';
  private secret = '';

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.endpoint = normalizeEndpoint(parsed.endpoint || '');
        this.secret = (parsed.secret || '').trim();
      }
    } catch {
      // ignore
    }

    if (this.endpoint) {
      this.phase = 'connecting';
      setTimeout(() => this.startConnection(), 0);
    } else {
      this.phase = 'unconfigured';
    }
  }

  public getSnapshot(): SingBoxSnapshot {
    return {
      phase: this.phase,
      error: this.error,
      status: this.currentStatus,
      endpoint: this.endpoint,
      isConfigured: Boolean(this.endpoint),
    };
  }

  public getCustomConfig(): SingBoxConfig {
    return {
      endpoint: this.endpoint,
      secret: this.secret,
    };
  }

  public setCustomConfig(config: SingBoxConfig) {
    this.endpoint = normalizeEndpoint(config.endpoint);
    this.secret = (config.secret || '').trim();
    try {
      if (this.endpoint || this.secret) {
        localStorage.setItem(
          STORAGE_CONFIG_KEY,
          JSON.stringify({ endpoint: this.endpoint, secret: this.secret })
        );
      } else {
        localStorage.removeItem(STORAGE_CONFIG_KEY);
      }
    } catch {
      // ignore
    }
    this.reconnect();
  }

  public setCustomEndpoint(url: string) {
    this.setCustomConfig({ endpoint: url, secret: this.secret });
  }

  public updateConfig(baseURL: string, secret?: string) {
    this.setCustomConfig({ endpoint: baseURL, secret: secret || '' });
  }

  public effectiveUrl(): string {
    return this.endpoint;
  }

  public effectiveSecret(): string {
    return this.secret;
  }

  public subscribe(listener: (snapshot: SingBoxSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeExisting();
    this.startConnection();
  }

  private notify() {
    const snap = this.getSnapshot();
    for (const l of this.listeners) {
      try {
        l(snap);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('singbox listener error:', err);
      }
    }
  }

  private closeExisting() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public async testConnection(): Promise<{
    ok: boolean;
    version?: string;
    apiVersion?: number;
    error?: string;
  }> {
    const targetUrl = this.endpoint;
    if (!targetUrl) {
      return { ok: false, error: 'Endpoint is not configured' };
    }
    try {
      const secret = this.effectiveSecret();
      const transport = createGrpcWebTransport({
        baseUrl: targetUrl,
        interceptors: [
          (next) => (request) => {
            request.header.set('Accept-Language', 'en');
            if (secret) {
              request.header.set('Authorization', `Bearer ${secret}`);
            }
            return next(request);
          },
        ],
      });
      const client = createClient(StartedService, transport);
      const res = await client.getVersion({});
      return { ok: true, version: res.version, apiVersion: res.apiVersion };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Connection failed' };
    }
  }

  private async startConnection() {
    const targetUrl = this.endpoint;
    if (!targetUrl) {
      this.phase = 'unconfigured';
      this.error = undefined;
      this.notify();
      return;
    }

    this.phase = 'connecting';
    this.error = undefined;
    this.notify();

    const controller = new AbortController();
    this.abortController = controller;

    try {
      const secret = this.effectiveSecret();
      const transport = createGrpcWebTransport({
        baseUrl: targetUrl,
        interceptors: [
          (next) => (request) => {
            request.header.set('Accept-Language', 'en');
            if (secret) {
              request.header.set('Authorization', `Bearer ${secret}`);
            }
            return next(request);
          },
        ],
      });

      const client = createClient(StartedService, transport);

      // Verify Service API via low-cost unary RPC first
      await client.getVersion({}, { signal: controller.signal });

      // Subscribe to status streaming
      const statusStream = client.subscribeStatus(
        { interval: 1_000_000_000n },
        { signal: controller.signal }
      );

      for await (const msg of statusStream) {
        if (controller.signal.aborted) break;
        this.phase = 'connected';
        this.error = undefined;
        this.onNewStatus({
          trafficAvailable: true,
          uplink: Number(msg.uplink),
          downlink: Number(msg.downlink),
          uplinkTotal: Number(msg.uplinkTotal),
          downlinkTotal: Number(msg.downlinkTotal),
          memory: Number(msg.memory),
          goroutines: msg.goroutines,
        });
      }

      if (!controller.signal.aborted) {
        if (this.phase === 'connected') {
          this.phase = 'disconnected';
        } else {
          this.phase = 'error';
          this.error = 'Stream closed';
        }
        this.notify();
        this.scheduleReconnect();
      }
    } catch (err: any) {
      if (controller.signal.aborted && this.abortController !== controller) return;
      this.phase = 'error';
      this.error = err?.message || 'Failed to connect';
      this.notify();
      this.scheduleReconnect();
    }
  }

  private onNewStatus(status: SingBoxStatus) {
    this.currentStatus = status;

    this.chartUp.shift();
    this.chartDown.shift();
    this.chartInuse.shift();
    this.chartLabels.shift();

    const now = Date.now();
    this.chartUp.push(status.trafficAvailable ? status.uplink : 0);
    this.chartDown.push(status.trafficAvailable ? status.downlink : 0);
    this.chartInuse.push(status.memory);
    this.chartLabels.push(now);

    for (const fn of this.chartListeners) {
      try {
        fn();
      } catch {
        // ignore
      }
    }

    this.notify();
  }

  private scheduleReconnect() {
    if (!this.endpoint) return;
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startConnection();
    }, 5000);
  }
}

export const singBoxClient = new SingBoxClient();
