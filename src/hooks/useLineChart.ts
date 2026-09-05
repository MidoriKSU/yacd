import type { ChartConfiguration } from 'chart.js';
import React from 'react';
import { commonChartOptions } from 'src/misc/chart';
import { memoryChartOptions } from 'src/misc/chart-memory';

const { useEffect } = React;

export default function useLineChart(
  chart: typeof import('chart.js').Chart,
  elementId: string,
  data: ChartConfiguration['data'],
  subscription: any,
  extraChartOptions = {},
) {
  useEffect(() => {
    const el = document.getElementById(elementId) as HTMLCanvasElement | null;
    if (!el || typeof el.getContext !== 'function') return;
    const existing = chart.getChart(el);
    if (existing) {
      existing.destroy();
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const options = { ...commonChartOptions, ...extraChartOptions };
    const c = new chart(ctx, { type: 'line', data, options });
    const unsubscribe = subscription && subscription.subscribe(() => c.update());
    return () => {
      unsubscribe && unsubscribe();
      c.destroy();
    };
  }, [chart, elementId, data, subscription, extraChartOptions]);
}

export function useLineChartMemory(
  chart: typeof import('chart.js').Chart,
  elementId: string,
  data: ChartConfiguration['data'],
  subscription: any,
  extraChartOptions = {}
) {
  useEffect(() => {
    const el = document.getElementById(elementId) as HTMLCanvasElement | null;
    if (!el || typeof el.getContext !== 'function') return;
    const existing = chart.getChart(el);
    if (existing) {
      existing.destroy();
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const options = { ...memoryChartOptions, ...extraChartOptions };
    const c = new chart(ctx, { type: 'line', data, options });
    const unsubscribe = subscription && subscription.subscribe(() => c.update());
    return () => {
      unsubscribe && unsubscribe();
      c.destroy();
    };
  }, [chart, elementId, data, subscription, extraChartOptions]);
}
