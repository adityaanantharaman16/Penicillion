import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (process.env.NODE_ENV === 'production') throw Error('Bootstrap is for local play.');

function compose(args, options = {}) {
  const result = spawnSync('docker', ['compose', '--profile', 'play', ...args], {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  return result.stdout;
}

// Read resolved settings from Compose so exported variables and a project .env agree.
const config = JSON.parse(
  compose(['config', '--format', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);
const { PUBLIC_ORIGIN, LOCAL_OIDC_ORIGIN } = config.services.gateway.environment;
const loginPort = Number(new URL(LOCAL_OIDC_ORIGIN).port);
if ([4320, 4321, 4322].includes(loginPort))
  throw Error(
    'Choose a LOGIN_PORT outside 4320–4322, which serve the local gateway and private workers.',
  );
const hostPorts = ['db', 'cache', 'gateway'].flatMap((name) =>
  config.services[name].ports.map((p) => p.published),
);
if (new Set(hostPorts).size !== hostPorts.length)
  throw Error('Choose distinct PLAY_PORT, LOGIN_PORT, GAME_DB_PORT and GAME_CACHE_PORT values.');

compose(['build', 'gateway']);
compose(['up', '-d', '--wait', 'db', 'cache']);
compose(['--profile', 'setup', 'run', '--rm', '-T', '--no-deps', 'prepare']);
compose([
  'exec',
  '-T',
  'db',
  'psql',
  '-X',
  '-v',
  'ON_ERROR_STOP=1',
  '-U',
  'penicillion',
  '-d',
  'penicillion',
  '-f',
  '/sql/local-access.sql',
]);
compose([
  'up',
  '-d',
  '--wait',
  '--wait-timeout',
  '150',
  'gateway',
  'worker-one',
  'worker-two',
  'local-oidc',
]);
console.log(
  'Night Culture is running at ' +
    PUBLIC_ORIGIN +
    '/. Docker Compose keeps the local game running after this command exits.',
);
