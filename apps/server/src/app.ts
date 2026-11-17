import { createEndpoint, createRouter, defineRoom, defineServer } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MadagascarRoom, TableRoom } from './room';

export function createApp(roomClass: typeof TableRoom = TableRoom, madagascarRoomClass: typeof MadagascarRoom = MadagascarRoom) {
  return defineServer({
    transport: new WebSocketTransport(),
    greet: false,
    rooms: {
      table: defineRoom(roomClass),
      madagascar: defineRoom(madagascarRoomClass),
    },
    routes: createRouter({
      health: createEndpoint('/healthz', { method: 'GET' }, async () => ({ ok: true })),
    }),
  });
}
