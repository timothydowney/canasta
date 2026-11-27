import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeuristicBotController } from '../ai';
import {
  BICYCLE_2P_CLASSIC,
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
  type BotDifficulty,
  type GameAction,
  type GameState,
  type MatchLengthPreset,
  type PlayerConfig,
  type PlayerView,
} from '../engine';
import {
  BOT_SPEED_MS,
  clearSavedSession,
  loadSavedSession,
  saveSession,
  type BotSpeed,
  type GameMode,
  type SavedSession,
} from './persistence';
import { buildTurnRecap } from './privacyCurtain';

export interface NewMatchRequest {
  mode: GameMode;
  matchLength: MatchLengthPreset;
  botDifficulty: BotDifficulty;
  player1Name: string;
  player2Name: string;
}

export interface ToastNotice {
  id: number;
  kind: 'info' | 'red_three' | 'error';
  message: string;
}

export interface PrivacyCurtainState {
  open: boolean;
  targetPlayerName: string;
  recap: string[];
  manualHide: boolean;
}

export function useCanastaSession() {
  const [savedSummary, setSavedSummary] = useState<SavedSession | null>(() =>
    loadSavedSession(),
  );
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<GameMode>('solo_bot');
  const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal');
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [curtain, setCurtain] = useState<PrivacyCurtainState>({
    open: false,
    targetPlayerName: '',
    recap: [],
    manualHide: false,
  });

  const botsRef = useRef<Map<string, HeuristicBotController>>(new Map());
  const toastSeqRef = useRef(1);

  const showToast = useCallback(
    (kind: ToastNotice['kind'], message: string) => {
      const id = toastSeqRef.current++;
      setToast({ id, kind, message });
    },
    [],
  );

  // Auto-clear transient toasts after 3.8s
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast((curr) => (curr?.id === toast.id ? null : curr));
    }, 3800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const initBotsForState = useCallback((gs: GameState) => {
    const map = new Map<string, HeuristicBotController>();
    for (const p of gs.players) {
      if (p.kind === 'bot') {
        map.set(
          p.id,
          new HeuristicBotController(
            p.id,
            p.botDifficulty ?? 'normal',
            gs.matchSeed ^ (p.seatIndex * 7919 + 13),
          ),
        );
      }
    }
    botsRef.current = map;
  }, []);

  const persistIfActive = useCallback(
    (nextState: GameState, nextMode: GameMode, nextSpeed: BotSpeed) => {
      const session: SavedSession = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        mode: nextMode,
        botSpeed: nextSpeed,
        state: nextState,
      };
      saveSession(session);
      setSavedSummary(session);
    },
    [],
  );

  const startNewMatch = useCallback(
    (req: NewMatchRequest) => {
      const p1 = req.player1Name.trim() || 'You';
      const p2 =
        req.mode === 'solo_bot'
          ? req.botDifficulty === 'easy'
            ? 'Computer (Easy)'
            : 'Computer'
          : req.player2Name.trim() || 'Player 2';

      const players: PlayerConfig[] = [
        { id: 'p0', name: p1, teamId: 'team-0', kind: 'human' },
        {
          id: 'p1',
          name: p2,
          teamId: 'team-1',
          kind: req.mode === 'solo_bot' ? 'bot' : 'human',
          botDifficulty: req.mode === 'solo_bot' ? req.botDifficulty : undefined,
        },
      ];

      const ruleset = createRuleset(BICYCLE_2P_CLASSIC, req.matchLength);
      const created = createMatch({
        ruleset,
        players,
        teamNames: [p1, p2],
      });

      initBotsForState(created);
      setMode(req.mode);
      setState(created);
      persistIfActive(created, req.mode, botSpeed);

      if (req.mode === 'pass_and_play') {
        const firstPlayer = created.players[created.activePlayerIndex];
        setCurtain({
          open: true,
          targetPlayerName: firstPlayer.name,
          recap: ['Hand #1 has been dealt. Ready for the first turn.'],
          manualHide: false,
        });
      } else {
        setCurtain({ open: false, targetPlayerName: '', recap: [], manualHide: false });
      }
    },
    [botSpeed, initBotsForState, persistIfActive],
  );

  const resumeSavedMatch = useCallback(() => {
    const loaded = loadSavedSession();
    if (!loaded) {
      showToast('error', 'No saved match found.');
      return;
    }
    initBotsForState(loaded.state);
    setMode(loaded.mode);
    setBotSpeed(loaded.botSpeed);
    setState(loaded.state);
    if (loaded.mode === 'pass_and_play') {
      const active = loaded.state.players[loaded.state.activePlayerIndex];
      setCurtain({
        open: true,
        targetPlayerName: active.name,
        recap: ['Resuming saved match.'],
        manualHide: false,
      });
    } else {
      setCurtain({ open: false, targetPlayerName: '', recap: [], manualHide: false });
    }
  }, [initBotsForState, showToast]);

  const discardSavedMatch = useCallback(() => {
    clearSavedSession();
    setSavedSummary(null);
  }, []);

  const exitToMenu = useCallback(() => {
    setState(null);
    setCurtain({ open: false, targetPlayerName: '', recap: [], manualHide: false });
  }, []);

  const dispatch = useCallback(
    (action: GameAction): boolean => {
      if (!state) return false;
      const prevLogLen = state.actionLog.length;
      const prevActive = state.players[state.activePlayerIndex];
      const prevTurn = state.turnNumber;

      const res = applyAction(state, action);
      if (!res.ok) {
        showToast('error', res.error);
        return false;
      }

      const next = res.state;
      setState(next);
      persistIfActive(next, mode, botSpeed);

      // Surface any newly emitted Red 3 exposure messages as a clear toast
      const newLogs = next.actionLog.slice(prevLogLen);
      const redThreeLog = newLogs.find((l) => l.kind === 'red_three');
      if (redThreeLog) {
        showToast('red_three', redThreeLog.message);
      }

      // Pass-and-Play privacy curtain when active human changes
      if (
        mode === 'pass_and_play' &&
        (next.phase === 'DRAW' || next.phase === 'MELD_OR_DISCARD')
      ) {
        const nextActive = next.players[next.activePlayerIndex];
        if (nextActive.id !== prevActive.id || action.type === 'START_NEXT_HAND') {
          const recap =
            action.type === 'START_NEXT_HAND'
              ? [`Hand #${next.handNumber} dealt.`]
              : buildTurnRecap(next.actionLog, prevTurn, prevActive.id);
          setCurtain({
            open: true,
            targetPlayerName: nextActive.name,
            recap,
            manualHide: false,
          });
        }
      }

      return true;
    },
    [botSpeed, mode, persistIfActive, showToast, state],
  );

  const revealCurtain = useCallback(() => {
    setCurtain((prev) => ({ ...prev, open: false, manualHide: false }));
  }, []);

  const toggleManualHide = useCallback(() => {
    if (!state || mode !== 'pass_and_play') return;
    const active = state.players[state.activePlayerIndex];
    setCurtain((prev) =>
      prev.open
        ? { ...prev, open: false, manualHide: false }
        : {
            open: true,
            targetPlayerName: active.name,
            recap: ['Hand hidden manually.'],
            manualHide: true,
          },
    );
  }, [mode, state]);

  // Global 'H' hotkey to quickly hide hand in Pass-and-Play mode
  useEffect(() => {
    if (!state || mode !== 'pass_and_play') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        toggleManualHide();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, state, toggleManualHide]);

  // Paced Bot Turn Runner
  useEffect(() => {
    if (!state) return;
    if (state.phase !== 'DRAW' && state.phase !== 'MELD_OR_DISCARD') return;
    const active = state.players[state.activePlayerIndex];
    if (active.kind !== 'bot') return;

    const bot = botsRef.current.get(active.id);
    if (!bot) return;

    const delay = BOT_SPEED_MS[botSpeed];
    const timer = window.setTimeout(() => {
      const botView = getPlayerView(state, active.id);
      const action = bot.chooseAction(botView);
      dispatch(action);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [botSpeed, dispatch, state]);

  const viewerId = useMemo(() => {
    if (!state) return null;
    if (mode === 'solo_bot') {
      return state.players.find((p) => p.kind === 'human')?.id ?? state.players[0].id;
    }
    return state.players[state.activePlayerIndex].id;
  }, [mode, state]);

  const view: PlayerView | null = useMemo(() => {
    if (!state || !viewerId) return null;
    return getPlayerView(state, viewerId);
  }, [state, viewerId]);

  const updateBotSpeed = useCallback(
    (nextSpeed: BotSpeed) => {
      setBotSpeed(nextSpeed);
      if (state) {
        persistIfActive(state, mode, nextSpeed);
      }
    },
    [mode, persistIfActive, state],
  );

  return {
    state,
    view,
    mode,
    botSpeed,
    setBotSpeed: updateBotSpeed,
    savedSummary,
    toast,
    dismissToast: () => setToast(null),
    curtain,
    revealCurtain,
    toggleManualHide,
    startNewMatch,
    resumeSavedMatch,
    discardSavedMatch,
    exitToMenu,
    dispatch,
  };
}
