import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { singBoxClient } from '$src/api/singbox';
import { State } from '$src/store/types';

import { useLineChartMemory } from '../hooks/useLineChart';
import {
  chartJSResource,
  chartStyles,
  commonDataSetProps,
} from '../misc/chart-memory';
import { getSelectedChartStyleIndex } from '../store/app';
import { connect } from './StateProvider';

const { useMemo, useState, useEffect } = React;

const chartWrapperStyle = {
  position: 'relative' as const,
  maxWidth: 1000,
};

const mapState = (s: State) => ({
  selectedChartStyleIndex: getSelectedChartStyleIndex(s),
});

export default connect(mapState)(MemoryChart);

function MemoryChart({
  selectedChartStyleIndex,
}: {
  selectedChartStyleIndex: number;
}) {
  const ChartMod = chartJSResource.read();
  const { t } = useTranslation();

  const memorySource = singBoxClient.memoryChartSource;
  const [hasData, setHasData] = useState(() => memorySource.inuse.length > 0);
  useEffect(() => {
    return memorySource.subscribe(() => {
      setHasData(memorySource.inuse.length > 0);
    });
  }, [memorySource]);

  const styleIdx = (selectedChartStyleIndex || 0) % chartStyles.length;
  const data = useMemo(
    () => ({
      labels: memorySource.labels,
      datasets: [
        {
          ...commonDataSetProps,
          ...chartStyles[styleIdx].inuse,
          label: t('Memory') + ' (sing-box Service API)',
          data: memorySource.inuse,
        },
      ],
    }),
    [memorySource, styleIdx, t]
  );

  useLineChartMemory(ChartMod.Chart, 'MemoryChart', data, memorySource);

  return (
    <div style={chartWrapperStyle}>
      <canvas id="MemoryChart" />
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
