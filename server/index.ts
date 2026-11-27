import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../src/shared/protocol';
import { detectLanNetworkInfo } from './networkInfo';
import { RoomManager } from './roomManager';

export interface CanastaServerOptions {
  port?: number;
  clientPort?: number;
  botDelayOverrideMs?: number;
}

export interface RunningCanastaServer {
  httpServer: http.Server;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  roomManager: RoomManager;
  port: number;
  close: () => Promise<void>;
}

export async function createCanastaServer(
  options: CanastaServerOptions = {},
): Promise<RunningCanastaServer> {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const clientPort = options.clientPort ?? Number(process.env.CLIENT_PORT ?? 5173);

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'canasta-server' });
  });

  app.get('/api/network-info', (_req, res) => {
    res.json(detectLanNetworkInfo(clientPort));
  });

  // In production, serve built Vite static assets directly from dist/
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(__dirname, '../dist');
  if (fs.existsSync(distDir) && process.env.NODE_ENV === 'production') {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
  });

  const roomManager = new RoomManager(io, {
    botDelayOverrideMs: options.botDelayOverrideMs,
  });

  io.on('connection', (socket) => {
    socket.on('room:create', (req, ack) => {
      ack(roomManager.createRoom(req, socket.id));
    });

    socket.on('room:join', (req, ack) => {
      ack(roomManager.joinRoom(req, socket.id));
    });

    socket.on('room:rejoin', (req, ack) => {
      ack(roomManager.rejoinRoom(req, socket.id));
    });

    socket.on('room:configure_seat', (req, ack) => {
      ack(roomManager.configureSeat(req));
    });

    socket.on('room:swap_seats', (req, ack) => {
      ack(roomManager.swapSeats(req));
    });

    socket.on('room:set_bot_speed', (req, ack) => {
      ack(roomManager.setBotSpeed(req.roomCode, req.hostToken, req.botSpeed));
    });

    socket.on('room:substitute_bot', (req, ack) => {
      ack(roomManager.substituteBot(req));
    });

    socket.on('room:start', (req, ack) => {
      ack(roomManager.startMatch(req.roomCode, req.hostToken));
    });

    socket.on('game:action', (req, ack) => {
      const res = roomManager.handleGameAction(req);
      if (!res.ok) {
        socket.emit('game:error', { message: res.error });
      }
      ack(res);
    });

    socket.on('disconnect', () => {
      roomManager.handleDisconnect(socket.id);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => resolve());
  });

  const address = httpServer.address();
  const actualPort =
    typeof address === 'object' && address ? address.port : port;

  return {
    httpServer,
    io,
    roomManager,
    port: actualPort,
    close: async () => {
      roomManager.destroy();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

// Auto-start when launched directly via `tsx server/index.ts`
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  createCanastaServer().then((srv) => {
    const net = detectLanNetworkInfo(
      process.env.NODE_ENV === 'production' ? srv.port : 5173,
    );
    console.log(`[Canasta Server] Listening on http://0.0.0.0:${srv.port}`);
    console.log(
      `[Canasta LAN]    Phones & laptops join at: http://${net.preferredIp}:${net.clientPort}`,
    );
  });
}
