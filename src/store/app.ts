import { atomWithStorage } from 'jotai/utils';
import { DispatchFn, GetStateFn, State, StateApp } from 'src/store/types';

import { normalizeEndpoint, singBoxClient, SingBoxConfig } from '$src/api/singbox';
import { ClashAPIConfig, NativeAPIConfig } from '$src/types';

import { loadState, saveState } from '../misc/storage';
import { debounce, trimTrailingSlash } from '../misc/utils';
import { fetchConfigs } from './configs';
import { closeModal } from './modals';

const STORAGE_KEY = {
  darkModePureBlackToggle: 'yacd_darkModePureBlackToggle',
};

export const getClashAPIConfig = (s: State): ClashAPIConfig | undefined => {
  const idx = s.app.selectedClashAPIConfigIndex ?? 0;
  return s.app.clashAPIConfigs?.[idx];
};
export const getSelectedClashAPIConfigIndex = (s: State) => s.app.selectedClashAPIConfigIndex ?? 0;
export const getClashAPIConfigs = (s: State) => s.app.clashAPIConfigs || [];
export const getNativeAPIConfig = (s: State): NativeAPIConfig | undefined => {
  const idx = s.app.selectedNativeAPIConfigIndex ?? 0;
  return s.app.nativeAPIConfigs?.[idx];
};
export const getSelectedNativeAPIConfigIndex = (s: State) => s.app.selectedNativeAPIConfigIndex ?? 0;
export const getNativeAPIConfigs = (s: State) => s.app.nativeAPIConfigs || [];
export const getSingBoxConfig = (s: State): SingBoxConfig => {
  const native = s.app.nativeAPIConfigs?.[s.app.selectedNativeAPIConfigIndex];
  if (native) {
    return { endpoint: native.baseURL, secret: native.secret };
  }
  return s.app.singBoxConfig || singBoxClient.getCustomConfig();
};

export const hasSelectedClashBackend = (s: State): boolean => {
  const configs = s.app.clashAPIConfigs;
  if (!Array.isArray(configs) || configs.length === 0) return false;
  const idx = s.app.selectedClashAPIConfigIndex ?? 0;
  const conf = configs[idx];
  return Boolean(conf && typeof conf.baseURL === 'string' && conf.baseURL.trim() !== '');
};

export const hasSelectedNativeBackend = (s: State): boolean => {
  const configs = s.app.nativeAPIConfigs;
  if (Array.isArray(configs) && configs.length > 0) {
    const idx = s.app.selectedNativeAPIConfigIndex ?? 0;
    const conf = configs[idx];
    if (conf && typeof conf.baseURL === 'string' && conf.baseURL.trim() !== '') return true;
  }
  if (
    s.app.singBoxConfig &&
    typeof s.app.singBoxConfig.endpoint === 'string' &&
    s.app.singBoxConfig.endpoint.trim() !== ''
  ) {
    return true;
  }
  return singBoxClient.getSnapshot().isConfigured;
};

export const hasAnyConfiguredBackend = (s: State): boolean => {
  return hasSelectedClashBackend(s) || hasSelectedNativeBackend(s);
};

export const getTheme = (s: State) => s.app.theme;
export const getSelectedChartStyleIndex = (s: State) => s.app.selectedChartStyleIndex;
export const getLatencyTestUrl = (s: State) => s.app.latencyTestUrl;
export const getCollapsibleIsOpen = (s: State) => s.app.collapsibleIsOpen;
export const getProxySortBy = (s: State) => s.app.proxySortBy;
export const getHideUnavailableProxies = (s: State) => s.app.hideUnavailableProxies;
export const getAutoCloseOldConns = (s: State) => s.app.autoCloseOldConns;
export const getLogStreamingPaused = (s: State) => s.app.logStreamingPaused;

const saveStateDebounced = debounce(saveState, 600);

function findClashAPIConfigIndex(
  getState: GetStateFn,
  { baseURL, secret, metaLabel }: ClashAPIConfig,
) {
  const arr = getClashAPIConfigs(getState());
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (x.baseURL === baseURL && x.secret === secret && x.metaLabel === metaLabel) return i;
  }
}

export function addClashAPIConfig(conf: ClashAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findClashAPIConfigIndex(getState, conf);
    // already exists
    if (idx !== undefined) return;

    const clashAPIConfig = { ...conf, addedAt: Date.now() };
    dispatch('addClashAPIConfig', (s) => {
      s.app.clashAPIConfigs = s.app.clashAPIConfigs || [];
      s.app.clashAPIConfigs.push(clashAPIConfig);
      if (s.app.clashAPIConfigs.length === 1) {
        s.app.selectedClashAPIConfigIndex = 0;
      }
    });
    // side effect
    saveState(getState().app);
    if (getState().app.clashAPIConfigs.length === 1) {
      dispatch(fetchConfigs(clashAPIConfig));
    }
  };
}

