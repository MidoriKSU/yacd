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

export type SingBoxConnectionPhase = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SingBoxSnapshot {
  phase: SingBoxConnectionPhase;
  error?: string;
  status: SingBoxStatus | null;
  startedAt: number | null; // epoch ms
  endpoint: string;
  isCustomEndpoint: boolean;
  isCustomSecret: boolean;
  history: SingBoxMemoryPoint[];
}

export interface SingBoxConfig {
  endpoint: string;
  secret: string;
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

const STORAGE_CONFIG_KEY = 'yacd.singbox.config';
const LEGACY_STORAGE_ENDPOINT_KEY = 'yacd.singbox.service_endpoint';
const MAX_HISTORY_POINTS = 60;

export class SingBoxClient {
  private ws: WebSocket | null = null;
  private abortController: AbortController | null = null;
  private listeners = new Set<(snapshot: SingBoxSnapshot) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private phase: SingBoxConnectionPhase = 'disconnected';
  private error?: string;
  private currentStatus: SingBoxStatus | null = null;
  private startedAt: number | null = null;
  private history: SingBoxMemoryPoint[] = [];

  private currentUrl = '';
  private currentSecret = '';
  private customUrl = '';
  private customSecret = '';

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.customUrl = (parsed.endpoint || '').trim();
        this.customSecret = (parsed.secret || '').trim();
      } else {
        this.customUrl = (localStorage.getItem(LEGACY_STORAGE_ENDPOINT_KEY) || '').trim();
      }
    } catch {
      // ignore
    }
  }

  public getSnapshot(): SingBoxSnapshot {
    return {
      phase: this.phase,
      error: this.error,
      status: this.currentStatus,
      startedAt: this.startedAt,
      endpoint: this.effectiveUrl(),
      isCustomEndpoint: Boolean(this.customUrl),
      isCustomSecret: Boolean(this.customSecret),
      history: this.history,
    };
  }

  public getCustomConfig(): SingBoxConfig {
    return {
      endpoint: this.customUrl,
      secret: this.customSecret,
    };
  }

  public setCustomConfig(config: SingBoxConfig) {
    this.customUrl = (config.endpoint || '').trim();
    this.customSecret = (config.secret || '').trim();
    try {
      if (this.customUrl || this.customSecret) {
        localStorage.setItem(
          STORAGE_CONFIG_KEY,
          JSON.stringify({ endpoint: this.customUrl, secret: this.customSecret })
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

  public setCustomEndpoint(url: string) {
    this.setCustomConfig({ endpoint: url, secret: this.customSecret });
  }

  public effectiveUrl(): string {
    if (this.customUrl) return this.customUrl;
    return this.currentUrl;
  }

  public effectiveSecret(): string {
    if (this.customSecret) return this.customSecret;
    return this.currentSecret;
  }

  public updateConfig(baseURL: string, secret: string) {
    const normalized = baseURL.trim().replace(/\/+$/, '');
    if (this.currentUrl !== normalized || this.currentSecret !== secret) {
      this.currentUrl = normalized;
      this.currentSecret = secret;
      this.reconnect();
    }
  }

  public async testConnection(
    customUrl?: string,
    customSecret?: string
  ): Promise<{ ok: boolean; message: string; latency?: number }> {
    const url = (customUrl !== undefined ? customUrl : this.effectiveUrl())
      .trim()
      .replace(/\/+$/, '');
    const secret = (customSecret !== undefined ? customSecret : this.effectiveSecret()).trim();

    if (!url) {
      return { ok: false, message: 'Endpoint is empty' };
    }

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

      const res = await fetch(httpUrl, {
        method: 'POST',
        headers,
        body: emptyFrame,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const elapsed = Math.round(performance.now() - start);

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: `Unauthorized (${res.status}): secret invalid`,
          latency: elapsed,
        };
      }
      if (!res.ok) {
        return { ok: false, message: `HTTP ${res.status}: ${res.statusText}`, latency: elapsed };
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length >= 5) {
        const body = buf.slice(5);
        const startedAt = decodeStartedAt(body);
        return {
          ok: true,
          message: startedAt
            ? `OK (Uptime: ${formatUptime(startedAt)}, ${elapsed}ms)`
            : `OK (${elapsed}ms)`,
          latency: elapsed,
        };
      }
      return { ok: true, message: `OK (${elapsed}ms)`, latency: elapsed };
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      if (err.name === 'AbortError') {
        return { ok: false, message: 'Connection timed out (5s)', latency: elapsed };
      }
      return {
        ok: false,
        message: err.message || 'Network error or unreachable',
        latency: elapsed,
      };
    }
  }

  public reconnect() {
    this.cleanup();
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
    const targetUrl = this.effectiveUrl();
    if (!targetUrl) {
      this.phase = 'disconnected';
      this.error = 'No endpoint configured';
      this.notify();
      return;
    }

    this.phase = 'connecting';
    this.error = undefined;
    this.notify();

    // Try WebSocket connection with grpc-websockets subprotocol
    this.connectWebSocket(targetUrl);
    // Fetch StartedAt timestamp concurrently
    this.fetchStartedAt(targetUrl);
  }

  private connectWebSocket(baseUrl: string) {
    try {
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/daemon.StartedService/SubscribeStatus';
      const ws = new WebSocket(wsUrl, ['grpc-websockets']);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';

      let buffer = new Uint8Array(0);

      ws.onopen = () => {
        let headers =
          'content-type: application/grpc-web+proto\r\nx-grpc-web: 1\r\naccept-language: en\r\n';
        const secret = this.effectiveSecret();
        if (secret) {
          headers += `authorization: Bearer ${secret}\r\n`;
        }
        headers += '\r\n';
        ws.send(new TextEncoder().encode(headers));

        const reqPayload = buildSubscribeStatusPayload();
        ws.send(reqPayload);

        this.phase = 'connected';
        this.error = undefined;
        this.notify();
      };

      ws.onmessage = (evt) => {
        const chunk = new Uint8Array(evt.data as ArrayBuffer);
        const merged = new Uint8Array(buffer.length + chunk.length);
        merged.set(buffer);
        merged.set(chunk, buffer.length);
        buffer = merged;

        while (buffer.length >= 5) {
          const flag = buffer[0];
          const len =
            ((buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4]) >>> 0;
          if (buffer.length < 5 + len) break;

          const body = buffer.slice(5, 5 + len);
          buffer = buffer.slice(5 + len);

          if ((flag & 0x80) === 0) {
            // Data frame
            try {
              const status = decodeStatus(body);
              this.onNewStatus(status);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn('singbox status decode error', err);
            }
          }
        }
      };

      ws.onerror = () => {
        if (this.phase === 'connecting') {
          // Fall back to HTTP stream if WebSocket fails
          this.ws = null;
          this.connectHttpStream(baseUrl);
        }
      };

      ws.onclose = () => {
        if (this.ws === ws) {
          this.ws = null;
          this.phase = 'disconnected';
          this.notify();
          this.scheduleReconnect();
        }
      };
    } catch {
      this.connectHttpStream(baseUrl);
    }
  }

  private async connectHttpStream(baseUrl: string) {
    if (this.ws) return;

    const controller = new AbortController();
    this.abortController = controller;
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
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers,
        body: reqPayload,
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Unauthorized (${res.status}): check secret`);
        }
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      if (!res.body) {
        throw new Error('Response body is empty');
      }

      this.phase = 'connected';
      this.error = undefined;
      this.notify();

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

            if ((flag & 0x80) === 0) {
              try {
                const status = decodeStatus(body);
                this.onNewStatus(status);
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn('singbox status decode error', err);
              }
            }
          }
        }
      }

      this.phase = 'disconnected';
      this.notify();
      this.scheduleReconnect();
    } catch (err: any) {
      if (controller.signal.aborted) return;
      this.phase = 'error';
      this.error = err.message || 'Connection failed';
      this.notify();
      this.scheduleReconnect();
    }
  }

  private async fetchStartedAt(baseUrl: string) {
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
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers,
        body: emptyFrame,
      });
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length >= 5) {
          const body = buf.slice(5);
          const val = decodeStartedAt(body);
          if (val) {
            this.startedAt = val;
            this.notify();
          }
        }
      }
    } catch {
      // ignore
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
    this.notify();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startConnection();
    }, 5000);
  }
}

export const singBoxClient = new SingBoxClient();
