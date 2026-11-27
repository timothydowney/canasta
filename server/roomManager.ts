import crypto from 'node:crypto';
import type { Server } from 'socket.io';
import { HeuristicBotController } from '../src/ai';
import {
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
  getRulesetById,
  getTableView,
  getTeamIndex,
  type GameAction,
  type GameState,
  type MatchLengthPreset,
  type PlayerConfig,
  type RulesetId,
  type TeamId,
} from '../src/engine';
import { BOT_SPEED_MS, type BotSpeed } from '../src/store/persistence';
import type {
  ClientToServerEvents,
  ConfigureSeatRequest,
  CreateRoomAck,
  CreateRoomRequest,
  GameActionEnvelope,
  HostDisplayMode,
  JoinRoomAck,
  JoinRoomRequest,
  RejoinRoomAck,
  RejoinRoomRequest,
  RoomLobbyState,
  RoomSeatInfo,
  ServerToClientEvents,
  SimpleAck,
  SoundCue,
  SubstituteBotRequest,
  SwapSeatsRequest,
} from '../src/shared/protocol';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface SeatSlot extends RoomSeatInfo {
  seatToken: string | null;
  socketId: string | null;
}

interface RoomRecord {
  roomCode: string;
  hostToken: string;
  hostDisplayMode: HostDisplayMode;
  /** Socket IDs subscribed to TableView (shared TV/laptop display) */
  displaySocketIds: Set<string>;
  rulesetId: RulesetId;
  matchLength: MatchLengthPreset;
  botSpeed: BotSpeed;
  status: 'LOBBY' | 'PLAYING';
  seats: SeatSlot[];
  gameState: GameState | null;
  bots: Map<string, HeuristicBotController>;
  botTimer: ReturnType<typeof setTimeout> | null;
  lastActivityAt: number;
}

function generateToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function teamForSeat(rulesetId: RulesetId, seatIndex: number): TeamId {
  if (rulesetId === 'bicycle-4p-partnership') {
    return seatIndex % 2 === 0 ? 'team-0' : 'team-1';
  }
  return `team-${seatIndex}` as TeamId;
}

function stripDiff(name: string): string {
  return name.replace(/\s*\((Easy|Normal|Hard)\)$/, '');
}

