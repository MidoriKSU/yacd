import * as React from 'react';
import { useTranslation } from 'react-i18next';

import * as connAPI from '$src/api/connections';
import { formatMemoryBytes, singBoxClient, SingBoxSnapshot } from '$src/api/singbox';
import * as trafficAPI from '$src/api/traffic';
import prettyBytes from '$src/misc/pretty-bytes';
import {
  getClashAPIConfig,
  hasSelectedClashBackend,
  hasSelectedNativeBackend,
} from '$src/store/app';
import { State } from '$src/store/types';
import { ClashAPIConfig } from '$src/types';

import { connect } from './StateProvider';
import s0 from './TrafficNow.module.scss';

const { useState, useEffect, useCallback } = React;

const mapState = (s: State) => ({
  hasNative: hasSelectedNativeBackend(s),
  hasClash: hasSelectedClashBackend(s),
  clashConfig: getClashAPIConfig(s),
});

export default connect(mapState)(TrafficNow);

function TrafficNow({
  hasNative,
  hasClash,
  clashConfig,
}: {
  hasNative: boolean;
  hasClash: boolean;
  clashConfig?: ClashAPIConfig;
}) {
  const { t } = useTranslation();

  const isNativeSource = hasNative;
  const isClashSource = !hasNative && hasClash;

  const [snapshot, setSnapshot] = useState<SingBoxSnapshot>(() => singBoxClient.getSnapshot());

  useEffect(() => {
    if (!isNativeSource) return;
    setSnapshot(singBoxClient.getSnapshot());
    return singBoxClient.subscribe((s) => {
      setSnapshot(s);
    });
  }, [isNativeSource]);

  const clashTraffic = useClashTraffic(clashConfig, isClashSource);
  const clashConn = useClashConnections(clashConfig, isClashSource);

  let uploadRateStr = '--';
  let downloadRateStr = '--';
  let uploadTotalStr = '--';
  let downloadTotalStr = '--';
  let connectionsLabel = t('Connections');
  let connectionsStr = '--';
  let memoryStr = '--';
  let goroutinesStr = '--';

  if (isNativeSource) {
    const nativeStatus = snapshot.status;
    if (nativeStatus && nativeStatus.trafficAvailable) {
      uploadRateStr = `${prettyBytes(nativeStatus.uplink)}/s`;
      downloadRateStr = `${prettyBytes(nativeStatus.downlink)}/s`;
      uploadTotalStr = prettyBytes(nativeStatus.uplinkTotal);
      downloadTotalStr = prettyBytes(nativeStatus.downlinkTotal);
    }
    if (
      nativeStatus &&
      nativeStatus.connectionsIn !== undefined &&
      nativeStatus.connectionsOut !== undefined
    ) {
      connectionsStr = `In: ${nativeStatus.connectionsIn} / Out: ${nativeStatus.connectionsOut}`;
    }
    if (nativeStatus) {
      memoryStr = formatMemoryBytes(nativeStatus.memory);
      goroutinesStr = String(nativeStatus.goroutines);
    }
  } else if (isClashSource) {
    uploadRateStr = clashTraffic.upStr;
    downloadRateStr = clashTraffic.downStr;
    uploadTotalStr = clashConn.upTotal;
    downloadTotalStr = clashConn.dlTotal;
    connectionsLabel = t('Active Connections');
    connectionsStr = String(clashConn.connNumber);
    memoryStr = clashConn.mTotal;
    goroutinesStr = '--';
  }

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
        <div>{connectionsLabel}</div>
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

function useClashTraffic(apiConfig: ClashAPIConfig | undefined, enabled: boolean) {
  const [speed, setSpeed] = useState({ upStr: '0 B/s', downStr: '0 B/s' });
  useEffect(() => {
    if (!enabled || !apiConfig || !apiConfig.baseURL) return;
    const sub = trafficAPI.fetchData(apiConfig).subscribe((o: { up: number; down: number }) => {
      setSpeed({
        upStr: `${prettyBytes(o.up)}/s`,
        downStr: `${prettyBytes(o.down)}/s`,
      });
    });
    return () => {
      if (typeof sub === 'function') {
        sub();
      } else if (sub && typeof (sub as any).unsubscribe === 'function') {
        (sub as any).unsubscribe();
      }
    };
  }, [apiConfig, enabled]);
  return speed;
}

function useClashConnections(apiConfig: ClashAPIConfig | undefined, enabled: boolean) {
  const [state, setState] = useState({
    upTotal: '0 B',
    dlTotal: '0 B',
    connNumber: 0,
    mTotal: '0 B',
  });
  const read = useCallback(
    ({ downloadTotal, uploadTotal, connections, memory }: any) => {
      setState({
        upTotal: prettyBytes(uploadTotal),
        dlTotal: prettyBytes(downloadTotal),
        connNumber: Array.isArray(connections) ? connections.length : 0,
        mTotal: prettyBytes(memory),
      });
    },
    [setState],
  );
  useEffect(() => {
    if (!enabled || !apiConfig || !apiConfig.baseURL) return;
    return connAPI.fetchData(apiConfig, read);
  }, [apiConfig, enabled, read]);
  return state;
}