export function removeClashAPIConfig(conf: ClashAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findClashAPIConfigIndex(getState, conf);
    if (idx === undefined || idx === -1) return;
    dispatch('removeClashAPIConfig', (s) => {
      s.app.clashAPIConfigs.splice(idx, 1);
      if (s.app.clashAPIConfigs.length === 0) {
        s.app.selectedClashAPIConfigIndex = 0;
      } else if (idx === s.app.selectedClashAPIConfigIndex) {
        s.app.selectedClashAPIConfigIndex = 0;
      } else if (idx < s.app.selectedClashAPIConfigIndex) {
        s.app.selectedClashAPIConfigIndex -= 1;
      }
    });
    // side effect
    saveState(getState().app);
  };
}

export function selectClashAPIConfig(conf: ClashAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findClashAPIConfigIndex(getState, conf);
    const curr = getSelectedClashAPIConfigIndex(getState());
    if (curr !== idx) {
      dispatch('selectClashAPIConfig', (s) => {
        s.app.selectedClashAPIConfigIndex = idx;
      });
    }
    // side effect
    saveState(getState().app);

    // manual clean up is too complex
    // we just reload the app
    try {
      window.location.reload();
    } catch (err) {
      // ignore
    }
  };
}

function findNativeAPIConfigIndex(
  getState: GetStateFn,
  { baseURL, secret, metaLabel }: NativeAPIConfig,
) {
  const arr = getNativeAPIConfigs(getState());
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    if (
      x.baseURL === baseURL &&
      (x.secret || '') === (secret || '') &&
      (x.metaLabel || '') === (metaLabel || '')
    ) {
      return i;
    }
  }
  return -1;
}

export function addNativeAPIConfig(conf: NativeAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findNativeAPIConfigIndex(getState, conf);
    // already exists
    if (idx !== -1) return;

    const nativeAPIConfig = { ...conf, addedAt: Date.now() };
    dispatch('addNativeAPIConfig', (s) => {
      s.app.nativeAPIConfigs = s.app.nativeAPIConfigs || [];
      s.app.nativeAPIConfigs.push(nativeAPIConfig);
      if (s.app.nativeAPIConfigs.length === 1) {
        s.app.selectedNativeAPIConfigIndex = 0;
        s.app.singBoxConfig = { endpoint: conf.baseURL, secret: conf.secret || '' };
      }
    });
    // side effect
    saveState(getState().app);
    if (getState().app.nativeAPIConfigs.length === 1) {
      singBoxClient.setCustomConfig({ endpoint: conf.baseURL, secret: conf.secret || '' });
    }
  };
}

export function removeNativeAPIConfig(conf: NativeAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findNativeAPIConfigIndex(getState, conf);
    if (idx === -1) return;
    dispatch('removeNativeAPIConfig', (s) => {
      s.app.nativeAPIConfigs.splice(idx, 1);
      if (s.app.nativeAPIConfigs.length === 0) {
        s.app.selectedNativeAPIConfigIndex = 0;
        s.app.singBoxConfig = { endpoint: '', secret: '' };
      } else if (idx === s.app.selectedNativeAPIConfigIndex) {
        s.app.selectedNativeAPIConfigIndex = 0;
      } else if (idx < s.app.selectedNativeAPIConfigIndex) {
        s.app.selectedNativeAPIConfigIndex -= 1;
      }
    });
    // side effect
    saveState(getState().app);
    const active = getNativeAPIConfig(getState());
    if (active && active.baseURL) {
      singBoxClient.setCustomConfig({ endpoint: active.baseURL, secret: active.secret || '' });
    } else {
      singBoxClient.setCustomConfig({ endpoint: '', secret: '' });
    }
  };
}

export function selectNativeAPIConfig(conf: NativeAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const idx = findNativeAPIConfigIndex(getState, conf);
    if (idx === -1) return;
    const curr = getSelectedNativeAPIConfigIndex(getState());
    if (curr !== idx) {
      dispatch('selectNativeAPIConfig', (s) => {
        s.app.selectedNativeAPIConfigIndex = idx;
        s.app.singBoxConfig = { endpoint: conf.baseURL, secret: conf.secret || '' };
      });
    }
    // side effect
    saveState(getState().app);
    singBoxClient.setCustomConfig({ endpoint: conf.baseURL, secret: conf.secret || '' });
    dispatch(closeModal('apiConfig'));
  };
}

// unused
export function updateClashAPIConfig(conf: ClashAPIConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const clashAPIConfig = conf;
    dispatch('appUpdateClashAPIConfig', (s) => {
      s.app.clashAPIConfigs[0] = clashAPIConfig;
    });
    // side effect
    saveState(getState().app);
    dispatch(closeModal('apiConfig'));
    dispatch(fetchConfigs(clashAPIConfig));
  };
}

