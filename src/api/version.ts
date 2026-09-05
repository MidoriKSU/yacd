import { getURLAndInit } from 'src/misc/request-helper';
import { ClashAPIConfig } from 'src/types';

type VersionData = {
  version?: string;
  premium?: boolean;
  meta?: boolean;
};

export async function fetchVersion(
  endpoint: string,
  apiConfig: ClashAPIConfig,
): Promise<VersionData> {
  let json = {};
  if (!apiConfig || !apiConfig.baseURL) {
    return json;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const { url, init } = getURLAndInit(apiConfig);
    const res = await fetch(url + endpoint, {
      ...init,
      signal: controller.signal,
    });
    if (res.ok) {
      json = await res.json();
    }
  } catch (err) {
    // log and ignore
    // eslint-disable-next-line no-console
    console.log(`failed to fetch ${endpoint}`, err);
  } finally {
    clearTimeout(timer);
  }
  return json;
}
