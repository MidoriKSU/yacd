import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { singBoxClient, SingBoxSnapshot } from '$src/api/singbox';
import { State } from '$src/store/types';

import useLineChart from '../hooks/useLineChart';
import { chartJSResource, chartStyles, commonDataSetProps } from '../misc/chart';
import { getSelectedChartStyleIndex } from '../store/app';
import { connect } from './StateProvider';

const { useState, useEffect, useMemo } = React;

const chartWrapperStyle: React.CSSProperties = {
  position: 'relative',
  maxWidth: 1000,
};

const emptyBannerStyle = {
  padding: '24px',
  textAlign: 'center' as const,
  backgroundColor: 'var(--color-bg-card)',
  borderRadius: '10px',
  color: 'var(--color-text-secondary)',
  maxWidth: 1000,
};

const mapState = (s: State) => ({
  selectedChartStyleIndex: getSelectedChartStyleIndex(s),
});

export default connect(mapState)(TrafficChart);

function TrafficChart({
  selectedChartStyleIndex,
}: {
  selectedChartStyleIndex: number;
}) {
  const ChartMod = chartJSResource.read();
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  useEffect(() => {
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, []);

  const traffic = singBoxClient.trafficChartSource;
  const styleIdx = selectedChartStyleIndex % chartStyles.length;
  const data = useMemo(
    () => ({
      labels: traffic.labels,
      datasets: [
        {
          ...commonDataSetProps,
          ...chartStyles[styleIdx].up,
          label: t('Up'),
          data: traffic.up,
        },
        {
          ...commonDataSetProps,
          ...chartStyles[styleIdx].down,
          label: t('Down'),
          data: traffic.down,
        },
      ],
    }),
    [traffic, styleIdx, t],
  );

  useLineChart(ChartMod.Chart, 'trafficChart', data, traffic);

  if (snapshot.phase === 'unconfigured') {
    return (
      <div style={emptyBannerStyle}>
        <p style={{ margin: '0 0 8px 0', fontSize: '1.1em', color: 'var(--color-text)' }}>
          {t('Traffic')} · sing-box Service API ({t('unconfigured') || 'Not Configured'})
        </p>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.85em' }}>
          {t('singbox_not_configured_desc')}
        </p>
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
    );
  }

  return (
    <div style={chartWrapperStyle}>
      <canvas id="trafficChart" />
    </div>
  );
}
