import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { singBoxClient, SingBoxSnapshot } from '$src/api/singbox';
import prettyBytes from '$src/misc/pretty-bytes';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import * as connAPI from '../api/connections';
import { getClashAPIConfig } from '../store/app';
import { connect } from './StateProvider';
import s0 from './TrafficNow.module.scss';

const { useState, useEffect, useCallback } = React;

const mapState = (s: State) => ({
  apiConfig: getClashAPIConfig(s),
});

export default connect(mapState)(TrafficNow);

function TrafficNow({ apiConfig }: { apiConfig: ClashAPIConfig }) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  useEffect(() => {
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, []);

  const connNumber = useActiveConnections(apiConfig);

  const nativeStatus = snapshot.status;

  const uploadRateStr = nativeStatus
    ? (nativeStatus.trafficAvailable ? `${prettyBytes(nativeStatus.uplink)}/s` : '0 B/s')
    : '--';

  const downloadRateStr = nativeStatus
    ? (nativeStatus.trafficAvailable ? `${prettyBytes(nativeStatus.downlink)}/s` : '0 B/s')
    : '--';

  const uploadTotalStr = nativeStatus
    ? prettyBytes(nativeStatus.uplinkTotal)
    : '--';

  const downloadTotalStr = nativeStatus
    ? prettyBytes(nativeStatus.downlinkTotal)
    : '--';

  const activeConnStr = connNumber !== undefined ? String(connNumber) : '--';

  const memoryStr = nativeStatus
    ? prettyBytes(nativeStatus.memory)
    : '--';

  const goroutinesStr = nativeStatus
    ? String(nativeStatus.goroutines)
    : '--';

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
        <div>{t('Active Connections')}</div>
        <div>{activeConnStr}</div>
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

function useActiveConnections(apiConfig: ClashAPIConfig) {
  const [connNumber, setConnNumber] = useState<number | undefined>(undefined);
  const read = useCallback(
    (data: any) => {
      if (data && Array.isArray(data.connections)) {
        setConnNumber(data.connections.length);
      }
    },
    [setConnNumber],
  );
  useEffect(() => {
    if (!apiConfig || !apiConfig.baseURL) return;
    return connAPI.fetchData(apiConfig, read);
  }, [apiConfig, read]);
  return connNumber;
}