export class RoomManager {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly socketToRoom = new Map<string, string>();
  private readonly botDelayOverrideMs?: number;
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    options: { botDelayOverrideMs?: number } = {},
  ) {
    this.io = io;
    this.botDelayOverrideMs = options.botDelayOverrideMs;
    this.cleanupInterval = setInterval(() => this.pruneExpiredRooms(), 60_000);
    this.cleanupInterval.unref?.();
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const room of this.rooms.values()) {
      if (room.botTimer) clearTimeout(room.botTimer);
    }
    this.rooms.clear();
    this.socketToRoom.clear();
  }

  private generateUniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private serializeLobby(room: RoomRecord): RoomLobbyState {
    return {
      roomCode: room.roomCode,
      hostDisplayMode: room.hostDisplayMode,
      rulesetId: room.rulesetId,
      matchLength: room.matchLength,
      botSpeed: room.botSpeed,
      status: room.status,
      seats: room.seats.map((s) => ({
        seatIndex: s.seatIndex,
        teamId: s.teamId,
        occupantKind: s.occupantKind,
        playerId: s.playerId,
        name: s.name,
        botDifficulty: s.botDifficulty,
        connected: s.connected,
      })),
    };
  }

  private broadcastLobby(room: RoomRecord): void {
    this.io.to(room.roomCode).emit('room:lobby_update', this.serializeLobby(room));
  }

  private broadcastViews(
    room: RoomRecord,
    extras: {
      soundCue?: SoundCue;
      toastMessage?: string;
      toastKind?: 'info' | 'red_three' | 'error';
    } = {},
  ): void {
    if (!room.gameState) return;
    const state = room.gameState;

    // Send strictly filtered PlayerView to each connected human socket
    for (const seat of room.seats) {
      if (seat.occupantKind === 'human' && seat.socketId) {
        const view = getPlayerView(state, seat.playerId);
        this.io.to(seat.socketId).emit('game:player_view', {
          roomCode: room.roomCode,
          view,
          ...extras,
        });
      }
    }

    // Send zero-hand TableView to all Host display sockets
    if (room.displaySocketIds.size > 0) {
      const tableView = getTableView(state);
      for (const displaySocketId of room.displaySocketIds) {
        this.io.to(displaySocketId).emit('game:table_view', {
          roomCode: room.roomCode,
          view: tableView,
          ...extras,
        });
      }
    }
  }

  createRoom(req: CreateRoomRequest, socketId: string): CreateRoomAck {
    const ruleset = getRulesetById(req.rulesetId);
    const roomCode = this.generateUniqueCode();
    const hostToken = generateToken();

    const seats: SeatSlot[] = Array.from({ length: ruleset.playerCount }, (_, idx) => ({
      seatIndex: idx,
      teamId: teamForSeat(ruleset.id, idx),
      occupantKind: 'open',
      playerId: `p${idx}`,
      name: `Seat ${idx + 1}`,
      connected: false,
      seatToken: null,
      socketId: null,
    }));

    const displaySocketIds = new Set<string>();
    let hostSeatToken: string | null = null;
    let hostPlayerId: string | null = null;
    let hostSeatIndex: number | null = null;

    if (req.hostDisplayMode === 'player') {
      hostSeatToken = generateToken();
      hostPlayerId = seats[0].playerId;
      hostSeatIndex = 0;
      seats[0] = {
        ...seats[0],
        occupantKind: 'human',
        name: req.hostName?.trim() || 'Host',
        connected: true,
        seatToken: hostSeatToken,
        socketId,
      };
    } else {
      displaySocketIds.add(socketId);
    }

    const room: RoomRecord = {
      roomCode,
      hostToken,
      hostDisplayMode: req.hostDisplayMode,
      displaySocketIds,
      rulesetId: ruleset.id,
      matchLength: req.matchLength,
      botSpeed: 'normal',
      status: 'LOBBY',
      seats,
      gameState: null,
      bots: new Map(),
      botTimer: null,
      lastActivityAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(socketId, roomCode);
    this.io.sockets.sockets.get(socketId)?.join(roomCode);

    return {
      ok: true,
      roomCode,
      hostToken,
      seatToken: hostSeatToken,
      playerId: hostPlayerId,
      seatIndex: hostSeatIndex,
      lobby: this.serializeLobby(room),
    };
  }

  joinRoom(req: JoinRoomRequest, socketId: string): JoinRoomAck {
    const code = req.roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: `Room "${code}" not found.` };
    }
    if (room.status !== 'LOBBY') {
      return { ok: false, error: 'This match is already in progress.' };
    }

    let targetSeat: SeatSlot | undefined;
    if (
      req.preferredSeatIndex !== undefined &&
      room.seats[req.preferredSeatIndex]?.occupantKind === 'open'
    ) {
      targetSeat = room.seats[req.preferredSeatIndex];
    } else {
      targetSeat = room.seats.find((s) => s.occupantKind === 'open');
    }

    if (!targetSeat) {
      return { ok: false, error: 'All seats in this room are full.' };
    }

    const seatToken = generateToken();
    const cleanName =
      req.playerName.trim().slice(0, 16) || `Player ${targetSeat.seatIndex + 1}`;
    targetSeat.occupantKind = 'human';
    targetSeat.name = cleanName;
    targetSeat.botDifficulty = undefined;
    targetSeat.connected = true;
    targetSeat.seatToken = seatToken;
    targetSeat.socketId = socketId;
    room.lastActivityAt = Date.now();

    this.socketToRoom.set(socketId, code);
    this.io.sockets.sockets.get(socketId)?.join(code);
    this.broadcastLobby(room);

    return {
      ok: true,
      roomCode: code,
      seatToken,
      playerId: targetSeat.playerId,
      seatIndex: targetSeat.seatIndex,
      lobby: this.serializeLobby(room),
    };
  }

  rejoinRoom(req: RejoinRoomRequest, socketId: string): RejoinRoomAck {
    const code = req.roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: `Room "${code}" no longer exists.` };
    }

    const isHost = Boolean(req.hostToken && req.hostToken === room.hostToken);

    if (req.seatToken) {
      const seat = room.seats.find(
        (s) => s.occupantKind === 'human' && s.seatToken === req.seatToken,
      );
      if (!seat) {
        return { ok: false, error: 'Seat token is invalid or seat was taken over by a bot.' };
      }
      seat.socketId = socketId;
      seat.connected = true;
      room.lastActivityAt = Date.now();

      this.socketToRoom.set(socketId, code);
      this.io.sockets.sockets.get(socketId)?.join(code);
      this.broadcastLobby(room);

      if (room.status === 'PLAYING' && room.gameState) {
        this.io.to(socketId).emit('game:player_view', {
          roomCode: code,
          view: getPlayerView(room.gameState, seat.playerId),
        });
      }

      return {
        ok: true,
        roomCode: code,
        role: 'player',
        playerId: seat.playerId,
        seatIndex: seat.seatIndex,
        isHost,
        lobby: this.serializeLobby(room),
      };
    }

    if (isHost && room.hostDisplayMode === 'table_display') {
      room.displaySocketIds.add(socketId);
      room.lastActivityAt = Date.now();
      this.socketToRoom.set(socketId, code);
      this.io.sockets.sockets.get(socketId)?.join(code);

      if (room.status === 'PLAYING' && room.gameState) {
        this.io.to(socketId).emit('game:table_view', {
          roomCode: code,
          view: getTableView(room.gameState),
        });
      }

      return {
        ok: true,
        roomCode: code,
        role: 'table_display',
        playerId: null,
        seatIndex: null,
        isHost: true,
        lobby: this.serializeLobby(room),
      };
    }

    return { ok: false, error: 'Missing valid seat or host token.' };
  }

  configureSeat(req: ConfigureSeatRequest): SimpleAck {
    const room = this.rooms.get(req.roomCode.trim().toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.hostToken !== req.hostToken) return { ok: false, error: 'Host authorization required.' };
    if (room.status !== 'LOBBY') return { ok: false, error: 'Cannot change seats after match starts.' };

    const seat = room.seats[req.seatIndex];
    if (!seat) return { ok: false, error: 'Invalid seat index.' };

    if (req.kind === 'bot') {
      const diff = req.botDifficulty ?? 'normal';
      seat.occupantKind = 'bot';
      seat.botDifficulty = diff;
      seat.name = req.name?.trim() || `Bot ${seat.seatIndex + 1}`;
      seat.connected = true;
      seat.seatToken = null;
      seat.socketId = null;
    } else {
      seat.occupantKind = 'open';
      seat.botDifficulty = undefined;
      seat.name = `Seat ${seat.seatIndex + 1}`;
      seat.connected = false;
      seat.seatToken = null;
      seat.socketId = null;
    }

    room.lastActivityAt = Date.now();
    this.broadcastLobby(room);
    return { ok: true };
  }

  swapSeats(req: SwapSeatsRequest): SimpleAck {
    const room = this.rooms.get(req.roomCode.trim().toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.hostToken !== req.hostToken) return { ok: false, error: 'Host authorization required.' };
    if (room.status !== 'LOBBY') return { ok: false, error: 'Cannot swap seats after match starts.' };

    const a = room.seats[req.seatA];
    const b = room.seats[req.seatB];
    if (!a || !b || req.seatA === req.seatB) {
      return { ok: false, error: 'Invalid seats to swap.' };
    }

    const tmp = {
      occupantKind: a.occupantKind,
      name: a.name,
      botDifficulty: a.botDifficulty,
      connected: a.connected,
      seatToken: a.seatToken,
      socketId: a.socketId,
    };

    a.occupantKind = b.occupantKind;
    a.name = b.name;
    a.botDifficulty = b.botDifficulty;
    a.connected = b.connected;
    a.seatToken = b.seatToken;
    a.socketId = b.socketId;

    b.occupantKind = tmp.occupantKind;
    b.name = tmp.name;
    b.botDifficulty = tmp.botDifficulty;
    b.connected = tmp.connected;
    b.seatToken = tmp.seatToken;
    b.socketId = tmp.socketId;

    room.lastActivityAt = Date.now();
    this.broadcastLobby(room);
    return { ok: true };
  }

  setBotSpeed(roomCode: string, hostToken: string, botSpeed: BotSpeed): SimpleAck {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.hostToken !== hostToken) return { ok: false, error: 'Host authorization required.' };
    room.botSpeed = botSpeed;
    room.lastActivityAt = Date.now();
    this.broadcastLobby(room);
    return { ok: true };
  }

  startMatch(roomCode: string, hostToken: string): SimpleAck {
    const room = this.rooms.get(roomCode.trim().toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.hostToken !== hostToken) return { ok: false, error: 'Host authorization required.' };
    if (room.status !== 'LOBBY') return { ok: false, error: 'Match already started.' };

    const humanCount = room.seats.filter((s) => s.occupantKind === 'human').length;
    if (humanCount === 0) {
      return { ok: false, error: 'At least one human player must join before starting.' };
    }

    // Auto-fill any open seats with Normal bots
    for (const seat of room.seats) {
      if (seat.occupantKind === 'open') {
        seat.occupantKind = 'bot';
        seat.botDifficulty = 'normal';
        seat.name = `Bot ${seat.seatIndex + 1}`;
        seat.connected = true;
      }
    }

    const baseRuleset = getRulesetById(room.rulesetId);
    const ruleset = createRuleset(baseRuleset, room.matchLength);

    const players: PlayerConfig[] = room.seats.map((s) => {
      const displayName =
        s.occupantKind === 'bot' && !s.name.includes('(')
          ? `${s.name} (${(s.botDifficulty ?? 'normal')[0].toUpperCase()}${(s.botDifficulty ?? 'normal').slice(1)})`
          : s.name;
      return {
        id: s.playerId,
        name: displayName,
        teamId: s.teamId,
        kind: s.occupantKind === 'bot' ? 'bot' : 'human',
        botDifficulty: s.occupantKind === 'bot' ? (s.botDifficulty ?? 'normal') : undefined,
      };
    });

    const teamNames =
      room.rulesetId === 'bicycle-4p-partnership'
        ? [
            `${stripDiff(players[0].name)} & ${stripDiff(players[2].name)}`,
            `${stripDiff(players[1].name)} & ${stripDiff(players[3].name)}`,
          ]
        : players.map((p) => stripDiff(p.name));

    const gameState = createMatch({
      ruleset,
      players,
      teamNames,
    });

    room.gameState = gameState;
    room.status = 'PLAYING';
    room.bots.clear();
    for (const p of gameState.players) {
      if (p.kind === 'bot') {
        room.bots.set(
          p.id,
          new HeuristicBotController(
            p.id,
            p.botDifficulty ?? 'normal',
            gameState.matchSeed ^ (p.seatIndex * 7919 + 13),
          ),
        );
      }
    }
    room.lastActivityAt = Date.now();

    this.broadcastLobby(room);
    this.broadcastViews(room, { soundCue: 'deal' });
    this.scheduleBotIfNeeded(room);
    return { ok: true };
  }

  substituteBot(req: SubstituteBotRequest): SimpleAck {
    const room = this.rooms.get(req.roomCode.trim().toUpperCase());
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.hostToken !== req.hostToken) return { ok: false, error: 'Host authorization required.' };
    if (room.status !== 'PLAYING' || !room.gameState) {
      return { ok: false, error: 'Match is not currently playing.' };
    }

    const seat = room.seats[req.seatIndex];
    if (!seat) return { ok: false, error: 'Invalid seat index.' };

    const botName = `${stripDiff(seat.name)} (Bot)`;
    seat.occupantKind = 'bot';
    seat.botDifficulty = req.botDifficulty;
    seat.connected = true;
    seat.seatToken = null;
    seat.socketId = null;
    seat.name = botName;

    room.gameState = {
      ...room.gameState,
      players: room.gameState.players.map((p) =>
        p.id === seat.playerId
          ? { ...p, kind: 'bot', botDifficulty: req.botDifficulty, name: botName }
          : p,
      ),
    };

    room.bots.set(
      seat.playerId,
      new HeuristicBotController(
        seat.playerId,
        req.botDifficulty,
        room.gameState.matchSeed ^ (seat.seatIndex * 9973 + 5),
      ),
    );
    room.lastActivityAt = Date.now();

    this.broadcastLobby(room);
    this.broadcastViews(room, {
      toastKind: 'info',
      toastMessage: `${botName} took over Seat ${seat.seatIndex + 1}.`,
    });
    this.scheduleBotIfNeeded(room);
    return { ok: true };
  }

  handleGameAction(req: GameActionEnvelope): SimpleAck {
    const room = this.rooms.get(req.roomCode.trim().toUpperCase());
    if (!room || !room.gameState) {
      return { ok: false, error: 'Active match not found.' };
    }

    const action = req.action;
    if (action.type === 'START_NEXT_HAND') {
      const isHost = Boolean(req.hostToken && req.hostToken === room.hostToken);
      const isSeated = Boolean(
        req.seatToken && room.seats.some((s) => s.seatToken === req.seatToken),
      );
      if (!isHost && !isSeated) {
        return { ok: false, error: 'Unauthorized to start next hand.' };
      }
      return this.executeEngineAction(room, action);
    }

    // Strictly verify seatToken matches action.playerId (prevents spoofing!)
    const seat = req.seatToken
      ? room.seats.find(
          (s) => s.occupantKind === 'human' && s.seatToken === req.seatToken,
        )
      : undefined;
    if (!seat) {
      return { ok: false, error: 'Invalid or missing seat token.' };
    }
    if (action.playerId !== seat.playerId) {
      return { ok: false, error: 'You cannot submit actions on behalf of another player.' };
    }

    return this.executeEngineAction(room, action);
  }

  private executeEngineAction(room: RoomRecord, action: GameAction): SimpleAck {
    const state = room.gameState;
    if (!state) return { ok: false, error: 'Match not started.' };

    const prevLogLen = state.actionLog.length;
    const prevActive = state.players[state.activePlayerIndex];

    const res = applyAction(state, action);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const next = res.state;
    room.gameState = next;
    room.lastActivityAt = Date.now();

    const prevCanastas = state.teams.reduce(
      (sum, t) => sum + t.melds.filter((m) => m.isCanasta).length,
      0,
    );
    const nextCanastas = next.teams.reduce(
      (sum, t) => sum + t.melds.filter((m) => m.isCanasta).length,
      0,
    );
    const newLogs = next.actionLog.slice(prevLogLen);
    const redThreeLog = newLogs.find((l) => l.kind === 'red_three');
    const partnerLog = newLogs.find((l) => l.kind === 'partner_prompt');

    let soundCue: SoundCue | undefined;
    if (next.phase === 'HAND_OVER' || next.phase === 'MATCH_OVER') {
      soundCue = 'hand_end';
    } else if (action.type === 'START_NEXT_HAND') {
      soundCue = 'deal';
    } else if (
      action.type === 'ASK_PARTNER_GO_OUT' ||
      action.type === 'ANSWER_PARTNER_GO_OUT'
    ) {
      soundCue = 'partner_prompt';
    } else if (nextCanastas > prevCanastas) {
      soundCue = 'canasta';
    } else if (action.type === 'TAKE_DISCARD_PILE') {
      soundCue = 'take_pile';
    } else if (action.type === 'COMMIT_MELDS') {
      soundCue = 'meld';
    } else if (action.type === 'UNDO_TURN_MELDS') {
      soundCue = 'undo';
    } else if (action.type === 'DISCARD') {
      const frozeNow =
        !state.discardPile.frozenByWildOrInitial &&
        next.discardPile.frozenByWildOrInitial;
      soundCue = frozeNow ? 'freeze' : 'discard';
    } else if (action.type === 'DRAW_STOCK') {
      soundCue = redThreeLog ? 'red_three' : 'draw';
    }

    let toastMessage: string | undefined;
    let toastKind: 'info' | 'red_three' | 'error' | undefined;
    if (redThreeLog) {
      toastMessage = redThreeLog.message;
      toastKind = 'red_three';
    } else if (partnerLog) {
      toastMessage = partnerLog.message;
      toastKind = 'info';
    } else if (nextCanastas > prevCanastas) {
      toastMessage = newLogs.find((l) => l.kind === 'meld' || l.kind === 'take_pile')?.message;
      toastKind = 'info';
    } else if (action.type === 'TAKE_DISCARD_PILE') {
      toastMessage = newLogs.find((l) => l.kind === 'take_pile')?.message;
      toastKind = 'info';
    } else if (
      action.type === 'DISCARD' &&
      !state.discardPile.frozenByWildOrInitial &&
      next.discardPile.frozenByWildOrInitial
    ) {
      toastMessage = newLogs.find((l) => l.kind === 'discard')?.message;
      toastKind = 'info';
    } else if (
      action.type === 'COMMIT_MELDS' &&
      !state.teams[getTeamIndex(state.teams, prevActive.teamId)].hasMadeInitialMeld
    ) {
      toastMessage = newLogs.find((l) => l.kind === 'meld')?.message;
      toastKind = 'info';
    }

    this.broadcastViews(room, { soundCue, toastMessage, toastKind });
    this.scheduleBotIfNeeded(room);
    return { ok: true };
  }

  private scheduleBotIfNeeded(room: RoomRecord): void {
    if (room.botTimer) {
      clearTimeout(room.botTimer);
      room.botTimer = null;
    }
    const state = room.gameState;
    if (!state) return;
    if (state.phase !== 'DRAW' && state.phase !== 'MELD_OR_DISCARD') return;

    let botActorId: string | null = null;
    if (state.partnerGoOut?.status === 'PENDING') {
      const partner = state.players.find(
        (p) => p.id === state.partnerGoOut!.partnerPlayerId,
      );
      if (partner?.kind === 'bot') botActorId = partner.id;
    } else {
      const active = state.players[state.activePlayerIndex];
      if (active.kind === 'bot') botActorId = active.id;
    }

    if (!botActorId) return;
    const bot = room.bots.get(botActorId);
    if (!bot) return;

    const delay = this.botDelayOverrideMs ?? BOT_SPEED_MS[room.botSpeed];
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (!room.gameState) return;
      const botView = getPlayerView(room.gameState, botActorId!);
      const botAction = bot.chooseAction(botView);
      this.executeEngineAction(room, botAction);
    }, delay);
  }

  handleDisconnect(socketId: string): void {
    const code = this.socketToRoom.get(socketId);
    if (!code) return;
    this.socketToRoom.delete(socketId);

    const room = this.rooms.get(code);
    if (!room) return;

    let changed = false;
    if (room.displaySocketIds.has(socketId)) {
      room.displaySocketIds.delete(socketId);
    }
    for (const seat of room.seats) {
      if (seat.socketId === socketId) {
        seat.socketId = null;
        seat.connected = false;
        changed = true;
      }
    }
    if (changed) {
      this.broadcastLobby(room);
    }
  }

  private pruneExpiredRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        if (room.botTimer) clearTimeout(room.botTimer);
        this.rooms.delete(code);
      }
    }
  }
}
