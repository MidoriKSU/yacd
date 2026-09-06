import type { ClashAPIConfig, LogsAPIConfig } from '../types';

const trimTrailingSlash = (s: string) => s.replace(/\/$/, '');

const headersCommon = { 'Content-Type': 'application/json' };

function genCommonHeaders({ secret }: { secret?: string }) {
  const h = { ...headersCommon };
  if (secret) {
    h['Authorization'] = `Bearer ${secret}`;
  }
  return h;
}
function buildWebSocketURLBase(baseURL: string, params: URLSearchParams, endpoint: string) {
  if (!baseURL) return '';
  try {
    const qs = '?' + params.toString();
    const url = new URL(baseURL);
    url.protocol === 'https:' ? (url.protocol = 'wss:') : (url.protocol = 'ws:');
    return `${trimTrailingSlash(url.href)}${endpoint}${qs}`;
  } catch {
    return '';
  }
}

function getTargetAddressSpace(urlStr: string): 'loopback' | 'local' | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0:0:0:0:0:0:0:1' ||
      host.startsWith('127.') ||
      host.endsWith('.localhost')
    ) {
      return 'loopback';
    }
    if (
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      host.endsWith('.local')
    ) {
      return 'local';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function getURLAndInit({ baseURL, secret }: ClashAPIConfig) {
  const headers = genCommonHeaders({ secret });
  const targetSpace = baseURL ? getTargetAddressSpace(baseURL) : undefined;
  const isHttps = typeof window !== 'undefined' && window.location?.protocol === 'https:';
  return {
    url: baseURL,
    init: {
      headers,
      ...(isHttps && targetSpace ? { targetAddressSpace: targetSpace } : {}),
    } as RequestInit,
  };
}

export function buildWebSocketURL(apiConfig: ClashAPIConfig, endpoint: string) {
  const { baseURL, secret } = apiConfig;
  const params = new URLSearchParams({
    token: secret,
  });

  return buildWebSocketURLBase(baseURL, params, endpoint);
}

export function buildLogsWebSocketURL(apiConfig: LogsAPIConfig, endpoint: string) {
  const { baseURL, secret, logLevel } = apiConfig;
  const params = new URLSearchParams({
    token: secret,
    level: logLevel,
  });

  return buildWebSocketURLBase(baseURL, params, endpoint);
}
