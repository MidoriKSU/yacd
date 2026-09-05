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

import s0 from './SingBoxStatusCards.module.scss';

const { useState, useEffect } = React;

export default function SingBoxStatusCards() {
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
    connecting: t('connecting') || 'Connecting...',
    error: snapshot.error || t('auth_failed') || 'Connection Failed',
    disconnected: t('disconnected') || 'Disconnected',
  }[snapshot.phase];

  const isUnconfigured = snapshot.phase === 'unconfigured';
  const isStale = snapshot.phase === 'disconnected' || snapshot.phase === 'error';

  const getMemoryDisplay = () => {
    if (isUnconfigured) {
      return { value: t('unconfigured') || 'Not configured', sub: t('singbox_service_api') };
    }
    if (snapshot.status) {
      const val = formatMemoryBytes(snapshot.status.memory);
      if (isStale) return { value: val, sub: `⚠️ ${t('stale') || 'Disconnected / Stale'}` };
      return { value: val, sub: `daemon.Status (Raw: ${snapshot.status.memoryRaw} B)` };
    }
    return { value: t('unavailable') || 'Unavailable', sub: snapshot.error || 'Connection Failed' };
  };

  const getGoroutinesDisplay = () => {
    if (isUnconfigured) {
      return { value: t('unconfigured') || 'Not configured', sub: t('singbox_service_api') };
    }
    if (snapshot.status) {
      const val = String(snapshot.status.goroutines);
      if (isStale) return { value: val, sub: `⚠️ ${t('stale') || 'Disconnected / Stale'}` };
      return { value: val, sub: 'Active Go routines' };
    }
    return { value: t('unavailable') || 'Unavailable', sub: snapshot.error || 'Connection Failed' };
  };

  const getUptimeDisplay = () => {
    if (isUnconfigured) {
      return { value: t('unconfigured') || 'Not configured', sub: t('singbox_service_api') };
    }
    if (snapshot.startedAt) {
      const val = formatUptime(snapshot.startedAt);
      if (isStale) return { value: val, sub: `⚠️ ${t('stale') || 'Disconnected / Stale'}` };
      return { value: val, sub: `Started: ${new Date(snapshot.startedAt).toLocaleTimeString()}` };
    }
    return { value: t('unavailable') || 'Unavailable', sub: snapshot.error || 'Connection Failed' };
  };

  const getConnectionsDisplay = () => {
    if (isUnconfigured) {
      return { value: t('unconfigured') || 'Not configured', sub: t('singbox_service_api') };
    }
    if (snapshot.status) {
      const val = `${snapshot.status.connectionsIn} / ${snapshot.status.connectionsOut}`;
      if (isStale) return { value: val, sub: `⚠️ ${t('stale') || 'Disconnected / Stale'}` };
      return {
        value: val,
        sub: snapshot.status.trafficAvailable
          ? `Traffic: ↑${prettyBytes(snapshot.status.uplinkTotal)} ↓${prettyBytes(snapshot.status.downlinkTotal)}`
          : 'Service API native track',
      };
    }
    return { value: t('unavailable') || 'Unavailable', sub: snapshot.error || 'Connection Failed' };
  };

  const mem = getMemoryDisplay();
  const gr = getGoroutinesDisplay();
  const up = getUptimeDisplay();
  const conn = getConnectionsDisplay();

  return (
    <div className={s0.root}>
      <div className={s0.header}>
        <div className={s0.title}>
          <span className={`${s0.dot} ${s0[snapshot.phase]}`} />
          <span>sing-box Service API ({phaseLabel})</span>
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
          <div className={s0.label}>{t('native_memory') || t('Memory') || 'Memory'}</div>
          <div className={s0.value}>{mem.value}</div>
          <div className={s0.sub}>{mem.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>{t('goroutines') || 'Goroutines'}</div>
          <div className={s0.value}>{gr.value}</div>
          <div className={s0.sub}>{gr.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>{t('core_uptime') || 'Core Uptime'}</div>
          <div className={s0.value}>{up.value}</div>
          <div className={s0.sub}>{up.sub}</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>Connections (In / Out)</div>
          <div className={s0.value}>{conn.value}</div>
          <div className={s0.sub}>{conn.sub}</div>
        </div>
      </div>
    </div>
  );
}
