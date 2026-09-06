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

const { useMemo } = React;

const chartWrapperStyle = {
  position: 'relative' as const,
  maxWidth: 1000,
  marginTop: '1em',
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
  const styleIdx = (selectedChartStyleIndex || 0) % chartStyles.length;
  const data = useMemo(
    () => ({
      labels: memorySource.labels,
      datasets: [
        {
          ...commonDataSetProps,
          ...chartStyles[styleIdx].inuse,
          label: t('Memory'),
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
    </div>
  );
}
