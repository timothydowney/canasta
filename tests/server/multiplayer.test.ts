import { afterEach, describe, expect, it } from 'vitest';
import { io as createClient, type Socket } from 'socket.io-client';
import { createCanastaServer, type RunningCanastaServer } from '../../server/index';
import type {
  ClientToServerEvents,
  PlayerViewPayload,
  ServerToClientEvents,
  TableViewPayload,
} from '../../src/shared/protocol';

type TypedClient = Socket<ServerToClientEvents, ClientToServerEvents>;

function connectClient(port: number): Promise<TypedClient> {
  return new Promise((resolve, reject) => {
    const client: TypedClient = createClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

function waitForEvent<T>(socket: TypedClient, event: keyof ServerToClientEvents): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: unknown) => resolve(data as T));
  });
}

describe('Phase 2B Socket.IO Multiplayer Server', () => {
  let server: RunningCanastaServer | null = null;
  const clients: TypedClient[] = [];

  afterEach(async () => {
    for (const c of clients) {
      c.disconnect();
    }
    clients.length = 0;
    if (server) {
      await server.close();
      server = null;
    }
  });

  it('hosts a 4P Partnership room with strict PlayerView/TableView privacy, rejects spoofed actions, supports seatToken reconnect, and mid-game bot takeover', async () => {
    server = await createCanastaServer({ port: 0, botDelayOverrideMs: 10 });

    const hostDisplay = await connectClient(server.port);
    const player1 = await connectClient(server.port);
    const player2 = await connectClient(server.port);
    clients.push(hostDisplay, player1, player2);

    // 1. Host creates 4P Partnership room in Jackbox table_display mode
    const created = await hostDisplay.emitWithAck('room:create', {
      rulesetId: 'bicycle-4p-partnership',
      matchLength: 'single_hand',
      hostDisplayMode: 'table_display',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.roomCode).toHaveLength(4);
    expect(created.seatToken).toBeNull();

    // 2. Two humans join as partners (Seats 0 and 2)
    const j1 = await player1.emitWithAck('room:join', {
      roomCode: created.roomCode,
      playerName: 'Tim',
      preferredSeatIndex: 0,
    });
    const j2 = await player2.emitWithAck('room:join', {
      roomCode: created.roomCode,
      playerName: 'Alex',
      preferredSeatIndex: 2,
    });
    expect(j1.ok && j2.ok).toBe(true);
    if (!j1.ok || !j2.ok) return;
    expect(j1.seatIndex).toBe(0);
    expect(j2.seatIndex).toBe(2);

    // 3. Prepare listeners before starting match (Seats 1 & 3 auto-fill with bots!)
    const p1ViewPromise = waitForEvent<PlayerViewPayload>(player1, 'game:player_view');
    const p2ViewPromise = waitForEvent<PlayerViewPayload>(player2, 'game:player_view');
    const tvViewPromise = waitForEvent<TableViewPayload>(hostDisplay, 'game:table_view');

    const started = await hostDisplay.emitWithAck('room:start', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
    });
    expect(started.ok).toBe(true);

    const [p1Payload, p2Payload, tvPayload] = await Promise.all([
      p1ViewPromise,
      p2ViewPromise,
      tvViewPromise,
    ]);

    // 4. Verify strict hidden-info privacy!
    expect(p1Payload.view.viewerId).toBe('p0');
    expect(p2Payload.view.viewerId).toBe('p2');
    expect(p1Payload.view.viewerHand).toHaveLength(11);
    expect(p2Payload.view.viewerHand).toHaveLength(11);
    const p1Ids = new Set(p1Payload.view.viewerHand.map((c) => c.id));
    expect(p2Payload.view.viewerHand.some((c) => p1Ids.has(c.id))).toBe(false);
    // TableView contains ZERO hands!
    expect('viewerHand' in tvPayload.view).toBe(false);
    expect('hand' in tvPayload.view.players[0]).toBe(false);

    // 5. Security guard: player1 cannot spoof an action for player2!
    const spoofed = await player1.emitWithAck('game:action', {
      roomCode: created.roomCode,
      seatToken: j1.seatToken,
      action: { type: 'DRAW_STOCK', playerId: j2.playerId },
    });
    expect(spoofed.ok).toBe(false);

    // 6. Disconnect player1 and seamlessly rejoin on a fresh socket using seatToken!
    player1.disconnect();
    const player1Reconnected = await connectClient(server.port);
    clients.push(player1Reconnected);

    const rejoinViewPromise = waitForEvent<PlayerViewPayload>(
      player1Reconnected,
      'game:player_view',
    );
    const rejoined = await player1Reconnected.emitWithAck('room:rejoin', {
      roomCode: created.roomCode,
      seatToken: j1.seatToken,
    });
    expect(rejoined.ok).toBe(true);
    const rejoinPayload = await rejoinViewPromise;
    expect(rejoinPayload.view.viewerId).toBe('p0');
    expect(rejoinPayload.view.viewerHand.length).toBeGreaterThanOrEqual(11);

    // 7. Disconnect player2 and let Host substitute a Bot mid-game!
    player2.disconnect();
    const subRes = await hostDisplay.emitWithAck('room:substitute_bot', {
      roomCode: created.roomCode,
      hostToken: created.hostToken,
      seatIndex: 2,
      botDifficulty: 'normal',
    });
    expect(subRes.ok).toBe(true);
  });
});
