import * as React from 'react';
import { ArrowRight, Radio } from 'react-feather';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { fetchConfigs } from 'src/api/configs';
import { BackendList } from 'src/components/BackendList';
import { SingBoxConfigSection } from 'src/components/SingBoxConfigSection';
import { addClashAPIConfig, getClashAPIConfig } from 'src/store/app';
import { closeModal } from 'src/store/modals';
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
  isModalOpen: s.modals.apiConfig,
});

function APIConfig({
  dispatch,
  apiConfig,
  isModalOpen,
}: {
  dispatch: DispatchFn;
  apiConfig: ClashAPIConfig;
  isModalOpen: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
    verify({ baseURL, secret }).then((ret) => {
      if (ret[0] !== Ok) {
        setErrMsg(ret[1]);
      } else {
        dispatch(addClashAPIConfig({ baseURL, secret, metaLabel }));
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

  const handleGoToOverview = useCallback(() => {
    dispatch(closeModal('apiConfig'));
    navigate('/');
  }, [dispatch, navigate]);

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
          <SvgYacd width={110} height={110} stroke="var(--stroke)" />
        </div>
      </div>

      {/* Clash API Configuration Section */}
      <div className={s0.section}>
        <div className={s0.sectionHeader}>
          <div className={s0.sectionTitle}>
            <Radio size={18} />
            <span>{t('clash_api') || 'Clash API'}</span>
          </div>
          <div className={s0.sectionDesc}>
            {t('clash_api_desc') ||
              'Provides proxy groups, rule providers, connections, and logs management.'}
          </div>
        </div>

        <div className={s0.body}>
          <div className={s0.inputsRow}>
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
              label="Secret (optional)"
              value={secret}
              type="text"
              onChange={handleInputOnChange}
            />
          </div>
          {errMsg ? <div className={s0.error}>{errMsg}</div> : null}
          <div className={s0.labelField}>
            <Field
              id="metaLabel"
              name="metaLabel"
              label="Label (optional)"
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

        <div style={{ height: 16 }} />
        <BackendList />
      </div>

      {/* Sing-box Service API Configuration Section */}
      <SingBoxConfigSection clashAPIConfig={apiConfig} />

      {/* Navigation to Overview */}
      <div className={s0.overviewAction}>
        <Button
          start={<ArrowRight size={16} />}
          label={t('dismiss_modal') || 'Continue to Overview'}
          onClick={handleGoToOverview}
        />
        <div className={s0.overviewHint}>
          {isModalOpen
            ? t('dismiss_modal_hint') ||
              'You can configure either or both APIs above, or proceed to Overview.'
            : ''}
        </div>
      </div>
    </div>
  );
}

export default connect(mapState)(APIConfig);

async function verify(apiConfig: ClashAPIConfig): Promise<[number, string?]> {
  try {
    new URL(apiConfig.baseURL);
  } catch (e) {
    if (apiConfig.baseURL) {
      const prefix = apiConfig.baseURL.substring(0, 7);
      if (prefix !== 'http://' && prefix !== 'https:/') {
        return [1, 'Must start with http:// or https://'];
      }
    }

    return [1, 'Invalid URL'];
  }
  try {
    const res = await fetchConfigs(apiConfig);
    if (res.status > 399) {
      return [1, res.statusText];
    }
    return [Ok];
  } catch (e) {
    return [1, 'Failed to connect'];
  }
}
