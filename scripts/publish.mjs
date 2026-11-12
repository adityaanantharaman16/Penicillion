// Invoked as a one-off migrator task, before starting new runtime workers.
await import('./migrate.mjs');
import { spawnSync } from 'node:child_process';
for (const script of ['seed', 'grants']) {
  const result = spawnSync(process.execPath, ['scripts/' + script + '.mjs'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
