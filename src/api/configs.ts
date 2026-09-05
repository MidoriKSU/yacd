import { getURLAndInit } from 'src/misc/request-helper';
import { ClashGeneralConfig } from 'src/store/types';
import { ClashAPIConfig } from 'src/types';

const endpoint = '/configs';
const flushFakeIPPoolEndpoint = '/cache/fakeip/flush';
const updateGeoDatabasesFileEndpoint = '/configs/geo';

export async function fetchConfigs(apiConfig: ClashAPIConfig) {
  const { url, init } = getURLAndInit(apiConfig);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(url + endpoint, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// TODO support PUT /configs
// req body
// { Path: string }

type ClashConfigPartial = Partial<ClashGeneralConfig>;
function configsPatchWorkaround(o: ClashConfigPartial) {
  // backward compatibility for older clash  using `socket-port`
  if ('socks-port' in o) {
    o['socket-port'] = o['socks-port'];
  }
  return o;
}

export async function updateConfigs(apiConfig: ClashAPIConfig, o: ClashConfigPartial) {
  const { url, init } = getURLAndInit(apiConfig);
  const body = JSON.stringify(configsPatchWorkaround(o));
  return await fetch(url + endpoint, { ...init, body, method: 'PATCH' });
}

export async function reloadConfigs(
    apiConfig: ClashAPIConfig
) {
  const { url, init } = getURLAndInit(apiConfig);
  const body = '{"path": "", "payload": ""}';
  return await fetch(url + endpoint + '?force=true', { ...init, body, method: 'PUT' });
}

export async function flushFakeIPPool(
    apiConfig: ClashAPIConfig
) {
  const { url, init } = getURLAndInit(apiConfig);
  return await fetch(url + flushFakeIPPoolEndpoint, { ...init, method: 'POST' });
}

export async function updateGeoDatabasesFile(apiConfig: ClashAPIConfig) {
  const { url, init } = getURLAndInit(apiConfig);
  const body = '{"path": "", "payload": ""}';
  return await fetch(url + updateGeoDatabasesFileEndpoint, { ...init, body, method: 'POST' });
}