import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { singBoxClient, SingBoxSnapshot } from '$src/api/singbox';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import { useLineChartMemory } from '../hooks/useLineChart';
import {
  chartJSResource,
  chartStyles,
  commonDataSetProps,
  memoryChartOptions,
} from '../misc/chart-memory';
import { getClashAPIConfig, getSelectedChartStyleIndex } from '../store/app';
import { connect } from './StateProvider';

const { useState, useEffect, useMemo, useRef } = React;

const chartWrapperStyle = {
  position: 'relative' as const,
  maxWidth: 1000,
  marginTop: '1em',
};

const emptyBannerStyle = {
  padding: '24px',
  textAlign: 'center' as const,
  backgroundColor: 'var(--color-bg-card)',
  borderRadius: '10px',
  color: 'var(--color-text-secondary)',
  marginTop: '1em',
  maxWidth: 1000,
};

const mapState = (s: State) => ({
  apiConfig: getClashAPIConfig(s),
  selectedChartStyleIndex: getSelectedChartStyleIndex(s),
});

export default connect(mapState)(MemoryChart);

const MAX_POINTS = 60;

function MemoryChart({
  apiConfig,
  selectedChartStyleIndex,
}: {
  apiConfig: ClashAPIConfig;
  selectedChartStyleIndex: number;
}) {
  const ChartMod = chartJSResource.read();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  const chartDataRef = useRef<{
    labels: string[];
    inuse: number[];
    listeners: Array<() => void>;
    subscribe: (fn: () => void) => () => void;
  }>({
    labels: Array(MAX_POINTS).fill(''),
    inuse: Array(MAX_POINTS).fill(0),
    listeners: [],
    subscribe(fn: () => void) {
      this.listeners.push(fn);
      return () => {
        const idx = this.listeners.indexOf(fn);
        if (idx > -1) this.listeners.splice(idx, 1);
      };
    },
  });

  useEffect(() => {
    if (apiConfig?.baseURL) {
      singBoxClient.updateConfig(apiConfig.baseURL, apiConfig.secret || '');
    }

    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
      if (s.status) {
        const d = chartDataRef.current;
        d.labels.shift();
        d.inuse.shift();
        d.labels.push(new Date().toLocaleTimeString());
        d.inuse.push(s.status.memory);
        d.listeners.forEach((fn) => fn());
      }
    });
  }, [apiConfig]);

  const styleIdx = selectedChartStyleIndex % chartStyles.length;
  const data = useMemo(
    () => ({
      labels: chartDataRef.current.labels,
      datasets: [
        {
          ...commonDataSetProps,
          ...memoryChartOptions,
          ...chartStyles[styleIdx].inuse,
          label: t('Memory') + ' (sing-box Service API)',
          data: chartDataRef.current.inuse,
        },
      ],
    }),
    [styleIdx, t]
  );

  useLineChartMemory(ChartMod.Chart, 'MemoryChart', data, chartDataRef.current);

  if (snapshot.phase === 'disconnected' || snapshot.phase === 'error') {
    return (
      <div style={emptyBannerStyle}>
        <p style={{ margin: '0 0 8px 0', fontSize: '1.1em', color: 'var(--color-text)' }}>
          sing-box Service API ({snapshot.phase === 'error' ? 'Error' : 'Disconnected'})
        </p>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.85em' }}>
          {snapshot.error || `Target: ${snapshot.endpoint}/daemon.StartedService/SubscribeStatus`}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => singBoxClient.reconnect()}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-text-secondary)',
              color: 'var(--color-text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {t('Resume Refresh') || 'Reconnect'}
          </button>
          <Link
            to="/configs"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-text-secondary)',
              color: 'var(--color-text)',
              padding: '4px 12px',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '0.85em',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {t('Config') || 'Config'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={chartWrapperStyle}>
      <canvas id="MemoryChart" />
    </div>
  );
}
