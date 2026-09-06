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

const MEMORY_BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatMemoryBytes(value: number | bigint): string {
  let num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    num = 0;
  }
  let unitIndex = 0;
  while (num >= 1024 && unitIndex < MEMORY_BYTE_UNITS.length - 1) {
    num /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(Math.round(num)) : num.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${MEMORY_BYTE_UNITS[unitIndex]}`;
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

export async function testNativeConnection(
  targetUrl: string,
  secret?: string,
): Promise<{
  ok: boolean;
  version?: string;
  apiVersion?: number;
  error?: string;
}> {
  const normalized = normalizeEndpoint(targetUrl);
  if (!normalized) {
    return { ok: false, error: 'Endpoint is not configured' };
  }
  try {
    const transport = createGrpcWebTransport({
      baseUrl: normalized,
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

const STORAGE_CONFIG_KEY = 'yacd.singbox.config';
const CHART_SIZE = 150;

export class SingBoxClient {
  private abortController: AbortController | null = null;
  private listeners = new Set<(snapshot: SingBoxSnapshot) => void>();
  private reconnectTimer: any = null;
  private watchdogTimer: any = null;
  private streamGeneration = 0;
  private lastStatusAt = 0;
  private statusCount = 0;
  private reconnectCount = 0;
  private lastConnectAttemptAt = 0;
  private lifecycleBound = false;

  private phase: SingBoxConnectionPhase = 'unconfigured';
  private error?: string;
  private currentStatus: SingBoxStatus | null = null;

  private chartListeners = new Set<() => void>();
  private chartLabels: (number | string)[] = Array(CHART_SIZE).fill(0);
  private chartUp: (number | undefined)[] = Array(CHART_SIZE).fill(undefined);
  private chartDown: (number | undefined)[] = Array(CHART_SIZE).fill(undefined);
  private chartInuse: (number | undefined)[] = Array(CHART_SIZE).fill(undefined);

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

    this.initLifecycleListeners();

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

  public resetChartHistory() {
    this.chartLabels.length = CHART_SIZE;
    this.chartLabels.fill(0);
    this.chartUp.length = CHART_SIZE;
    this.chartUp.fill(undefined);
    this.chartDown.length = CHART_SIZE;
    this.chartDown.fill(undefined);
    this.chartInuse.length = CHART_SIZE;
    this.chartInuse.fill(undefined);

    for (const fn of this.chartListeners) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
  }

  public setCustomConfig(config: SingBoxConfig) {
    const nextEndpoint = normalizeEndpoint(config.endpoint);
    const nextSecret = (config.secret || '').trim();
    const endpointChanged = this.endpoint !== nextEndpoint;

    this.endpoint = nextEndpoint;
    this.secret = nextSecret;
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

    if (endpointChanged) {
      this.currentStatus = null;
      this.resetChartHistory();
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

  private initLifecycleListeners() {
    if (typeof document === 'undefined' || this.lifecycleBound) return;
    this.lifecycleBound = true;

    const onActive = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - this.lastConnectAttemptAt < 2000) {
          return;
        }
        const isStale = !this.lastStatusAt || now - this.lastStatusAt > 2500;
        if (this.endpoint && (this.phase !== 'connected' || isStale)) {
          this.reconnect();
        }
      }
    };

    const onSuspend = () => {
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        onActive();
      } else {
        onSuspend();
      }
    });
    document.addEventListener('resume', onActive);
    document.addEventListener('freeze', onSuspend);
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', onActive);
      window.addEventListener('online', onActive);
      window.addEventListener('pagehide', onSuspend);
    }
  }

  public reconnect() {
    this.reconnectCount++;
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
    this.streamGeneration++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private resetWatchdog() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.phase === 'connected' && this.endpoint) {
      this.watchdogTimer = setTimeout(() => {
        this.watchdogTimer = null;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        if (this.phase === 'connected') {
          this.reconnect();
        }
      }, 5000);
    }
  }

  public async testConnection(): Promise<{
    ok: boolean;
    version?: string;
    apiVersion?: number;
    error?: string;
  }> {
    return testNativeConnection(this.endpoint, this.effectiveSecret());
  }

  public getDiagnostics() {
    return {
      streamGeneration: this.streamGeneration,
      phase: this.phase,
      endpoint: this.endpoint,
      lastStatusAt: this.lastStatusAt,
      statusCount: this.statusCount,
      reconnectCount: this.reconnectCount,
      reconnectTimerActive: Boolean(this.reconnectTimer),
      watchdogTimerActive: Boolean(this.watchdogTimer),
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    };
  }

  private async startConnection() {
    const targetUrl = this.endpoint;
    if (!targetUrl) {
      this.phase = 'unconfigured';
      this.error = undefined;
      this.notify();
      return;
    }

    this.lastConnectAttemptAt = Date.now();
    this.closeExisting();
    const generation = this.streamGeneration;
    const controller = new AbortController();
    this.abortController = controller;

    this.phase = 'connecting';
    this.error = undefined;
    this.notify();

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

      // Subscribe to status streaming
      const statusStream = client.subscribeStatus(
        { interval: 1_000_000_000n },
        { signal: controller.signal }
      );

      for await (const msg of statusStream) {
        if (generation !== this.streamGeneration || controller.signal.aborted) {
          break;
        }
        this.phase = 'connected';
        this.error = undefined;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.onNewStatus({
          trafficAvailable: Boolean(msg.trafficAvailable),
          uplink: Number(msg.uplink),
          downlink: Number(msg.downlink),
          uplinkTotal: Number(msg.uplinkTotal),
          downlinkTotal: Number(msg.downlinkTotal),
          memory: Number(msg.memory),
          goroutines: msg.goroutines,
          connectionsIn: msg.connectionsIn,
          connectionsOut: msg.connectionsOut,
        });
      }

      if (generation === this.streamGeneration && !controller.signal.aborted) {
        if (this.phase === 'connected') {
          this.phase = 'disconnected';
        } else {
          this.phase = 'error';
          this.error = 'Stream closed';
        }
        if (this.watchdogTimer) {
          clearTimeout(this.watchdogTimer);
          this.watchdogTimer = null;
        }
        this.notify();
        this.scheduleReconnect();
      }
    } catch (err: any) {
      if (generation !== this.streamGeneration || controller.signal.aborted) {
        return;
      }
      this.phase = 'error';
      this.error = err?.message || 'Failed to connect';
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
        this.watchdogTimer = null;
      }
      this.notify();
      this.scheduleReconnect();
    }
  }

  private onNewStatus(status: SingBoxStatus) {
    this.phase = 'connected';
    this.error = undefined;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.currentStatus = status;
    this.lastStatusAt = Date.now();
    this.statusCount++;
    this.resetWatchdog();

    this.chartLabels.shift();
    this.chartUp.shift();
    this.chartDown.shift();
    this.chartInuse.shift();

    const now = Date.now();
    this.chartLabels.push(now);
    this.chartUp.push(status.trafficAvailable ? status.uplink : undefined);
    this.chartDown.push(status.trafficAvailable ? status.downlink : undefined);
    this.chartInuse.push(status.memory);

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
