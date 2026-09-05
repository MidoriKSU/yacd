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
        message: err?.message || 'Connection test failed',
        errorType: 'unreachable',
      });
    } finally {
      setTesting(false);
    }
  };

  const phaseLabel = {
    unconfigured: t('unconfigured') || 'Not Configured',
    connected: t('connected') || 'Connected',
    connecting: t('connecting') || 'Connecting...',
    error: snapshot.error || t('auth_failed') || 'Connection Error',
    disconnected: t('disconnected') || 'Disconnected',
  }[snapshot.phase];

  const isHttps =
    typeof window !== 'undefined' &&
    window.location &&
    window.location.protocol === 'https:';
  const isHttpTarget = /^http:\/\//i.test(endpoint.trim());
  const isLocalhostTarget = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(
    endpoint.trim()
  );
  const showMixedContentAlert =
    isHttps && isHttpTarget && !isLocalhostTarget && endpoint.trim().length > 0;

  return (
    <div className={cx(s0.card, className)}>
      <div className={s0.header}>
        <div>
          <div className={s0.title}>
            <Server size={18} />
            <span>{t('singbox_service_api') || 'sing-box Service API'}</span>
          </div>
          <div className={s0.desc}>
            {t('singbox_service_api_desc') ||
              'Native core telemetry, Memory, Goroutines & Uptime'}
          </div>
        </div>
        <div className={s0.badge}>
          <span className={`${s0.dot} ${s0[snapshot.phase]}`} />
          <span>{phaseLabel}</span>
          {snapshot.isConfigured && snapshot.endpoint ? (
            <span style={{ opacity: 0.7 }}>({snapshot.endpoint})</span>
          ) : null}
          {snapshot.startedAt ? (
            <span style={{ opacity: 0.7 }}>
              · {formatUptime(snapshot.startedAt)}
            </span>
          ) : null}
        </div>
      </div>

      <div className={s0.grid}>
        <div className={s0.fieldGroup}>
          <div className={s0.label}>
            {t('service_api_endpoint') || 'Service API Endpoint'}
          </div>
          <Input
            type="text"
            value={endpoint}
            placeholder="http://127.0.0.1:9090 or https://192.168.1.1:9091"
            onChange={(e) => {
              setEndpoint(e.target.value);
              setTestResult(null);
            }}
          />
          <div className={s0.subInfo}>
            {endpoint
              ? `Target: ${endpoint}`
              : t('singbox_not_configured_desc') ||
                'Enter sing-box Service API endpoint to monitor native telemetry.'}
          </div>
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
          <div className={s0.subInfo}>
            {secret ? 'Authentication secret set' : 'No authentication secret set'}
          </div>
        </div>
      </div>

      {showMixedContentAlert && (
        <div className={s0.mixedContentAlert}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
            <AlertTriangle size={15} />
            <span>Browser Mixed Content Warning</span>
          </div>
          <span>
            You are browsing yacd via HTTPS (<code>https://midoriksu.github.io</code>). Web browsers block HTTPS pages from calling plain HTTP LAN endpoints directly. Please configure HTTPS/TLS (or reverse proxy) for sing-box, or access yacd locally over HTTP.
          </span>
        </div>
      )}

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
          label={isSaved ? t('saved') || 'Saved!' : t('save_and_apply') || 'Save & Apply'}
          onClick={handleSave}
        />
        {clashAPIConfig?.baseURL && (
          <Button
            label={t('copy_from_clash') || 'Copy from Clash API'}
            onClick={handleCopyClash}
          />
        )}
        {snapshot.isConfigured && (
          <Button
            start={<Trash2 size={16} />}
            label={t('clear_config') || 'Clear'}
            onClick={handleClear}
          />
        )}
      </div>
    </div>
  );
}

export default SingBoxConfigSection;
