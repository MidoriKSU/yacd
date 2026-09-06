import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { formatMemoryBytes, singBoxClient, SingBoxSnapshot } from '$src/api/singbox';
import prettyBytes from '$src/misc/pretty-bytes';

import s0 from './TrafficNow.module.scss';

const { useState, useEffect } = React;

export default function TrafficNow() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  useEffect(() => {
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, []);

  const nativeStatus = snapshot.status;

  const uploadRateStr =
    nativeStatus && nativeStatus.trafficAvailable
      ? `${prettyBytes(nativeStatus.uplink)}/s`
      : '--';

  const downloadRateStr =
    nativeStatus && nativeStatus.trafficAvailable
      ? `${prettyBytes(nativeStatus.downlink)}/s`
      : '--';

  const uploadTotalStr =
    nativeStatus && nativeStatus.trafficAvailable
      ? prettyBytes(nativeStatus.uplinkTotal)
      : '--';

  const downloadTotalStr =
    nativeStatus && nativeStatus.trafficAvailable
      ? prettyBytes(nativeStatus.downlinkTotal)
      : '--';

  const connectionsStr =
    nativeStatus &&
    nativeStatus.connectionsIn !== undefined &&
    nativeStatus.connectionsOut !== undefined
      ? `In: ${nativeStatus.connectionsIn} / Out: ${nativeStatus.connectionsOut}`
      : '--';

  const memoryStr = nativeStatus ? formatMemoryBytes(nativeStatus.memory) : '--';

  const goroutinesStr = nativeStatus ? String(nativeStatus.goroutines) : '--';

  return (
    <div className={s0.TrafficNow}>
      <div className={s0.sec}>
        <div>{t('Upload')}</div>
        <div>{uploadRateStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('Download')}</div>
        <div>{downloadRateStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('Upload Total')}</div>
        <div>{uploadTotalStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('Download Total')}</div>
        <div>{downloadTotalStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('Connections')}</div>
        <div>{connectionsStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('Memory Total')}</div>
        <div>{memoryStr}</div>
      </div>
      <div className={s0.sec}>
        <div>{t('goroutines')}</div>
        <div>{goroutinesStr}</div>
      </div>
    </div>
  );
}

