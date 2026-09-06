import * as React from 'react';
import { ChevronLeft } from 'react-feather';
import { Link } from 'react-router-dom';
import { testNativeConnection } from 'src/api/singbox';
import { NativeBackendList } from 'src/components/NativeBackendList';
import { ThemeSwitcher } from 'src/components/shared/ThemeSwitcher';
import { addNativeAPIConfig, getNativeAPIConfig } from 'src/store/app';
import { DispatchFn, State } from 'src/store/types';

import s0 from './APIConfig.module.scss';
import Button from './Button';
import Field from './Field';
import { connect } from './StateProvider';
import SvgYacd from './SvgYacd';

const { useState, useRef, useCallback } = React;

const mapState = (s: State) => ({
  nativeAPIConfig: getNativeAPIConfig(s),
});

function NativeAPIConfig({ dispatch }: { dispatch: DispatchFn }) {
  const [baseURL, setBaseURL] = useState('');
  const [secret, setSecret] = useState('');
  const [metaLabel, setMetaLabel] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const contentEl = useRef<HTMLDivElement | null>(null);

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

  const onConfirm = useCallback(() => {
    const trimmed = (baseURL || '').trim();
    if (!trimmed) {
      setErrMsg('Invalid URL');
      return;
    }
    setIsVerifying(true);
    testNativeConnection(trimmed, secret).then((ret) => {
      setIsVerifying(false);
      if (!ret.ok) {
        setErrMsg(ret.error || 'Failed to connect');
      } else {
        dispatch(addNativeAPIConfig({ baseURL: trimmed, secret, metaLabel }));
        setBaseURL('');
        setSecret('');
        setMetaLabel('');
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

  return (
    <div className={s0.pageWrapper}>
      <div className={s0.topBar}>
        <Link to="/configs" className={s0.backLink}>
          <ChevronLeft size={20} />
          <span>Config</span>
        </Link>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={s0.container} ref={contentEl} onKeyDown={handleContentOnKeyDown}>
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
              label="Native API Base URL"
              type="text"
              placeholder="http://127.0.0.1:9080"
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
          <Button
            label={isVerifying ? 'Verifying...' : 'Add'}
            onClick={onConfirm}
            disabled={isVerifying}
          />
        </div>
        <div style={{ height: 20 }} />
        <NativeBackendList />
      </div>
      <div className={s0.fixed}>
        <ThemeSwitcher />
      </div>
    </div>
  );
}

export default connect(mapState)(NativeAPIConfig);
