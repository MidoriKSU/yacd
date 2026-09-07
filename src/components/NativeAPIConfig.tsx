import * as React from 'react';
import { ChevronLeft } from 'react-feather';
import { Link } from 'react-router-dom';
import { testNativeConnection, validateEndpoint } from 'src/api/singbox';
import { NativeBackendList } from 'src/components/NativeBackendList';
import { ThemeSwitcher } from 'src/components/shared/ThemeSwitcher';
import { addNativeAPIConfig, getNativeAPIConfig } from 'src/store/app';
import { DispatchFn, State } from 'src/store/types';

import s0 from './APIConfig.module.scss';
import Button from './Button';
import Field from './Field';
import { connect } from './StateProvider';
import SvgYacd from './SvgYacd';

const { useState, useCallback } = React;

const mapState = (s: State) => ({
  nativeAPIConfig: getNativeAPIConfig(s),
});

function NativeAPIConfig({ dispatch }: { dispatch: DispatchFn }) {
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
            dispatch(addNativeAPIConfig({ baseURL: normalizedURL, secret: rawSecret, metaLabel: rawMetaLabel }));
            setBaseURL('');
            setSecret('');
            setMetaLabel('');
          }
        })
        .catch((err) => {
          setIsVerifying(false);
          setErrMsg(err?.message || 'Failed to connect');
        });
    },
    [dispatch],
  );

  return (
    <div className={s0.pageWrapper}>
      <div className={s0.topBar}>
        <Link to="/configs" className={s0.backLink}>
          <ChevronLeft size={20} />
          <span>Config</span>
        </Link>
      </div>
      <div className={s0.container}>
        <div className={s0.header}>
          <div className={s0.icon}>
            <SvgYacd width={160} height={160} stroke="var(--stroke)" />
          </div>
        </div>
        <form onSubmit={onSubmit}>
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
              disabled={isVerifying}
            />
          </div>
        </form>
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
