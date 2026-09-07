import cx from 'clsx';
import * as React from 'react';
import { fetchConfigs } from 'src/api/configs';
import { testNativeConnection, validateEndpoint } from 'src/api/singbox';
import { BackendList } from 'src/components/BackendList';
import { NativeBackendList } from 'src/components/NativeBackendList';
import {
  addClashAPIConfig,
  addNativeAPIConfig,
  getClashAPIConfig,
  getNativeAPIConfig,
  hasSelectedClashBackend,
  hasSelectedNativeBackend,
} from 'src/store/app';
import { closeModal } from 'src/store/modals';
import { DispatchFn, State } from 'src/store/types';
import { ClashAPIConfig, NativeAPIConfig } from 'src/types';

import s0 from './APIConfig.module.scss';
import Button from './Button';
import Field from './Field';
import { connect } from './StateProvider';
import SvgYacd from './SvgYacd';

const { useState, useCallback, useEffect } = React;
const Ok = 0;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const mapState = (s: State) => ({
  hasClash: hasSelectedClashBackend(s),
  hasNative: hasSelectedNativeBackend(s),
  apiConfig: getClashAPIConfig(s),
  nativeAPIConfig: getNativeAPIConfig(s),
});

function APIConfig({
  dispatch,
  hasClash,
  hasNative,
}: {
  dispatch: DispatchFn;
  hasClash: boolean;
  hasNative: boolean;
  apiConfig?: ClashAPIConfig;
  nativeAPIConfig?: NativeAPIConfig;
}) {
  const [activeTab, setActiveTab] = useState<'clash' | 'native'>(() => {
    if (hasNative && !hasClash) return 'native';
    return 'clash';
  });
  const [baseURL, setBaseURL] = useState('');
  const [secret, setSecret] = useState('');
  const [metaLabel, setMetaLabel] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleInputOnChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>((e) => {
    setErrMsg('');
    const target = e.target;
    const { name, value } = target;
    switch (name) {
      case 'baseURL':
        setBaseURL(value);
        break;
      case 'secret':
        setSecret(value);
        break;
      case 'metaLabel':
        setMetaLabel(value);
        break;
      default:
        throw new Error(`unknown input name ${name}`);
    }
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const data = new FormData(e.currentTarget);

      const rawBaseURL = String(data.get('baseURL') || '');
      const rawSecret = String(data.get('secret') || '');
      const rawMetaLabel = String(data.get('metaLabel') || '');

      setBaseURL(rawBaseURL);
      setSecret(rawSecret);
      setMetaLabel(rawMetaLabel);

      if (activeTab === 'native') {
        const trimmed = rawBaseURL.trim();
        const validation = validateEndpoint(trimmed);
        if (!validation.valid) {
          setErrMsg(validation.error || 'Invalid URL');
          return;
        }
        const normalizedURL = validation.url!;
        setIsVerifying(true);
        testNativeConnection(normalizedURL, rawSecret)
          .then((ret) => {
            setIsVerifying(false);
            if (!ret.ok) {
              setErrMsg(ret.error || 'Failed to connect');
            } else {
              dispatch(
                addNativeAPIConfig({
                  baseURL: normalizedURL,
                  secret: rawSecret,
                  metaLabel: rawMetaLabel,
                }),
              );
              dispatch(closeModal('apiConfig'));
              setBaseURL('');
              setSecret('');
              setMetaLabel('');
            }
          })
          .catch((err) => {
            setIsVerifying(false);
            setErrMsg(err?.message || 'Failed to connect');
          });
      } else {
        const normalized = normalizeClashURL(rawBaseURL);
        if (!normalized) {
          setErrMsg('Invalid URL');
          return;
        }
        setIsVerifying(true);
        verify({ baseURL: normalized, secret: rawSecret })
          .then((ret) => {
            setIsVerifying(false);
            if (ret[0] !== Ok) {
              setErrMsg(ret[1] || 'Failed to connect');
            } else {
              dispatch(
                addClashAPIConfig({
                  baseURL: normalized,
                  secret: rawSecret,
                  metaLabel: rawMetaLabel,
                }),
              );
              dispatch(closeModal('apiConfig'));
              setBaseURL('');
              setSecret('');
              setMetaLabel('');
            }
          })
          .catch((err) => {
            setIsVerifying(false);
            setErrMsg(err?.message || 'Failed to connect');
          });
      }
    },
    [activeTab, dispatch],
  );

  const detectApiServer = async () => {
    try {
      const res = await fetch('/');
      const data = await res.json();
      if (data && data['hello'] === 'clash') {
        setBaseURL(window.location.origin);
      }
    } catch {
      noop();
    }
  };

  useEffect(() => {
    if (activeTab === 'clash') {
      detectApiServer();
    }
  }, [activeTab]);

  return (
    <div className={s0.root}>
      <div className={s0.header}>
        <div className={s0.icon}>
          <SvgYacd width={160} height={160} stroke="var(--stroke)" />
        </div>
      </div>

      <div className={s0.tabGroup}>
        <button
          type="button"
          className={cx(s0.tabBtn, { [s0.tabActive]: activeTab === 'clash' })}
          onClick={() => {
            setActiveTab('clash');
            setErrMsg('');
            setBaseURL('');
            setSecret('');
            setMetaLabel('');
          }}
        >
          Clash API
        </button>
        <button
          type="button"
          className={cx(s0.tabBtn, { [s0.tabActive]: activeTab === 'native' })}
          onClick={() => {
            setActiveTab('native');
            setErrMsg('');
            setBaseURL('');
            setSecret('');
            setMetaLabel('');
          }}
        >
          sing-box Native API
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <div className={s0.body}>
          <div className={s0.hostnamePort}>
            <Field
              id="baseURL"
              name="baseURL"
              label={activeTab === 'native' ? 'Native API Base URL' : 'API Base URL'}
              type="text"
              placeholder={activeTab === 'native' ? 'http://127.0.0.1:9080' : 'http://127.0.0.1:9090'}
              value={baseURL}
              onChange={handleInputOnChange}
            />
            <Field
              id="secret"
              name="secret"
              label={activeTab === 'native' ? 'Native API Secret (optional)' : 'Secret(optional)'}
              value={secret}
              type="text"
              onChange={handleInputOnChange}
            />
          </div>
          {errMsg ? <div className={s0.error}>{errMsg}</div> : null}
          <div className={s0.label}>
            <Field
              id="metaLabel"
              name="metaLabel"
              label="Label(optional)"
              type="text"
              placeholder=""
              value={metaLabel}
              onChange={handleInputOnChange}
            />
          </div>
        </div>
        <div className={s0.footer}>
          <Button label="Add" isLoading={isVerifying} disabled={isVerifying} />
        </div>
      </form>
      <div style={{ height: 20 }} />
      {activeTab === 'native' ? <NativeBackendList /> : <BackendList />}
    </div>
  );
}

export default connect(mapState)(APIConfig);

function normalizeClashURL(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

async function verify(apiConfig: ClashAPIConfig): Promise<[number, string?]> {
  const normalizedBaseURL = normalizeClashURL(apiConfig.baseURL);
  try {
    new URL(normalizedBaseURL);
  } catch (e) {
    return [1, 'Invalid URL'];
  }
  try {
    const res = await fetchConfigs({ ...apiConfig, baseURL: normalizedBaseURL });
    if (res.status > 399) {
      return [1, res.statusText];
    }
    return [Ok];
  } catch (e) {
    return [1, 'Failed to connect'];
  }
}
