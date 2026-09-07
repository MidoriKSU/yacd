import React from 'react';

import { hasSelectedNativeBackend } from '$src/store/app';
import { State } from '$src/store/types';

import LegacyYacdOverview from './LegacyYacdOverview';
import NativeOverview from './NativeOverview';
import { connect } from './StateProvider';

const mapState = (s: State) => ({
  hasNative: hasSelectedNativeBackend(s),
});

export default connect(mapState)(Home);

function Home({ hasNative }: { hasNative: boolean }) {
  return hasNative ? <NativeOverview /> : <LegacyYacdOverview />;
}
