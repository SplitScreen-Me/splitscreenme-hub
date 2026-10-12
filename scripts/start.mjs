// `npm start`: runs the standalone server like the production image does (`next start` does not support
// output: standalone). Copies the static assets and public/ next to server.js first.
import { cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.next/standalone');
if (!existsSync(path.join(root, 'server.js'))) {
  console.error('start: no standalone build, run `npm run build` first');
  process.exit(1);
}
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
cpSync('.next/static', path.join(root, '.next/static'), { recursive: true });
cpSync('public', path.join(root, 'public'), { recursive: true });

const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    NODE_ENV: 'production',
    PORT: '3000',
    ...process.env,
    STORAGE_DIR: path.resolve(process.env.STORAGE_DIR ?? 'storage'),
  },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
