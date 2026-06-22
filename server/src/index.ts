/**
 * Sealed Deck relay/coordinator.
 *  - HTTP: health + bootstrap config for the frontend (+ x402 buy-in route, see x402.ts).
 *  - WS:   per-table card-blob relay and game-state broadcast.
 *
 * The server holds no private key, signs nothing, and never sees a secret card.
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';
import { Room } from './room.js';
import { mountX402 } from './x402.js';
import type { ClientMessage } from '@sealed-deck/mental-poker';

const rooms = new Map<string, Room>();

function getRoom(tableId: string): Room {
  const key = tableId.toLowerCase();
  let room = rooms.get(key);
  if (!room) {
    room = new Room(key);
    rooms.set(key, room);
  }
  return room;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/config', (_req, res) => {
  res.json({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    defaultTable: config.defaultTable || null,
    bettingPath: config.bettingPath,
  });
});

// x402 USDC buy-in handshake (Avalanche Fuji). Optional path; AVAX join is the default.
mountX402(app);

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  // The first message must be a `hello` naming the table + the player's address.
  const onFirst = async (raw: Buffer): Promise<void> => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ t: 'error', message: 'expected hello json' }));
      return;
    }
    if (msg.t !== 'hello') {
      ws.send(JSON.stringify({ t: 'error', message: 'first message must be hello' }));
      return;
    }
    ws.off('message', onFirst);
    const room = getRoom(msg.tableId);
    await room.attach(ws, msg.address);
  };
  ws.on('message', onFirst);
});

// Periodically reap empty rooms.
setInterval(() => {
  for (const [key, room] of rooms) {
    if (room.isEmpty()) {
      room.dispose();
      rooms.delete(key);
    }
  }
}, 60_000);

httpServer.listen(config.port, config.host, () => {
  console.log(`[sealed-deck] relay listening on http://${config.host}:${config.port}`);
  console.log(`[sealed-deck]   chainId=${config.chainId} bettingPath=${config.bettingPath}`);
  console.log(`[sealed-deck]   default table: ${config.defaultTable || '(none — clients pass tableId)'}`);
  console.log(`[sealed-deck]   ws path: /ws`);
});
