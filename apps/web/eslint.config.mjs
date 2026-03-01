import nextCoreVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import sharedConfig from '../../packages/config/eslint/next.mjs';

export default [
  ...nextCoreVitals,
  ...nextTypescript,
  ...sharedConfig,
];
