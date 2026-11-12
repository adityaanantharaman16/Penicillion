// Print a local ECS registration document. This utility makes no network calls.
const mode = process.argv[2];
if (!['web', 'migration'].includes(mode)) throw Error('Choose web or migration.');
function env(key) {
  if (!process.env[key]) throw Error('Missing ' + key);
  return process.env[key];
}
const region = process.env.AWS_REGION || 'us-east-1';
const image = (name) => {
  const value = env(name);
  if (!/@sha256:[0-9a-f]{64}$/.test(value))
    throw Error(name + ' must use an immutable registry digest.');
  return value;
};
const logs = (name) => ({
  logDriver: 'awslogs',
  options: {
    'awslogs-group': env('GAME_LOG_GROUP'),
    'awslogs-region': region,
    'awslogs-stream-prefix': name,
  },
});
const settings = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));
const secrets = (obj) =>
  Object.entries(obj).map(([name, reference]) => ({ name, valueFrom: env(reference) }));
const worker = {
  name: 'game',
  essential: true,
  image: image('GAME_IMAGE'),
  user: 'node',
  linuxParameters: { initProcessEnabled: true },
  environment: settings({ NODE_ENV: 'production', DB_POOL_SIZE: mode === 'web' ? '12' : '2' }),
  secrets: secrets({
    DATABASE_URL: mode === 'web' ? 'APP_DB_SECRET_ARN' : 'MIGRATION_DB_SECRET_ARN',
    DATABASE_CA_PEM: 'DB_CA_SECRET_ARN',
  }),
  logConfiguration: logs(mode),
  stopTimeout: 30,
};
let containers = [worker];
if (mode === 'migration') worker.command = ['node', 'scripts/publish.mjs'];
else {
  worker.environment.push(
    ...settings({
      PUBLIC_ORIGIN: env('GAME_ORIGIN'),
      OIDC_CLIENT_ID: env('GOOGLE_CLIENT_ID'),
      TRUST_PROXY_ADDRESS: '127.0.0.1',
      CACHE_NAMESPACE: 'penicillion-live:',
      PORT: '4321',
    }),
  );
  worker.secrets.push(
    ...secrets({
      REDIS_URL: 'REDIS_SECRET_ARN',
      OIDC_CLIENT_SECRET: 'GOOGLE_SECRET_ARN',
      SESSION_SECRET: 'SESSION_SECRET_ARN',
    }),
  );
  worker.healthCheck = {
    command: [
      'CMD',
      'node',
      '-e',
      "fetch('http://127.0.0.1:4321/health/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
    ],
    interval: 15,
    timeout: 5,
    retries: 3,
    startPeriod: 30,
  };
  containers.push({
    name: 'edge',
    essential: true,
    image: image('EDGE_IMAGE'),
    portMappings: [{ containerPort: 8080, protocol: 'tcp' }],
    dependsOn: [{ containerName: 'game', condition: 'HEALTHY' }],
    logConfiguration: logs('edge'),
    stopTimeout: 30,
  });
}
const doc = {
  family: 'penicillion-' + mode,
  requiresCompatibilities: ['FARGATE'],
  networkMode: 'awsvpc',
  runtimePlatform: { cpuArchitecture: 'ARM64', operatingSystemFamily: 'LINUX' },
  cpu: '1024',
  memory: '2048',
  executionRoleArn: env(mode === 'web' ? 'GAME_EXECUTION_ROLE' : 'MIGRATION_EXECUTION_ROLE'),
  containerDefinitions: containers,
};
console.log(JSON.stringify(doc, null, 2));
