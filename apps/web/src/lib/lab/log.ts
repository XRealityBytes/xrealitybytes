import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { cache } from 'react';

const WEEKLY_LOG_CANDIDATES = [
  path.join(process.cwd(), 'content/weekly-log.md'),
  path.join(process.cwd(), '../../content/weekly-log.md'),
];
const DEFAULT_WEEKLY_LOG_PATH = path.join(process.cwd(), 'content/weekly-log.md');

const WEEKLY_LOG_PATH =
  WEEKLY_LOG_CANDIDATES.find((candidate) => existsSync(candidate)) ?? DEFAULT_WEEKLY_LOG_PATH;

export const getWeeklyLog = cache(async (): Promise<string> => {
  if (!existsSync(WEEKLY_LOG_PATH)) {
    return '# Lab Log\n\nNo entries published yet.';
  }

  return readFile(WEEKLY_LOG_PATH, 'utf8');
});
