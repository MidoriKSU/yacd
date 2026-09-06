import * as React from 'react';
import { fetchConfigs } from 'src/api/configs';
import { BackendList } from 'src/components/BackendList';
import { addClashAPIConfig, getClashAPIConfig } from 'src/store/app';
import { DispatchFn, State } from 'src/store/types';
import { ClashAPIConfig } from 'src/types';

import s0 from './APIConfig.module.scss';
import Button from './Button';
import Field from './Field';
import { connect } from './StateProvider';
import SvgYacd from './SvgYacd';

const { useState, useRef, useCallback, useEffect } = React;
const Ok = 0;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

const mapState = (s: State) => ({
  apiConfig: getClashAPIConfig(s),
});

function APIConfig({ dispatch }: { dispatch: DispatchFn }) {
  const [baseURL, setBaseURL] = useState('');
  const [secret, setSecret] = useState('');
  const [metaLabel, setMetaLabel] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const userTouchedFlagRef = useRef(false);
  const contentEl = useRef<HTMLDivElement | null>(null);

  const handleInputOnChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>((e) => {
    userTouchedFlagRef.current = true;
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

  const onConfirm = useCallback(() => {
    const normalized = normalizeClashURL(baseURL);
    verify({ baseURL: normalized, secret }).then((ret) => {
      if (ret[0] !== Ok) {
        setErrMsg(ret[1]);
      } else {
        dispatch(addClashAPIConfig({ baseURL: normalized, secret, metaLabel }));
      }
    });
  }, [baseURL, secret, metaLabel, dispatch]);

  const handleContentOnKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.target instanceof Element &&
        (!e.target.tagName || e.target.tagName.toUpperCase() !== 'INPUT')
      ) {
        return;
      }
      if (e.key !== 'Enter') return;

      onConfirm();
    },
    [onConfirm],
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
    detectApiServer();
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={s0.root} ref={contentEl} onKeyDown={handleContentOnKeyDown}>
      <div className={s0.header}>
        <div className={s0.icon}>
          <SvgYacd width={160} height={160} stroke="var(--stroke)" />
        </div>
      </div>
      <div className={s0.body}>
        <div className={s0.hostnamePort}>
          <Field
            id="baseURL"
            name="baseURL"
            label="API Base URL"
            type="text"
            placeholder="http://127.0.0.1:9090"
            value={baseURL}
            onChange={handleInputOnChange}
          />
          <Field
            id="secret"
            name="secret"
            label="Secret(optional)"
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
        <Button label="Add" onClick={onConfirm} />
      </div>
      <div style={{ height: 20 }} />
      <BackendList />
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
