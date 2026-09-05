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
          <div className={s0.label}>{t('Memory') || 'Native Memory'}</div>
          <div className={s0.value}>
            {snapshot.status ? formatMemoryBytes(snapshot.status.memory) : '—'}
          </div>
          <div className={s0.sub}>
            {snapshot.status ? `Raw: ${snapshot.status.memoryRaw} B` : 'sing-box daemon.Status'}
          </div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>Goroutines</div>
          <div className={s0.value}>{snapshot.status ? snapshot.status.goroutines : '—'}</div>
          <div className={s0.sub}>Active Go routines</div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>Core Uptime</div>
          <div className={s0.value}>
            {snapshot.startedAt ? formatUptime(snapshot.startedAt) : '—'}
          </div>
          <div className={s0.sub}>
            {snapshot.startedAt ? new Date(snapshot.startedAt).toLocaleTimeString() : 'StartedAt'}
          </div>
        </div>

        <div className={s0.card}>
          <div className={s0.label}>Connections (In / Out)</div>
          <div className={s0.value}>
            {snapshot.status
              ? `${snapshot.status.connectionsIn} / ${snapshot.status.connectionsOut}`
              : '—'}
          </div>
          <div className={s0.sub}>Service API native track</div>
        </div>
      </div>
    </div>
  );
}
