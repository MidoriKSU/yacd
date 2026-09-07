import * as React from 'react';
import { Activity, Download, Link, Upload } from 'react-feather';
import { useTranslation } from 'react-i18next';

import { formatMemoryBytes, singBoxClient, SingBoxSnapshot } from '$src/api/singbox';

import ContentHeader from './ContentHeader';
import s0 from './NativeOverview.module.scss';

const { useEffect, useState } = React;
const STATUS_HISTORY_LENGTH = 30;

type ModeState = {
  modeList: string[];
  currentMode: string;
};

type NativeOverviewState = {
  snapshot: SingBoxSnapshot;
  uplinkHistory: number[];
  downlinkHistory: number[];
};

export default function NativeOverview() {
  const { t } = useTranslation();
  const [state, setState] = useState<NativeOverviewState>(() => ({
    snapshot: singBoxClient.getSnapshot(),
    uplinkHistory: [],
    downlinkHistory: [],
  }));
  const { snapshot, uplinkHistory, downlinkHistory } = state;
  const [mode, setMode] = useState<ModeState | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const status = snapshot.status;
  const trafficAvailable = status?.trafficAvailable ?? false;
  const connected = snapshot.phase === 'connected' && status !== null;

  useEffect(
    () =>
      singBoxClient.subscribe((next) => {
        setState((current) => {
          if (current.snapshot.endpoint !== next.endpoint) {
            return { snapshot: next, uplinkHistory: [], downlinkHistory: [] };
          }
          if (!next.status) {
            return { ...current, snapshot: next };
          }
          return {
            snapshot: next,
            uplinkHistory: appendHistory(current.uplinkHistory, Number(next.status.uplink)),
            downlinkHistory: appendHistory(current.downlinkHistory, Number(next.status.downlink)),
          };
        });
      }),
    [],
  );

  useEffect(() => singBoxClient.subscribeClashMode(setMode), []);

  let stateLabel: string | null = null;
  if (!connected) {
    switch (snapshot.phase) {
      case 'connecting':
        stateLabel = 'Connecting to Native API...';
        break;
      case 'error':
        stateLabel = snapshot.error || 'Native API unavailable';
        break;
      case 'disconnected':
        stateLabel = 'Native API disconnected';
        break;
      default:
        stateLabel = 'Native API unavailable';
        break;
    }
  }

  return (
    <div>
      <ContentHeader title={t('Overview')} />
      <div className={s0.root}>
        {stateLabel ? <div className={s0.state}>{stateLabel}</div> : null}
        <div className={s0.cardGrid}>
          <NativeCard icon={<Upload />} title={t('Upload')}>
            <div className={s0.metric}>
              {trafficAvailable ? `${formatNativeBytes(status!.uplink)}/s` : '...'}
            </div>
            <div className={s0.metricSub}>
              {trafficAvailable ? formatNativeBytes(status!.uplinkTotal) : '...'}
            </div>
            <Sparkline data={uplinkHistory} />
          </NativeCard>
          <NativeCard icon={<Download />} title={t('Download')}>
            <div className={s0.metric}>
              {trafficAvailable ? `${formatNativeBytes(status!.downlink)}/s` : '...'}
            </div>
            <div className={s0.metricSub}>
              {trafficAvailable ? formatNativeBytes(status!.downlinkTotal) : '...'}
            </div>
            <Sparkline data={downlinkHistory} />
          </NativeCard>
          <NativeCard icon={<Activity />} title={t('Status')}>
            <DataLine
              label={t('Memory')}
              value={status ? formatMemoryBytes(status.memory) : '...'}
            />
            <DataLine label={t('Goroutines')} value={status ? status.goroutines : '...'} />
          </NativeCard>
          <NativeCard icon={<Link />} title={t('Connections')}>
            <DataLine label={t('Inbound')} value={status?.connectionsIn ?? '...'} />
            <DataLine label={t('Outbound')} value={status?.connectionsOut ?? '...'} />
          </NativeCard>
          {mode && mode.modeList.length > 1 ? (
            <NativeCard wide icon={<Activity />} title={t('Mode')}>
              <div className={s0.modeList}>
                {mode.modeList.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={item === mode.currentMode ? s0.modeSelected : undefined}
                    disabled={pendingMode !== null}
                    onClick={() => {
                      setPendingMode(item);
                      singBoxClient.setClashMode(item).then(
                        () => setPendingMode(null),
                        () => setPendingMode(null),
                      );
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </NativeCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NativeCard({
  icon,
  title,
  children,
  wide = false,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`${s0.card} ${wide ? s0.wide : ''}`}>
      <div className={s0.cardHeader}>
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function DataLine({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className={s0.dataLine}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function appendHistory(history: number[], value: number): number[] {
  const next = history.concat(value);
  return next.length > STATUS_HISTORY_LENGTH ? next.slice(-STATUS_HISTORY_LENGTH) : next;
}

function formatNativeBytes(value: number | bigint): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let number = Number(value);
  if (!Number.isFinite(number) || number < 0) number = 0;
  let unit = 0;
  while (number >= 1000 && unit < units.length - 1) {
    number /= 1000;
    unit++;
  }
  const rounded = unit === 0 ? String(Math.round(number)) : number.toFixed(1).replace(/\.0$/, '');
  return `${rounded} ${units[unit]}`;
}

function Sparkline({ data }: { data: number[] }) {
  const height = 46;
  const width = 300;
  const values = data.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  const max = Math.max(...values, 1);
  const stepX = width / Math.max(values.length - 1, 1);
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = height - 3 - (value / (max * 1.2)) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={s0.sparkline}
    >
      {points.length > 1 ? (
        <>
          <polygon
            points={`${points[0].split(',')[0]},${height} ${points.join(' ')} ${
              points[points.length - 1].split(',')[0]
            },${height}`}
            fill="var(--color-text-highlight)"
            opacity="0.1"
          />
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="var(--color-text-highlight)"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}
