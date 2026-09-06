import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import {
  formatMemoryBytes,
  formatUptime,
  singBoxClient,
  SingBoxSnapshot,
} from '$src/api/singbox';
import prettyBytes from '$src/misc/pretty-bytes';

import s0 from './TrafficNow.module.scss';

const { useState, useEffect } = React;

export default function TrafficNow() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  useEffect(() => {
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, []);

  const phaseLabel = {
    unconfigured: t('unconfigured') || 'Not Configured',
    connected: t('connected') || 'Connected',
    connecting: t('connecting') || 'Connecting / Waiting for telemetry...',
    error: snapshot.resultState || snapshot.error || 'Connection Failed',
    disconnected: t('disconnected') || 'Disconnected',
  }[snapshot.phase];

  const isUnconfigured = snapshot.phase === 'unconfigured';
  const isConnecting = snapshot.phase === 'connecting';
  const isStale = snapshot.phase === 'disconnected' || snapshot.phase === 'error';
  const status = snapshot.status;

  const getMetric = (type: 'up' | 'down' | 'mem' | 'gr') => {
    if (isUnconfigured) {
      return { value: '--', sub: t('unconfigured') || 'Not configured' };
    }
    if (status) {
      const staleNotice = isStale ? ` ⚠️ ${t('stale') || 'Stale'}` : '';
      switch (type) {
        case 'up':
          if (!status.trafficAvailable) {
            return { value: '--', sub: 'Traffic counter unavailable' };
          }
          return {
            value: prettyBytes(status.uplink) + '/s',
            sub: `${t('Upload Total') || 'Total'}: ${prettyBytes(status.uplinkTotal)}${staleNotice}`,
          };
        case 'down':
          if (!status.trafficAvailable) {
            return { value: '--', sub: 'Traffic counter unavailable' };
          }
          return {
            value: prettyBytes(status.downlink) + '/s',
            sub: `${t('Download Total') || 'Total'}: ${prettyBytes(status.downlinkTotal)}${staleNotice}`,
          };
        case 'mem':
          return {
            value: formatMemoryBytes(status.memory),
            sub: isStale ? `⚠️ ${t('stale') || 'Stale'}` : 'Active Memory',
          };
        case 'gr':
          return {
            value: String(status.goroutines),
            sub: isStale
              ? `⚠️ ${t('stale') || 'Stale'}`
              : `In/Out: ${status.connectionsIn} / ${status.connectionsOut}`,
          };
      }
    }
    if (isConnecting) {
      return { value: '...', sub: t('waiting_for_telemetry') || 'Waiting for telemetry...' };
    }
    return { value: '--', sub: snapshot.error || t('unavailable') || 'Unavailable' };
  };

  const upMetric = getMetric('up');
  const downMetric = getMetric('down');
  const memMetric = getMetric('mem');
  const grMetric = getMetric('gr');

  return (
    <div className={s0.root}>
      <div className={s0.header}>
        <div className={s0.statusInfo}>
          <span className={`${s0.dot} ${s0[snapshot.phase]}`} />
          <span>sing-box Service API ({phaseLabel})</span>
          {snapshot.startedAt && (
            <span className={s0.uptime}>
              · {t('core_uptime') || 'Uptime'}: {formatUptime(snapshot.startedAt)}
            </span>
          )}
        </div>
        <div className={s0.actions}>
          {snapshot.isConfigured && (
            <button
              type="button"
              className={s0.btn}
              onClick={() => singBoxClient.reconnect()}
              title="Reconnect sing-box Service API"
            >
              {t('Resume Refresh') || 'Reconnect'}
            </button>
          )}
          <Link to="/configs" className={s0.btn} title="Configure sing-box Service API">
            {t('Config') || 'Config'}
          </Link>
        </div>
      </div>

      <div className={s0.grid}>
        <div className={s0.card}>
          <div className={s0.label}>{t('Upload')}</div>
          <div className={s0.value}>{upMetric.value}</div>
          <div className={s0.sub}>{upMetric.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>{t('Download')}</div>
          <div className={s0.value}>{downMetric.value}</div>
          <div className={s0.sub}>{downMetric.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>{t('native_memory') || t('Memory') || 'Memory'}</div>
          <div className={s0.value}>{memMetric.value}</div>
          <div className={s0.sub}>{memMetric.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>{t('goroutines') || 'Goroutines'}</div>
          <div className={s0.value}>{grMetric.value}</div>
          <div className={s0.sub}>{grMetric.sub}</div>
        </div>
      </div>
    </div>
  );
}
