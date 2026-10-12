import os from 'node:os';
import path from 'node:path';
import { TEST_DATABASE_URL } from './db-url';

// A complete, fake environment for every test file (never real secrets).
Object.assign(process.env, {
  NODE_ENV: 'test',
  SITE_URL: 'http://localhost:3000',
  DATABASE_URL: TEST_DATABASE_URL,
  APP_SECRET: 'a'.repeat(64),
  STORAGE_DIR: path.join(os.tmpdir(), 'ssm-test-storage'),
  NOINDEX: '1',
  DISABLE_JOBS: '1',
  LOG_LEVEL: 'error',
});