export function updateSingBoxConfig(conf: SingBoxConfig) {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const nextConfig: SingBoxConfig = {
      endpoint: normalizeEndpoint(conf.endpoint),
      secret: (conf.secret || '').trim(),
    };
    dispatch('appUpdateSingBoxConfig', (s) => {
      s.app.singBoxConfig = nextConfig;
    });
    saveState(getState().app);
    singBoxClient.setCustomConfig(nextConfig);
  };
}

export function clearSingBoxConfig() {
  return async (dispatch: DispatchFn, getState: GetStateFn) => {
    const emptyConfig: SingBoxConfig = { endpoint: '', secret: '' };
    dispatch('appClearSingBoxConfig', (s) => {
      s.app.singBoxConfig = emptyConfig;
    });
    saveState(getState().app);
    singBoxClient.setCustomConfig(emptyConfig);
  };
}

const rootEl = document.querySelector('html');
type ThemeType = 'dark' | 'light' | 'auto';

function insertThemeColorMeta(color: string, media?: string) {
  const meta0 = document.createElement('meta');
  meta0.setAttribute('name', 'theme-color');
  meta0.setAttribute('content', color);
  if (media) meta0.setAttribute('media', media);
  document.head.appendChild(meta0);
}

function updateMetaThemeColor(theme: ThemeType) {
  const metas = Array.from(
    document.querySelectorAll('meta[name=theme-color]'),
  ) as HTMLMetaElement[];
  let meta0: HTMLMetaElement;
  for (const m of metas) {
    if (!m.getAttribute('media')) {
      meta0 = m;
    } else {
      document.head.removeChild(m);
    }
  }

  if (theme === 'auto') {
    insertThemeColorMeta('#eeeeee', '(prefers-color-scheme: light)');
    insertThemeColorMeta('#202020', '(prefers-color-scheme: dark)');
    if (meta0) {
      document.head.removeChild(meta0);
    } else {
      return;
    }
  } else {
    const color = theme === 'light' ? '#eeeeee' : '#202020';
    if (!meta0) {
      insertThemeColorMeta(color);
    } else {
      meta0.setAttribute('content', color);
    }
  }
}

function setTheme(theme: ThemeType = 'dark') {
  if (theme === 'auto') {
    rootEl.setAttribute('data-theme', 'auto');
  } else if (theme === 'dark') {
    rootEl.setAttribute('data-theme', 'dark');
  } else {
    rootEl.setAttribute('data-theme', 'light');
  }
  updateMetaThemeColor(theme);
}

export function switchTheme(nextTheme = 'auto') {
  return (dispatch: DispatchFn, getState: GetStateFn) => {
    const currentTheme = getTheme(getState());
    if (currentTheme === nextTheme) return;
    // side effect
    setTheme(nextTheme as ThemeType);
    dispatch('storeSwitchTheme', (s) => {
      s.app.theme = nextTheme;
    });
    // side effect
    saveState(getState().app);
  };
}

export function selectChartStyleIndex(selectedChartStyleIndex: number | string) {
  return (dispatch: DispatchFn, getState: GetStateFn) => {
    dispatch('appSelectChartStyleIndex', (s) => {
      s.app.selectedChartStyleIndex = Number(selectedChartStyleIndex);
    });
    // side effect
    saveState(getState().app);
  };
}

export function updateAppConfig(name: string, value: unknown) {
  return (dispatch: DispatchFn, getState: GetStateFn) => {
    dispatch('appUpdateAppConfig', (s) => {
      s.app[name] = value;
    });
    // side effect
    saveState(getState().app);
  };
}

export function updateCollapsibleIsOpen(prefix: string, name: string, v: boolean) {
  return (dispatch: DispatchFn, getState: GetStateFn) => {
    dispatch('updateCollapsibleIsOpen', (s: State) => {
      s.app.collapsibleIsOpen[`${prefix}:${name}`] = v;
    });
    // side effect
    saveStateDebounced(getState().app);
  };
}

const defaultState: StateApp = {
  selectedClashAPIConfigIndex: 0,
  clashAPIConfigs: [],
  selectedNativeAPIConfigIndex: 0,
  nativeAPIConfigs: [],
  singBoxConfig: { endpoint: '', secret: '' },

  latencyTestUrl: 'http://www.gstatic.com/generate_204',
  selectedChartStyleIndex: 0,
  theme: 'dark',

  // type { [string]: boolean }
  collapsibleIsOpen: {},
  // how proxies are sorted in a group or provider
  proxySortBy: 'Natural',
  hideUnavailableProxies: false,
  autoCloseOldConns: false,
  logStreamingPaused: false,
};

