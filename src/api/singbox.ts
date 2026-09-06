// Native sing-box Service API client & adapter
// Implements gRPC-Web (WebSocket & HTTP streaming) for daemon.StartedService

export interface SingBoxStatus {
  memory: number; // in bytes (safe integer range for JS numbers up to 9 PB)
  memoryRaw: bigint;
  goroutines: number;
  connectionsIn: number;
  connectionsOut: number;
  trafficAvailable: boolean;
  uplink: number;
  downlink: number;
  uplinkTotal: number;
  downlinkTotal: number;
}

export interface SingBoxMemoryPoint {
  timestamp: number;
  memory: number;
  goroutines: number;
}

export type SingBoxConnectionPhase =
  | 'unconfigured'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type SingBoxResultState =
  | 'Connected'
  | 'Authentication Failed'
  | 'Unreachable'
  | 'Permission Denied'
  | 'CORS Blocked'
  | 'Browser Blocked'
  | 'Transport Error';

export interface SingBoxSnapshot {
  phase: SingBoxConnectionPhase;
  resultState?: SingBoxResultState;
  error?: string;
  status: SingBoxStatus | null;
  startedAt: number | null; // epoch ms
  endpoint: string;
  isConfigured: boolean;
  history: SingBoxMemoryPoint[];
}

export interface SingBoxConfig {
  endpoint: string;
  secret: string;
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

  // Strip brackets from IPv6 hostnames like [::1]
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
  // Support W3C Local Network Access / Private Network Access when supported by browser
  if (
    targetSpace &&
    typeof Request !== 'undefined' &&
    'targetAddressSpace' in Request.prototype
  ) {
    (options as any).targetAddressSpace = targetSpace;
  }
  return options;
}

export function classifyRequestError(err: any): { resultState: SingBoxResultState; message: string } {
  if (err?.name === 'AbortError') {
    return {
      resultState: 'Unreachable',
      message: 'Unreachable: Connection timed out (5s)',
    };
  }
  if (err?.name === 'NotAllowedError') {
    return {
      resultState: 'Permission Denied',
      message: 'Permission Denied: Local network access was not allowed by the browser',
    };
  }
  if (err?.name === 'SecurityError') {
    return {
      resultState: 'Browser Blocked',
      message: err?.message || 'Browser Blocked: Request was blocked by browser security policy',
    };
  }

  const msg = (err?.message || '').toLowerCase();
  if (msg.includes('permission')) {
    return {
      resultState: 'Permission Denied',
      message: `Permission Denied: ${err?.message || 'Local network permission denied'}`,
    };
  }
  if (msg.includes('cors') || msg.includes('cross-origin')) {
    return {
      resultState: 'CORS Blocked',
      message: `CORS Blocked: ${err?.message || 'Cross-Origin Request Blocked'}`,
    };
  }
  if (msg.includes('mixed content') || msg.includes('mixed-content') || msg.includes('blocked by client')) {
    return {
      resultState: 'Browser Blocked',
      message: `Browser Blocked: ${err?.message || 'Insecure request blocked by browser'}`,
    };
  }

  return {
    resultState: 'Unreachable',
    message: err?.message || 'Unreachable: Connection failed (server offline or port closed)',
  };
}

