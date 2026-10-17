import { createApp } from './app';

// Optional local settings. Variables already set (e.g. by Kubernetes) take precedence.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file: use the defaults below.
}

const port = Number(process.env.PORT ?? 2567);

await createApp().listen(port);
console.log(`Take 2 server listening on port ${port}`);
