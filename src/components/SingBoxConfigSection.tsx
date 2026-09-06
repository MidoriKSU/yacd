import cx from 'clsx';
import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Server,
  Trash2,
} from 'react-feather';
import { useTranslation } from 'react-i18next';
import {
  formatUptime,
  singBoxClient,
  SingBoxConfig,
  SingBoxResultState,
  SingBoxSnapshot,
} from 'src/api/singbox';
import Button from 'src/components/Button';
import Input from 'src/components/Input';
import { connect, useStoreActions } from 'src/components/StateProvider';
import { getSingBoxConfig } from 'src/store/app';
import { DispatchFn, State } from 'src/store/types';
import { ClashAPIConfig } from 'src/types';

import s0 from './SingBoxConfigSection.module.scss';

const { useState, useEffect, useRef } = React;

interface SingBoxConfigSectionProps {
  dispatch: DispatchFn;
  currentStoreConfig: SingBoxConfig;
  clashAPIConfig?: ClashAPIConfig;
  onConfigSaved?: () => void;
  className?: string;
  hideHeaderDesc?: boolean;
}

const mapState = (s: State) => ({
  currentStoreConfig: getSingBoxConfig(s),
});

export const SingBoxConfigSection = connect(mapState)(SingBoxConfigSectionImpl);

function SingBoxConfigSectionImpl({
  dispatch: _dispatch,
  currentStoreConfig,
  clashAPIConfig,
  onConfigSaved,
  className,
  hideHeaderDesc,
}: SingBoxConfigSectionProps) {
  const { t } = useTranslation();
  const {
    app: { updateSingBoxConfig, clearSingBoxConfig },
  } = useStoreActions();

  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() =>
    singBoxClient.getSnapshot()
  );

  const [endpoint, setEndpoint] = useState(currentStoreConfig.endpoint || '');
  const [secret, setSecret] = useState(currentStoreConfig.secret || '');
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latency?: number;
    resultState?: SingBoxResultState;
    errorType?: string;
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  const prevStoreConfig = useRef(currentStoreConfig);
  useEffect(() => {
    if (
      prevStoreConfig.current.endpoint !== currentStoreConfig.endpoint ||
      prevStoreConfig.current.secret !== currentStoreConfig.secret
    ) {
      setEndpoint(currentStoreConfig.endpoint || '');
      setSecret(currentStoreConfig.secret || '');
      prevStoreConfig.current = currentStoreConfig;
    }
  }, [currentStoreConfig]);

  useEffect(() => {
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, []);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateSingBoxConfig({ endpoint, secret });
    setIsSaved(true);
    setTestResult(null);
    if (onConfigSaved) {
      onConfigSaved();
    }
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleClear = () => {
    setEndpoint('');
    setSecret('');
    clearSingBoxConfig();
    setIsSaved(true);
    setTestResult(null);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCopyClash = () => {
    if (clashAPIConfig?.baseURL) {
      setEndpoint(clashAPIConfig.baseURL);
    }
    if (clashAPIConfig?.secret) {
      setSecret(clashAPIConfig.secret);
    }
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await singBoxClient.testConnection(endpoint, secret);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        ok: false,
        resultState: 'Transport Error',
        message: err?.message || 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const phaseLabel = (() => {
    switch (snapshot.phase) {
      case 'unconfigured':
        return t('unconfigured') || 'Not configured';
      case 'connecting':
        return t('connecting') || 'Connecting';
      case 'connected':
        return t('connected') || 'Connected';
      case 'error':
        if (snapshot.resultState) {
          return snapshot.resultState;
        }
        return snapshot.error || 'Connection error';
      case 'disconnected':
      default:
        return t('disconnected') || 'Disconnected';
    }
  })();

  return (
    <div className={cx(s0.card, className)}>
      <div className={s0.header}>
        <div className={s0.headerRow}>
          <div className={s0.title}>
            <Server size={18} />
            <span>{t('singbox_service_api') || 'sing-box Service API'}</span>
          </div>
          <div className={s0.badge}>
            <span className={cx(s0.dot, s0[snapshot.phase])} />
            <span>{phaseLabel}</span>
            {snapshot.startedAt ? (
              <span className={s0.badgeUptime}>
                · {formatUptime(snapshot.startedAt)}
              </span>
            ) : null}
          </div>
        </div>
        {!hideHeaderDesc && (
          <div className={s0.desc}>
            {t('singbox_service_api_desc') ||
              'Native runtime telemetry via gRPC-Web.'}
          </div>
        )}
      </div>

      <div className={s0.inputsRow}>
        <div className={s0.fieldGroup}>
          <div className={s0.label}>
            {t('service_api_endpoint') || 'Service API Endpoint'}
          </div>
          <Input
            type="text"
            value={endpoint}
            placeholder="http://127.0.0.1:9080"
            onChange={(e) => {
              setEndpoint(e.target.value);
              setTestResult(null);
            }}
          />
        </div>

        <div className={s0.fieldGroup}>
          <div className={s0.label}>
            {t('service_api_secret') || 'Service API Secret'}
          </div>
          <div className={s0.secretWrapper}>
            <Input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              placeholder="Bearer secret (optional)"
              onChange={(e) => {
                setSecret(e.target.value);
                setTestResult(null);
              }}
            />
            <button
              type="button"
              className={s0.eyeBtn}
              onClick={() => setShowSecret(!showSecret)}
              title={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {testResult && (
        <div
          className={`${s0.testFeedback} ${
            testResult.ok ? s0.success : s0.error
          }`}
        >
          {testResult.ok ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className={s0.actions}>
        <Button
          start={
            testing ? (
              <RefreshCw size={16} className={s0.spin} />
            ) : (
              <Activity size={16} />
            )
          }
          label={testing ? 'Testing...' : t('test_connection') || 'Test Connection'}
          onClick={handleTest}
        />
        <Button
          start={isSaved ? <Check size={16} /> : undefined}
          label={isSaved ? t('saved') || 'Saved!' : t('save_and_apply') || 'Save / Apply'}
          onClick={handleSave}
        />
        {clashAPIConfig?.baseURL && (
          <Button
            label={t('copy_from_clash') || 'Use Clash Backend'}
            onClick={handleCopyClash}
          />
        )}
        {snapshot.isConfigured && (
          <Button
            start={<Trash2 size={16} />}
            label={t('clear_config') || 'Clear Config'}
            onClick={handleClear}
          />
        )}
      </div>
    </div>
  );
}

export default SingBoxConfigSection;