// Format memory bytes using binary prefix (1024 base)
export function formatMemoryBytes(value: number | bigint): string {
  let num = Number(value);
  if (!Number.isFinite(num) || num < 0) num = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  while (num >= 1024 && unitIndex < units.length - 1) {
    num /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(Math.round(num)) : num.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[unitIndex]}`;
}

// Format duration into readable uptime (e.g., "1d 2h 30m" or "02:15")
export function formatUptime(startedAtMs: number, nowMs = Date.now()): string {
  let seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${hours}h ${pad(minutes)}m`;
  }
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m ${pad(secs)}s`;
  }
  return `${minutes}m ${pad(secs)}s`;
}

// Protobuf varint helper
function decodeVarint(bytes: Uint8Array, offset = 0): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let i = offset;
  while (i < bytes.length) {
    const byte = bytes[i++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if ((byte & 0x80) === 0) break;
  }
  return [result, i];
}

function encodeVarint(val: bigint | number): Uint8Array {
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
      // Varint
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
      // Length-delimited
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

// Decode daemon.StartedAt protobuf message
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

// Parse gRPC-Web trailer headers (from text/plain trailer frames)
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
function buildSubscribeStatusPayload(): Uint8Array {
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

export interface TrafficChartSource {
  labels: string[];
  up: number[];
  down: number[];
  subscribe: (fn: () => void) => () => void;
}

export interface MemoryChartSource {
  labels: string[];
  inuse: number[];
  subscribe: (fn: () => void) => () => void;
}

const STORAGE_CONFIG_KEY = 'yacd.singbox.config';
const LEGACY_STORAGE_ENDPOINT_KEY = 'yacd.singbox.service_endpoint';
const MAX_HISTORY_POINTS = 60;

export class SingBoxClient {
  private ws: WebSocket | null = null;
  private abortController: AbortController | null = null;
  private listeners = new Set<(snapshot: SingBoxSnapshot) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private phase: SingBoxConnectionPhase = 'unconfigured';
  private error?: string;
  private currentStatus: SingBoxStatus | null = null;
  private startedAt: number | null = null;
  private history: SingBoxMemoryPoint[] = [];

  private chartListeners = new Set<() => void>();
  private chartLabels: string[] = [];
  private chartUp: number[] = [];
  private chartDown: number[] = [];
  private chartInuse: number[] = [];

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
  private resultState?: SingBoxResultState;

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.endpoint = normalizeEndpoint(parsed.endpoint || '');
        this.secret = (parsed.secret || '').trim();
      } else {
        const legacy = localStorage.getItem(LEGACY_STORAGE_ENDPOINT_KEY);
        if (legacy) {
          this.endpoint = normalizeEndpoint(legacy);
        }
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
      resultState: this.resultState,
      error: this.error,
      status: this.currentStatus,
      startedAt: this.startedAt,
      endpoint: this.endpoint,
      isConfigured: Boolean(this.endpoint),
      history: this.history,
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
      localStorage.removeItem(LEGACY_STORAGE_ENDPOINT_KEY);
    } catch {
      // ignore
    }
    this.reconnect();
  }

  public setCustomEndpoint(url: string) {
    this.setCustomConfig({ endpoint: url, secret: this.secret });
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

  public async testConnection(
    rawUrl?: string,
    rawSecret?: string
  ): Promise<{
    ok: boolean;
    resultState: SingBoxResultState;
    message: string;
    latency?: number;
  }> {
    const raw = rawUrl !== undefined ? rawUrl : this.endpoint;
    const validation = validateEndpoint(raw);
    if (!validation.valid || !validation.url) {
      return {
        ok: false,
        resultState: 'Transport Error',
        message: validation.error || 'Invalid endpoint URL format',
      };
    }
    const url = validation.url;
    const secret = (rawSecret !== undefined ? rawSecret : this.secret).trim();

    const start = performance.now();
    try {
      const httpUrl = url + '/daemon.StartedService/GetStartedAt';
      const headers: Record<string, string> = {
        'Content-Type': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      };
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      const emptyFrame = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const fetchInit = getFetchInitWithLNA(
        {
          method: 'POST',
          headers,
          body: emptyFrame,
          signal: controller.signal,
        },
        url
      );

      const res = await fetch(httpUrl, fetchInit);
      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - start);

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          resultState: 'Authentication Failed',
          message: `Authentication Failed (${res.status}): secret invalid`,
          latency: elapsed,
        };
      }

      if (res.status === 404) {
        return {
          ok: false,
          resultState: 'Transport Error',
          message:
            'Service API unavailable (HTTP 404): sing-box Service API is not enabled or path not mapped on this port',
          latency: elapsed,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          resultState: 'Transport Error',
          message: `Transport Error (HTTP ${res.status}): ${res.statusText}`,
          latency: elapsed,
        };
      }

      const headerGrpcStatus = res.headers.get('grpc-status');
      if (headerGrpcStatus && headerGrpcStatus !== '0') {
        const grpcMessage = res.headers.get('grpc-message') || `code ${headerGrpcStatus}`;
        if (headerGrpcStatus === '16' || headerGrpcStatus === '7') {
          return {
            ok: false,
            resultState: 'Authentication Failed',
            message: `Authentication Failed: ${grpcMessage}`,
            latency: elapsed,
          };
        }
        return {
          ok: false,
          resultState: 'Transport Error',
          message: `Transport Error: ${grpcMessage}`,
          latency: elapsed,
        };
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      let offset = 0;
      let startedAt: number | null = null;
      let hasData = false;

      while (offset + 5 <= buf.length) {
        const flag = buf[offset];
        const len =
          ((buf[offset + 1] << 24) |
            (buf[offset + 2] << 16) |
            (buf[offset + 3] << 8) |
            buf[offset + 4]) >>> 0;
        if (offset + 5 + len > buf.length) break;

        const body = buf.slice(offset + 5, offset + 5 + len);
        offset += 5 + len;

        if ((flag & 0x80) !== 0) {
          // Trailer frame
          const trailerText = new TextDecoder().decode(body);
          const { grpcStatus, grpcMessage } = parseGrpcTrailers(trailerText);
          if (grpcStatus && grpcStatus !== '0') {
            if (grpcStatus === '16' || grpcStatus === '7') {
              return {
                ok: false,
                resultState: 'Authentication Failed',
                message: `Authentication Failed: ${grpcMessage || 'secret invalid'}`,
                latency: elapsed,
              };
            }
            return {
              ok: false,
              resultState: 'Transport Error',
              message: `Transport Error (gRPC ${grpcStatus}): ${grpcMessage || 'RPC failed'}`,
              latency: elapsed,
            };
          }
        } else {
          // Data frame
          hasData = true;
          startedAt = decodeStartedAt(body);
        }
      }

      if (!hasData) {
        return {
          ok: false,
          resultState: 'Transport Error',
          message: 'Transport Error: Empty response from Service API',
          latency: elapsed,
        };
      }

      return {
        ok: true,
        resultState: 'Connected',
        message: startedAt
          ? `Connected (Uptime: ${formatUptime(startedAt)}, ${elapsed}ms)`
          : `Connected (${elapsed}ms)`,
        latency: elapsed,
      };
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      const classified = classifyRequestError(err);
      return {
        ok: false,
        resultState: classified.resultState,
        message: classified.message,
        latency: elapsed,
      };
    }
  }

  public reconnect() {
    this.cleanup();
    if (!this.endpoint) {
      this.phase = 'unconfigured';
      this.resultState = undefined;
      this.error = undefined;
      this.currentStatus = null;
      this.startedAt = null;
      this.history = [];
      this.chartLabels.length = 0;
      this.chartUp.length = 0;
      this.chartDown.length = 0;
      this.chartInuse.length = 0;
      this.notify();
      return;
    }
    this.startConnection();
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private startConnection() {
    const targetUrl = this.endpoint;
    if (!targetUrl) {
      this.phase = 'unconfigured';
      this.resultState = undefined;
      this.error = undefined;
      this.notify();
      return;
    }

    this.phase = 'connecting';
    this.resultState = undefined;
    this.error = undefined;
    this.notify();

    // Stream status over gRPC-Web HTTP streaming
    this.connectHttpStream(targetUrl);
    // Fetch StartedAt timestamp concurrently
    this.fetchStartedAt(targetUrl);
  }

  private async connectHttpStream(baseUrl: string) {
    const controller = new AbortController();
    this.abortController = controller;
    const connectTimer = setTimeout(() => {
      controller.abort();
    }, 10000);
    const httpUrl = baseUrl + '/daemon.StartedService/SubscribeStatus';

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      };
      const secret = this.effectiveSecret();
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      const reqPayload = buildSubscribeStatusPayload();
      const fetchInit = getFetchInitWithLNA(
        {
          method: 'POST',
          headers,
          body: reqPayload,
          signal: controller.signal,
        },
        baseUrl
      );
      const res = await fetch(httpUrl, fetchInit);
      clearTimeout(connectTimer);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Unauthorized (${res.status}): check secret`);
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const headerGrpcStatus = res.headers.get('grpc-status');
      if (headerGrpcStatus && headerGrpcStatus !== '0') {
        const msg = res.headers.get('grpc-message') || `code ${headerGrpcStatus}`;
        if (headerGrpcStatus === '16' || headerGrpcStatus === '7') {
          this.phase = 'error';
          this.resultState = 'Authentication Failed';
          this.error = `Authentication Failed: ${msg}`;
          this.notify();
          this.scheduleReconnect();
          return;
        }
        throw new Error(`gRPC Error (${headerGrpcStatus}): ${msg}`);
      }

      if (!res.body) {
        throw new Error('Response body is empty');
      }

      const reader = res.body.getReader();
      let buffer = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          const merged = new Uint8Array(buffer.length + value.length);
          merged.set(buffer);
          merged.set(value, buffer.length);
          buffer = merged;

          while (buffer.length >= 5) {
            const flag = buffer[0];
            const len =
              ((buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4]) >>> 0;
            if (buffer.length < 5 + len) break;

            const body = buffer.slice(5, 5 + len);
            buffer = buffer.slice(5 + len);

            if ((flag & 0x80) !== 0) {
              // Trailer frame
              const trailerText = new TextDecoder().decode(body);
              const { grpcStatus, grpcMessage } = parseGrpcTrailers(trailerText);
              if (grpcStatus && grpcStatus !== '0') {
                if (grpcStatus === '16' || grpcStatus === '7') {
                  this.phase = 'error';
                  this.resultState = 'Authentication Failed';
                  this.error = `Authentication Failed: ${grpcMessage || 'secret invalid'}`;
                } else {
                  this.phase = 'error';
                  this.resultState = 'Transport Error';
                  this.error = `gRPC Error (${grpcStatus}): ${grpcMessage || 'stream failed'}`;
                }
                this.notify();
                this.scheduleReconnect();
                return;
              }
            } else {
              // Valid telemetry data frame!
              try {
                const status = decodeStatus(body);
                this.phase = 'connected';
                this.resultState = 'Connected';
                this.error = undefined;
                this.onNewStatus(status);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('singbox status decode error', err);
              }
            }
          }
        }
      }

      if (this.phase === 'connected') {
        this.phase = 'disconnected';
      } else {
        this.phase = 'error';
        this.resultState = this.resultState || 'Transport Error';
        this.error = this.error || 'Connection closed without telemetry';
      }
      this.notify();
      this.scheduleReconnect();
    } catch (err: any) {
      clearTimeout(connectTimer);
      if (controller.signal.aborted && this.abortController !== controller) return;
      this.phase = 'error';
      const classified = classifyRequestError(err);
      this.resultState = classified.resultState;
      this.error = classified.resultState;
      this.notify();
      this.scheduleReconnect();
    }
  }

  private async fetchStartedAt(baseUrl: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const httpUrl = baseUrl + '/daemon.StartedService/GetStartedAt';
      const headers: Record<string, string> = {
        'Content-Type': 'application/grpc-web+proto',
        'X-Grpc-Web': '1',
      };
      const secret = this.effectiveSecret();
      if (secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      // Empty gRPC frame
      const emptyFrame = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
      const fetchInit = getFetchInitWithLNA(
        {
          method: 'POST',
          headers,
          body: emptyFrame,
          signal: controller.signal,
        },
        baseUrl
      );
      const res = await fetch(httpUrl, fetchInit);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        let offset = 0;
        while (offset + 5 <= buf.length) {
          const flag = buf[offset];
          const len =
            ((buf[offset + 1] << 24) |
              (buf[offset + 2] << 16) |
              (buf[offset + 3] << 8) |
              buf[offset + 4]) >>> 0;
          if (offset + 5 + len > buf.length) break;
          const body = buf.slice(offset + 5, offset + 5 + len);
          offset += 5 + len;
          if ((flag & 0x80) === 0) {
            const val = decodeStartedAt(body);
            if (val) {
              this.startedAt = val;
              this.notify();
            }
          }
        }
      }
    } catch {
      // ignore
    } finally {
      clearTimeout(timer);
    }
  }

  private onNewStatus(status: SingBoxStatus) {
    this.currentStatus = status;
    const now = Date.now();
    this.history.push({
      timestamp: now,
      memory: status.memory,
      goroutines: status.goroutines,
    });
    if (this.history.length > MAX_HISTORY_POINTS) {
      this.history.shift();
    }

    const timeLabel = new Date(now).toLocaleTimeString();
    this.chartLabels.push(timeLabel);
    if (this.chartLabels.length > MAX_HISTORY_POINTS) {
      this.chartLabels.shift();
    }

    this.chartUp.push(status.trafficAvailable ? status.uplink : 0);
    if (this.chartUp.length > MAX_HISTORY_POINTS) {
      this.chartUp.shift();
    }

    this.chartDown.push(status.trafficAvailable ? status.downlink : 0);
    if (this.chartDown.length > MAX_HISTORY_POINTS) {
      this.chartDown.shift();
    }

    this.chartInuse.push(status.memory);
    if (this.chartInuse.length > MAX_HISTORY_POINTS) {
      this.chartInuse.shift();
    }

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
