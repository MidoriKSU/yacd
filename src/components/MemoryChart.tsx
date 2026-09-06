import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { fetchData as fetchClashMemory } from '$src/api/memory';
import { singBoxClient } from '$src/api/singbox';
import {
  getClashAPIConfig,
  getSelectedChartStyleIndex,
  hasSelectedClashBackend,
  hasSelectedNativeBackend,
} from '$src/store/app';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import { useLineChartMemory } from '../hooks/useLineChart';
import {
  chartJSResource,
  chartStyles,
  commonDataSetProps,
} from '../misc/chart-memory';
import { connect } from './StateProvider';

const { useMemo } = React;

const chartWrapperStyle = {
  position: 'relative' as const,
  maxWidth: 1000,
  marginTop: '1em',
};

const emptyMemory = {
  labels: [] as (number | string)[],
  inuse: [] as (number | undefined)[],
  subscribe: () => () => {},
};

const mapState = (s: State) => ({
  hasNative: hasSelectedNativeBackend(s),
  hasClash: hasSelectedClashBackend(s),
  apiConfig: getClashAPIConfig(s),
  selectedChartStyleIndex: getSelectedChartStyleIndex(s),
});

export default connect(mapState)(MemoryChart);

function MemoryChart({
  hasNative,
  hasClash,
  apiConfig,
  selectedChartStyleIndex,
}: {
  hasNative: boolean;
  hasClash: boolean;
  apiConfig?: ClashAPIConfig;
  selectedChartStyleIndex: number;
}) {
  const ChartMod = chartJSResource.read();
  const { t } = useTranslation();

  const isNativeSource = hasNative;
  const isClashSource = !hasNative && hasClash;

  const memorySource = useMemo(() => {
    if (isNativeSource) {
      return singBoxClient.memoryChartSource;
    }
    if (isClashSource && apiConfig && apiConfig.baseURL) {
      return fetchClashMemory(apiConfig);
    }
    return emptyMemory;
  }, [isNativeSource, isClashSource, apiConfig]);

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
