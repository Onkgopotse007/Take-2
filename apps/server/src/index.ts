import { createApp } from './app';

const port = Number(process.env.PORT ?? 2567);

await createApp().listen(port);
console.log(`Take 2 server listening on port ${port}`);
