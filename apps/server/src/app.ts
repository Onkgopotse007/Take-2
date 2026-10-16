import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { TableRoom } from './room';

export function createApp(roomClass: typeof TableRoom = TableRoom) {
  return defineServer({
    transport: new WebSocketTransport(),
    greet: false,
    rooms: {
      table: defineRoom(roomClass),
    },
    routes: createRouter({
      health: createEndpoint('/healthz', { method: 'GET' }, async () => ({ ok: true })),
    }),
  });
}
