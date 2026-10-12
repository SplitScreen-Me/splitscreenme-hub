// Starts or stops the local dev Postgres (docker-compose.dev.yml) and waits until it is healthy.
// Usage: node scripts/dev-db.mjs up|down
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const action = process.argv[2] ?? 'up';
const compose = (...args) =>
  execFileSync('docker', ['compose', '-f', 'docker-compose.dev.yml', ...args], { stdio: 'inherit' });

if (action === 'down') {
  compose('stop', 'db');
  process.exit(0);
}
if (action !== 'up') {
  console.error('usage: node scripts/dev-db.mjs up|down');
  process.exit(2);
}

compose('up', '-d', 'db');
for (let i = 0; i < 60; i++) {
  const status = execFileSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', 'splitscreen-v3-pg'], {
    encoding: 'utf8',
  }).trim();
  if (status === 'healthy') {
    console.log('Postgres is ready on 127.0.0.1:5433 (user ssm, databases v3_dev, ssm_test).');
    process.exit(0);
  }
  await sleep(1000);
}
console.error('Postgres did not become healthy in 60 s; see `docker logs splitscreen-v3-pg`.');
process.exit(1);
