import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatMemoryBytes,
  formatUptime,
  singBoxClient,
  SingBoxSnapshot,
} from '$src/api/singbox';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import { getClashAPIConfig } from '../store/app';
import s0 from './SingBoxStatusCards.module.scss';
import { connect } from './StateProvider';

const { useState, useEffect } = React;

const mapState = (s: State) => ({
  apiConfig: getClashAPIConfig(s),
});

export default connect(mapState)(SingBoxStatusCards);

function SingBoxStatusCards({ apiConfig }: { apiConfig: ClashAPIConfig }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());
  const [showConfig, setShowConfig] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState(snapshot.endpoint);

  useEffect(() => {
    if (apiConfig?.baseURL) {
      singBoxClient.updateConfig(apiConfig.baseURL, apiConfig.secret || '');
    }
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
      setCustomUrlInput(s.endpoint);
    });
  }, [apiConfig]);

  const handleSaveEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    singBoxClient.setCustomEndpoint(customUrlInput);
    setShowConfig(false);
  };

  const handleResetEndpoint = () => {
    singBoxClient.setCustomEndpoint('');
    setCustomUrlInput(apiConfig?.baseURL || '');
    setShowConfig(false);
  };

  const phaseLabel = {
    connected: 'Connected',
    connecting: 'Connecting...',
    error: snapshot.error || 'Connection Failed',
    disconnected: 'Disconnected',
  }[snapshot.phase];

  return (
    <div className={s0.root}>
      <div className={s0.header}>
        <div className={s0.title}>
          <span className={`${s0.dot} ${s0[snapshot.phase]}`} />
          <span>sing-box Service API ({phaseLabel})</span>
        </div>
        <div className={s0.actions}>
          <button
            type="button"
            className={s0.btn}
            onClick={() => singBoxClient.reconnect()}
            title="Reconnect sing-box Service API"
          >
            {t('Resume Refresh') || 'Reconnect'}
          </button>
          <button
            type="button"
            className={s0.btn}
            onClick={() => setShowConfig(!showConfig)}
            title="Configure Service API Endpoint"
          >
            {showConfig ? 'Close' : 'Endpoint'}
          </button>
        </div>
      </div>

      {showConfig && (
        <form className={s0.configForm} onSubmit={handleSaveEndpoint}>
          <span>Service API URL:</span>
          <input
            type="text"
            value={customUrlInput}
            placeholder="http://127.0.0.1:9090"
            onChange={(e) => setCustomUrlInput(e.target.value)}
          />
          <button type="submit" className={s0.btn}>
            Save
          </button>
          <button type="button" className={s0.btn} onClick={handleResetEndpoint}>
            Reset to Default
          </button>
        </form>
      )}

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