const CONFIG_QUERY_PARAMS = ['hostname', 'port', 'secret', 'theme'];

function parseConfigQueryString() {
  const { search } = window.location;
  const collector: Record<string, string> = {};
  const sp = new URLSearchParams(search);
  let shouldUpdateAddressBar = false;
  if (typeof search !== 'string' || search === '') {
    return [collector, sp, shouldUpdateAddressBar] as const;
  }
  for (const key of CONFIG_QUERY_PARAMS) {
    const v = sp.get(key);
    if (v) {
      shouldUpdateAddressBar = true;
      collector[key] = v;
      // sp can contain secret etc. and we better remove these
      sp.delete(key);
    }
  }
  return [collector, sp, shouldUpdateAddressBar] as const;
}

export function initialState() {
  let s = loadState();
  s = { ...defaultState, ...s };

  if (!Array.isArray(s.clashAPIConfigs)) {
    s.clashAPIConfigs = [];
  }
  const domBaseUrl = document.getElementById('app')?.getAttribute('data-base-url');
  if (domBaseUrl && s.clashAPIConfigs.length === 0) {
    s.clashAPIConfigs = [{ baseURL: domBaseUrl, secret: '', addedAt: 0 }];
    s.selectedClashAPIConfigIndex = 0;
  }

  if (!Array.isArray(s.nativeAPIConfigs) || s.nativeAPIConfigs.length === 0) {
    if (s.singBoxConfig && s.singBoxConfig.endpoint) {
      s.nativeAPIConfigs = [
        {
          baseURL: s.singBoxConfig.endpoint,
          secret: s.singBoxConfig.secret || '',
          addedAt: 0,
        },
      ];
      s.selectedNativeAPIConfigIndex = 0;
    } else {
      s.nativeAPIConfigs = [];
    }
  }

  if (
    s.selectedClashAPIConfigIndex == null ||
    s.selectedClashAPIConfigIndex >= s.clashAPIConfigs.length
  ) {
    s.selectedClashAPIConfigIndex = 0;
  }

  if (
    s.selectedNativeAPIConfigIndex == null ||
    s.selectedNativeAPIConfigIndex >= s.nativeAPIConfigs.length
  ) {
    s.selectedNativeAPIConfigIndex = 0;
  }

  const activeNative = s.nativeAPIConfigs[s.selectedNativeAPIConfigIndex];
  if (activeNative && activeNative.baseURL) {
    singBoxClient.setCustomConfig({
      endpoint: activeNative.baseURL,
      secret: activeNative.secret || '',
    });
    s.singBoxConfig = {
      endpoint: activeNative.baseURL,
      secret: activeNative.secret || '',
    };
  } else if (s.singBoxConfig && s.singBoxConfig.endpoint) {
    singBoxClient.setCustomConfig(s.singBoxConfig);
  } else {
    singBoxClient.setCustomConfig({ endpoint: '', secret: '' });
    s.singBoxConfig = { endpoint: '', secret: '' };
  }

  const [query, sp, shouldUpdateAddressBar] = parseConfigQueryString();
  if (shouldUpdateAddressBar && history?.replaceState) {
    const target = location.pathname + location.hash + (sp.size > 0 ? `?${sp}` : '');
    history.replaceState(null, '', target);
  }
  if (s.clashAPIConfigs.length > 0 && s.clashAPIConfigs[s.selectedClashAPIConfigIndex]) {
    const conf = s.clashAPIConfigs[s.selectedClashAPIConfigIndex];
    if (conf && conf.baseURL) {
      try {
        const url = new URL(conf.baseURL);
        if (query.hostname) {
          if (query.hostname.indexOf('http') === 0) {
            url.href = decodeURIComponent(query.hostname);
          } else {
            url.hostname = query.hostname;
          }
        }
        if (query.port) {
          url.port = query.port;
        }
        conf.baseURL = trimTrailingSlash(url.href);
        if (query.secret) {
          conf.secret = query.secret;
        }
      } catch {
        // ignore invalid baseURL
      }
    }
  } else if (query.hostname) {
    const proto = query.hostname.indexOf('http') === 0 ? '' : 'http://';
    const port = query.port ? `:${query.port}` : '';
    const newConf = {
      baseURL: trimTrailingSlash(`${proto}${query.hostname}${port}`),
      secret: query.secret || '',
      addedAt: Date.now(),
    };
    s.clashAPIConfigs = [newConf];
    s.selectedClashAPIConfigIndex = 0;
  }

  if (query.theme === 'dark' || query.theme === 'light') {
    s.theme = query.theme;
  }
  // set initial theme
  setTheme(s.theme);
  return s;
}

export const darkModePureBlackToggleAtom = atomWithStorage(
  STORAGE_KEY.darkModePureBlackToggle,
  false,
);
