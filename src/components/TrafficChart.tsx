import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { singBoxClient } from '$src/api/singbox';
import { fetchData as fetchClashTraffic } from '$src/api/traffic';
import {
  getClashAPIConfig,
  getSelectedChartStyleIndex,
  hasSelectedClashBackend,
  hasSelectedNativeBackend,
} from '$src/store/app';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import useLineChart from '../hooks/useLineChart';
import { chartJSResource, chartStyles, commonDataSetProps } from '../misc/chart';
import { connect } from './StateProvider';

const { useMemo } = React;

const chartWrapperStyle: React.CSSProperties = {
  position: 'relative',
  maxWidth: 1000,
};

const emptyTraffic = {
  labels: [] as (number | string)[],
  up: [] as (number | undefined)[],
  down: [] as (number | undefined)[],
  subscribe: () => () => {},
};

const mapState = (s: State) => ({
  hasNative: hasSelectedNativeBackend(s),
  hasClash: hasSelectedClashBackend(s),
  apiConfig: getClashAPIConfig(s),
  selectedChartStyleIndex: getSelectedChartStyleIndex(s),
});

export default connect(mapState)(TrafficChart);

function TrafficChart({
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

  const traffic = useMemo(() => {
    if (isNativeSource) {
      return singBoxClient.trafficChartSource;
    }
    if (isClashSource && apiConfig && apiConfig.baseURL) {
      return fetchClashTraffic(apiConfig);
    }
    return emptyTraffic;
  }, [isNativeSource, isClashSource, apiConfig]);

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
    </div>
  );
}
