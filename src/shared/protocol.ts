import type {
  BotDifficulty,
  GameAction,
  MatchLengthPreset,
  PlayerView,
  RulesetId,
  TableView,
  TeamId,
} from '../engine';
import type { BotSpeed } from '../store/persistence';

export type HostDisplayMode = 'table_display' | 'player';

export type SoundCue =
  | 'deal'
  | 'draw'
  | 'discard'
  | 'freeze'
  | 'take_pile'
  | 'meld'
  | 'canasta'
  | 'red_three'
  | 'undo'
  | 'partner_prompt'
  | 'hand_end'
  | 'error';

export interface NetworkAdapterInfo {
  name: string;
  address: string;
  isVirtual: boolean;
}

export interface NetworkInfoResponse {
  preferredIp: string;
  clientPort: number;
  candidates: NetworkAdapterInfo[];
}

export interface RoomSeatInfo {
  seatIndex: number;
  teamId: TeamId;
  occupantKind: 'open' | 'human' | 'bot';
  playerId: string;
  name: string;
  botDifficulty?: BotDifficulty;
  connected: boolean;
}

export interface RoomLobbyState {
  roomCode: string;
  hostDisplayMode: HostDisplayMode;
  rulesetId: RulesetId;
  matchLength: MatchLengthPreset;
  botSpeed: BotSpeed;
  status: 'LOBBY' | 'PLAYING';
  seats: RoomSeatInfo[];
}

export interface CreateRoomRequest {
  rulesetId: RulesetId;
  matchLength: MatchLengthPreset;
  hostDisplayMode: HostDisplayMode;
  hostName?: string;
}

export type CreateRoomAck =
  | {
      ok: true;
      roomCode: string;
      hostToken: string;
      seatToken: string | null;
      playerId: string | null;
      seatIndex: number | null;
      lobby: RoomLobbyState;
    }
  | { ok: false; error: string };

export interface JoinRoomRequest {
  roomCode: string;
  playerName: string;
  preferredSeatIndex?: number;
}

export type JoinRoomAck =
  | {
      ok: true;
      roomCode: string;
      seatToken: string;
      playerId: string;
      seatIndex: number;
      lobby: RoomLobbyState;
    }
  | { ok: false; error: string };

export interface RejoinRoomRequest {
  roomCode: string;
  seatToken?: string;
  hostToken?: string;
}

export type RejoinRoomAck =
  | {
      ok: true;
      roomCode: string;
      role: 'player' | 'table_display';
      playerId: string | null;
      seatIndex: number | null;
      isHost: boolean;
      lobby: RoomLobbyState;
    }
  | { ok: false; error: string };

export type SimpleAck = { ok: true } | { ok: false; error: string };

export interface ConfigureSeatRequest {
  roomCode: string;
  hostToken: string;
  seatIndex: number;
  kind: 'open' | 'bot';
  botDifficulty?: BotDifficulty;
  name?: string;
}

export interface SwapSeatsRequest {
  roomCode: string;
  hostToken: string;
  seatA: number;
  seatB: number;
}

export interface SubstituteBotRequest {
  roomCode: string;
  hostToken: string;
  seatIndex: number;
  botDifficulty: BotDifficulty;
}

export interface GameActionEnvelope {
  roomCode: string;
  seatToken?: string;
  hostToken?: string;
  action: GameAction;
}

export interface PlayerViewPayload {
  roomCode: string;
  view: PlayerView;
  soundCue?: SoundCue;
  toastMessage?: string;
  toastKind?: 'info' | 'red_three' | 'error';
}

export interface TableViewPayload {
  roomCode: string;
  view: TableView;
  soundCue?: SoundCue;
  toastMessage?: string;
  toastKind?: 'info' | 'red_three' | 'error';
}

export interface ClientToServerEvents {
  'room:create': (req: CreateRoomRequest, ack: (res: CreateRoomAck) => void) => void;
  'room:join': (req: JoinRoomRequest, ack: (res: JoinRoomAck) => void) => void;
  'room:rejoin': (req: RejoinRoomRequest, ack: (res: RejoinRoomAck) => void) => void;
  'room:configure_seat': (
    req: ConfigureSeatRequest,
    ack: (res: SimpleAck) => void,
  ) => void;
  'room:swap_seats': (req: SwapSeatsRequest, ack: (res: SimpleAck) => void) => void;
  'room:set_bot_speed': (
    req: { roomCode: string; hostToken: string; botSpeed: BotSpeed },
    ack: (res: SimpleAck) => void,
  ) => void;
  'room:substitute_bot': (
    req: SubstituteBotRequest,
    ack: (res: SimpleAck) => void,
  ) => void;
  'room:start': (
    req: { roomCode: string; hostToken: string },
    ack: (res: SimpleAck) => void,
  ) => void;
  'game:action': (req: GameActionEnvelope, ack: (res: SimpleAck) => void) => void;
}

export interface ServerToClientEvents {
  'room:lobby_update': (lobby: RoomLobbyState) => void;
  'game:player_view': (payload: PlayerViewPayload) => void;
  'game:table_view': (payload: TableViewPayload) => void;
  'game:error': (payload: { message: string }) => void;
}
