import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  BotDifficulty,
  GameAction,
  MatchLengthPreset,
  PlayerView,
  RulesetId,
  TableView,
} from '../engine';
import type {
  ClientToServerEvents,
  HostDisplayMode,
  RoomLobbyState,
  ServerToClientEvents,
  SoundCue,
} from '../shared/protocol';
import type { BotSpeed } from './persistence';
import type { ToastNotice } from './gameSession';
import { soundEngine } from '../ui/audio/soundEngine';

const REMOTE_CRED_KEY = 'canasta_remote_session_v1';

interface StoredRemoteCreds {
  roomCode: string;
  hostToken?: string;
  seatToken?: string;
  role: 'player' | 'table_display';
}

function saveRemoteCreds(creds: StoredRemoteCreds): void {
  try {
    const serialized = JSON.stringify(creds);
    window.sessionStorage.setItem(REMOTE_CRED_KEY, serialized);
    window.localStorage.setItem(REMOTE_CRED_KEY, serialized);
  } catch {
    // ignore
  }
}

function loadRemoteCreds(): StoredRemoteCreds | null {
  try {
    // If explicitly arriving via a ?join=CODE link, don't hijack with another tab's saved creds
    const params = new URLSearchParams(window.location.search);
    const hasExplicitJoin = Boolean(params.get('join'));
    const raw =
      window.sessionStorage.getItem(REMOTE_CRED_KEY) ??
      (hasExplicitJoin ? null : window.localStorage.getItem(REMOTE_CRED_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRemoteCreds>;
    if (!parsed.roomCode || !parsed.role) return null;
    return parsed as StoredRemoteCreds;
  } catch {
    return null;
  }
}

function clearRemoteCreds(): void {
  try {
    window.sessionStorage.removeItem(REMOTE_CRED_KEY);
    window.localStorage.removeItem(REMOTE_CRED_KEY);
  } catch {
    // ignore
  }
}

function playSoundCue(cue: SoundCue): void {
  switch (cue) {
    case 'deal':
      soundEngine.playDeal();
      break;
    case 'draw':
      soundEngine.playDraw();
      break;
    case 'discard':
      soundEngine.playDiscard(false);
      break;
    case 'freeze':
      soundEngine.playDiscard(true);
      break;
    case 'take_pile':
      soundEngine.playTakePile();
      break;
    case 'meld':
      soundEngine.playMeld();
      break;
    case 'canasta':
      soundEngine.playCanasta();
      break;
    case 'red_three':
      soundEngine.playRedThree();
      break;
    case 'undo':
      soundEngine.playUndo();
      break;
    case 'partner_prompt':
      soundEngine.playUiClick();
      break;
    case 'hand_end':
      soundEngine.playHandEnd();
      break;
    case 'error':
      soundEngine.playError();
      break;
  }
}

export function useRemoteCanastaSession() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [seatToken, setSeatToken] = useState<string | null>(null);
  const [role, setRole] = useState<'player' | 'table_display' | null>(null);
  const [lobby, setLobby] = useState<RoomLobbyState | null>(null);
  const [playerView, setPlayerView] = useState<PlayerView | null>(null);
  const [tableView, setTableView] = useState<TableView | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [localMuted, setLocalMuted] = useState<boolean>(() => {
    // Default phone-sized viewports to muted to avoid living-room echo; desktop/TV unmuted
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
    return soundEngine.isMuted();
  });

  const localMutedRef = useRef(localMuted);
  localMutedRef.current = localMuted;
  const toastSeqRef = useRef(1);

  const showToast = useCallback((kind: ToastNotice['kind'], message: string) => {
    const id = toastSeqRef.current++;
    setToast({ id, kind, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((curr) => (curr?.id === toast.id ? null : curr));
    }, 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const ensureSocket = useCallback((): Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > => {
    if (socketRef.current) return socketRef.current;

    const sock: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    sock.on('connect', () => {
      setConnected(true);
      // Auto-rejoin if we hold saved room credentials (phone lock / Wi-Fi blip!)
      const creds = loadRemoteCreds();
      if (creds) {
        sock.emit(
          'room:rejoin',
          {
            roomCode: creds.roomCode,
            seatToken: creds.seatToken,
            hostToken: creds.hostToken,
          },
          (res) => {
            if (res.ok) {
              setRoomCode(res.roomCode);
              setRole(res.role);
              setLobby(res.lobby);
              if (creds.hostToken) setHostToken(creds.hostToken);
              if (creds.seatToken) setSeatToken(creds.seatToken);
            } else {
              clearRemoteCreds();
            }
          },
        );
      }
    });

    sock.on('disconnect', () => {
      setConnected(false);
    });

    sock.on('room:lobby_update', (nextLobby) => {
      setLobby(nextLobby);
    });

    sock.on('game:player_view', (payload) => {
      setPlayerView(payload.view);
      if (payload.soundCue && !localMutedRef.current) {
        playSoundCue(payload.soundCue);
      }
      if (payload.toastMessage) {
        showToast(payload.toastKind ?? 'info', payload.toastMessage);
      }
    });

    sock.on('game:table_view', (payload) => {
      setTableView(payload.view);
      if (payload.soundCue && !localMutedRef.current) {
        playSoundCue(payload.soundCue);
      }
      if (payload.toastMessage) {
        showToast(payload.toastKind ?? 'info', payload.toastMessage);
      }
    });

    sock.on('game:error', ({ message }) => {
      if (!localMutedRef.current) soundEngine.playError();
      showToast('error', message);
    });

    socketRef.current = sock;
    return sock;
  }, [showToast]);

  // Attempt auto-rejoin on page mount if credentials exist from before reload
  useEffect(() => {
    const existing = loadRemoteCreds();
    if (existing) {
      ensureSocket();
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [ensureSocket]);

  const createRoom = useCallback(
    async (req: {
      rulesetId: RulesetId;
      matchLength: MatchLengthPreset;
      hostDisplayMode: HostDisplayMode;
      hostName?: string;
    }): Promise<boolean> => {
      const sock = ensureSocket();
      return new Promise((resolve) => {
        sock.emit('room:create', req, (res) => {
          if (!res.ok) {
            showToast('error', res.error);
            resolve(false);
            return;
          }
          const assignedRole: 'player' | 'table_display' =
            req.hostDisplayMode === 'player' ? 'player' : 'table_display';
          setRoomCode(res.roomCode);
          setHostToken(res.hostToken);
          setSeatToken(res.seatToken);
          setRole(assignedRole);
          setLobby(res.lobby);
          setPlayerView(null);
          setTableView(null);
          // Host Table Display defaults to unmuted!
          if (assignedRole === 'table_display') {
            setLocalMuted(false);
          }
          saveRemoteCreds({
            roomCode: res.roomCode,
            hostToken: res.hostToken,
            seatToken: res.seatToken ?? undefined,
            role: assignedRole,
          });
          resolve(true);
        });
      });
    },
    [ensureSocket, showToast],
  );

  const joinRoom = useCallback(
    async (req: {
      roomCode: string;
      playerName: string;
      preferredSeatIndex?: number;
    }): Promise<boolean> => {
      const sock = ensureSocket();
      return new Promise((resolve) => {
        sock.emit('room:join', req, (res) => {
          if (!res.ok) {
            showToast('error', res.error);
            resolve(false);
            return;
          }
          setRoomCode(res.roomCode);
          setHostToken(null);
          setSeatToken(res.seatToken);
          setRole('player');
          setLobby(res.lobby);
          setPlayerView(null);
          setTableView(null);
          saveRemoteCreds({
            roomCode: res.roomCode,
            seatToken: res.seatToken,
            role: 'player',
          });
          resolve(true);
        });
      });
    },
    [ensureSocket, showToast],
  );

  const configureSeat = useCallback(
    (seatIndex: number, kind: 'open' | 'bot', botDifficulty?: BotDifficulty) => {
      if (!roomCode || !hostToken || !socketRef.current) return;
      socketRef.current.emit(
        'room:configure_seat',
        { roomCode, hostToken, seatIndex, kind, botDifficulty },
        (res) => {
          if (!res.ok) showToast('error', res.error);
        },
      );
    },
    [hostToken, roomCode, showToast],
  );

  const swapSeats = useCallback(
    (seatA: number, seatB: number) => {
      if (!roomCode || !hostToken || !socketRef.current) return;
      socketRef.current.emit(
        'room:swap_seats',
        { roomCode, hostToken, seatA, seatB },
        (res) => {
          if (!res.ok) showToast('error', res.error);
        },
      );
    },
    [hostToken, roomCode, showToast],
  );

  const setBotSpeed = useCallback(
    (botSpeed: BotSpeed) => {
      if (!roomCode || !hostToken || !socketRef.current) return;
      socketRef.current.emit(
        'room:set_bot_speed',
        { roomCode, hostToken, botSpeed },
        (res) => {
          if (!res.ok) showToast('error', res.error);
        },
      );
    },
    [hostToken, roomCode, showToast],
  );

  const substituteBot = useCallback(
    (seatIndex: number, botDifficulty: BotDifficulty = 'normal') => {
      if (!roomCode || !hostToken || !socketRef.current) return;
      socketRef.current.emit(
        'room:substitute_bot',
        { roomCode, hostToken, seatIndex, botDifficulty },
        (res) => {
          if (!res.ok) showToast('error', res.error);
        },
      );
    },
    [hostToken, roomCode, showToast],
  );

  const startMatch = useCallback(() => {
    if (!roomCode || !hostToken || !socketRef.current) return;
    socketRef.current.emit('room:start', { roomCode, hostToken }, (res) => {
      if (!res.ok) showToast('error', res.error);
    });
  }, [hostToken, roomCode, showToast]);

  const dispatchAction = useCallback(
    (action: GameAction): boolean => {
      if (!roomCode || !socketRef.current) return false;
      socketRef.current.emit(
        'game:action',
        {
          roomCode,
          seatToken: seatToken ?? undefined,
          hostToken: hostToken ?? undefined,
          action,
        },
        (res) => {
          if (!res.ok) showToast('error', res.error);
        },
      );
      return true;
    },
    [hostToken, roomCode, seatToken, showToast],
  );

  const leaveRoom = useCallback(() => {
    clearRemoteCreds();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setRoomCode(null);
    setHostToken(null);
    setSeatToken(null);
    setRole(null);
    setLobby(null);
    setPlayerView(null);
    setTableView(null);
  }, []);

  const toggleMuted = useCallback(() => {
    setLocalMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      if (!next) soundEngine.playUiClick();
      return next;
    });
  }, []);

  return {
    connected,
    roomCode,
    isHost: Boolean(hostToken),
    role,
    lobby,
    playerView,
    tableView,
    toast,
    dismissToast: () => setToast(null),
    soundMuted: localMuted,
    toggleSound: toggleMuted,
    createRoom,
    joinRoom,
    configureSeat,
    swapSeats,
    setBotSpeed,
    substituteBot,
    startMatch,
    dispatchAction,
    leaveRoom,
  };
}
