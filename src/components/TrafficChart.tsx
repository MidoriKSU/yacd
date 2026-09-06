import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { singBoxClient } from '$src/api/singbox';
import { State } from '$src/store/types';

import useLineChart from '../hooks/useLineChart';
import { chartJSResource, chartStyles, commonDataSetProps } from '../misc/chart';
import { getSelectedChartStyleIndex } from '../store/app';
import { connect } from './StateProvider';

const { useMemo, useState, useEffect } = React;

const chartWrapperStyle: React.CSSProperties = {
  position: 'relative',
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

  const traffic = singBoxClient.trafficChartSource;
  const [hasData, setHasData] = useState(() => traffic.up.length > 0);
  useEffect(() => {
    return traffic.subscribe(() => {
      setHasData(traffic.up.length > 0);
    });
  }, [traffic]);

  const styleIdx = (selectedChartStyleIndex || 0) % chartStyles.length;
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

  return (
    <div style={chartWrapperStyle}>
      <canvas id="trafficChart" />
      {!hasData && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.6,
            fontSize: '0.88em',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          {t('waiting_for_telemetry') || 'Waiting for telemetry...'}
        </div>
      )}
    </div>
  );
}
