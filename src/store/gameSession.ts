import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HeuristicBotController } from '../ai';
import {
  applyAction,
  createMatch,
  createRuleset,
  getPlayerView,
  getRulesetById,
  getTeamIndex,
  type GameAction,
  type GameState,
  type MatchLengthPreset,
  type PlayerConfig,
  type PlayerView,
  type RulesetId,
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
import { soundEngine } from '../ui/audio/soundEngine';

export interface NewMatchRequest {
  rulesetId: RulesetId;
  matchLength: MatchLengthPreset;
  players: PlayerConfig[];
  teamNames?: string[];
}

export interface ToastNotice {
  id: number;
  kind: 'info' | 'red_three' | 'error';
  message: string;
}

export interface PrivacyCurtainState {
  open: boolean;
  targetPlayerName: string;
  subtitle?: string;
  recap: string[];
  manualHide: boolean;
}

export function useCanastaSession() {
  const [savedSummary, setSavedSummary] = useState<SavedSession | null>(() =>
    loadSavedSession(),
  );
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<GameMode>('solo_bots');
  const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal');
  const [soundMuted, setSoundMuted] = useState<boolean>(() =>
    soundEngine.isMuted(),
  );
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [curtain, setCurtain] = useState<PrivacyCurtainState>({
    open: false,
    targetPlayerName: '',
    recap: [],
    manualHide: false,
  });

  const botsRef = useRef<Map<string, HeuristicBotController>>(new Map());
  const toastSeqRef = useRef(1);
  const lastHumanViewerRef = useRef<string | null>(null);
  const lastHumanLogIdRef = useRef<number>(0);

  const showToast = useCallback(
    (kind: ToastNotice['kind'], message: string) => {
      const id = toastSeqRef.current++;
      setToast({ id, kind, message });
    },
    [],
  );

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
        schemaVersion: 2,
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
      const baseRuleset = getRulesetById(req.rulesetId);
      const ruleset = createRuleset(baseRuleset, req.matchLength);
      const created = createMatch({
        ruleset,
        players: req.players,
        teamNames: req.teamNames,
      });

      const humanCount = created.players.filter((p) => p.kind === 'human').length;
      const nextMode: GameMode = humanCount >= 2 ? 'pass_and_play' : 'solo_bots';

      initBotsForState(created);
      setMode(nextMode);
      setState(created);
      persistIfActive(created, nextMode, botSpeed);
      soundEngine.playDeal();

      const firstHuman =
        created.players[created.activePlayerIndex].kind === 'human'
          ? created.players[created.activePlayerIndex]
          : created.players.find((p) => p.kind === 'human') ?? created.players[0];

      lastHumanViewerRef.current = firstHuman.id;
      lastHumanLogIdRef.current = created.nextLogId - 1;

      if (nextMode === 'pass_and_play') {
        const active = created.players[created.activePlayerIndex];
        if (active.kind === 'human') {
          setCurtain({
            open: true,
            targetPlayerName: active.name,
            recap: [`Hand #1 (${ruleset.shortName}) dealt. Ready for the first turn.`],
            manualHide: false,
          });
        } else {
          // Bot plays first; hands stay hidden until a human turn arrives
          setCurtain({ open: false, targetPlayerName: '', recap: [], manualHide: false });
        }
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
    lastHumanLogIdRef.current = loaded.state.nextLogId - 1;

    if (loaded.mode === 'pass_and_play') {
      const active = loaded.state.players[loaded.state.activePlayerIndex];
      if (active.kind === 'human') {
        lastHumanViewerRef.current = active.id;
        setCurtain({
          open: true,
          targetPlayerName: active.name,
          recap: ['Resuming saved match.'],
          manualHide: false,
        });
      } else {
        setCurtain({ open: false, targetPlayerName: '', recap: [], manualHide: false });
      }
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

      const res = applyAction(state, action);
      if (!res.ok) {
        soundEngine.playError();
        showToast('error', res.error);
        return false;
      }

      const next = res.state;
      setState(next);
      persistIfActive(next, mode, botSpeed);

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

      if (next.phase === 'HAND_OVER' || next.phase === 'MATCH_OVER') {
        soundEngine.playHandEnd();
      } else if (action.type === 'START_NEXT_HAND') {
        soundEngine.playDeal();
      } else if (
        action.type === 'ASK_PARTNER_GO_OUT' ||
        action.type === 'ANSWER_PARTNER_GO_OUT'
      ) {
        soundEngine.playUiClick();
      } else if (nextCanastas > prevCanastas) {
        soundEngine.playCanasta();
      } else if (action.type === 'TAKE_DISCARD_PILE') {
        soundEngine.playTakePile();
      } else if (action.type === 'COMMIT_MELDS') {
        soundEngine.playMeld();
      } else if (action.type === 'UNDO_TURN_MELDS') {
        soundEngine.playUndo();
      } else if (action.type === 'DISCARD') {
        const frozeNow =
          !state.discardPile.frozenByWildOrInitial &&
          next.discardPile.frozenByWildOrInitial;
        soundEngine.playDiscard(frozeNow);
      } else if (action.type === 'DRAW_STOCK') {
        if (redThreeLog) soundEngine.playRedThree();
        else soundEngine.playDraw();
      }

      // Floating announcements right above the hand
      const actorIsBot = prevActive.kind === 'bot';
      if (redThreeLog) {
        showToast('red_three', redThreeLog.message);
      } else if (partnerLog) {
        showToast('info', partnerLog.message);
      } else if (nextCanastas > prevCanastas) {
        const meldLog = newLogs.find((l) => l.kind === 'meld' || l.kind === 'take_pile');
        if (meldLog) showToast('info', meldLog.message);
      } else if (actorIsBot && action.type === 'TAKE_DISCARD_PILE') {
        const takeLog = newLogs.find((l) => l.kind === 'take_pile');
        if (takeLog) showToast('info', takeLog.message);
      } else if (
        actorIsBot &&
        action.type === 'DISCARD' &&
        !state.discardPile.frozenByWildOrInitial &&
        next.discardPile.frozenByWildOrInitial
      ) {
        const discLog = newLogs.find((l) => l.kind === 'discard');
        if (discLog) showToast('info', discLog.message);
      } else if (
        actorIsBot &&
        action.type === 'COMMIT_MELDS' &&
        !state.teams[getTeamIndex(state.teams, prevActive.teamId)].hasMadeInitialMeld
      ) {
        const meldLog = newLogs.find((l) => l.kind === 'meld');
        if (meldLog) showToast('info', meldLog.message);
      }

      // Multi-Human Pass-and-Play Privacy Shield triggers
      if (
        mode === 'pass_and_play' &&
        (next.phase === 'DRAW' || next.phase === 'MELD_OR_DISCARD')
      ) {
        // Case 1: Human asked human partner -> hand over laptop to partner to see their hand & answer
        if (next.partnerGoOut?.status === 'PENDING') {
          const partner = next.players.find(
            (p) => p.id === next.partnerGoOut!.partnerPlayerId,
          );
          const asker = next.players.find(
            (p) => p.id === next.partnerGoOut!.askedByPlayerId,
          );
          if (partner && partner.kind === 'human' && partner.id !== lastHumanViewerRef.current) {
            const recap = buildTurnRecap(next.actionLog, lastHumanLogIdRef.current);
            lastHumanViewerRef.current = partner.id;
            lastHumanLogIdRef.current = next.nextLogId - 1;
            setCurtain({
              open: true,
              targetPlayerName: partner.name,
              subtitle: `${asker?.name ?? 'Your partner'} asks: "Partner, may I go out?"`,
              recap,
              manualHide: false,
            });
            return true;
          }
        }

        // Case 2: Partner just answered -> hand laptop back to active human player
        if (
          action.type === 'ANSWER_PARTNER_GO_OUT' &&
          next.players[next.activePlayerIndex].kind === 'human'
        ) {
          const activeHuman = next.players[next.activePlayerIndex];
          if (activeHuman.id !== lastHumanViewerRef.current) {
            const recap = buildTurnRecap(next.actionLog, lastHumanLogIdRef.current);
            lastHumanViewerRef.current = activeHuman.id;
            lastHumanLogIdRef.current = next.nextLogId - 1;
            setCurtain({
              open: true,
              targetPlayerName: activeHuman.name,
              subtitle: 'Your partner answered your go-out request.',
              recap,
              manualHide: false,
            });
            return true;
          }
        }

        // Case 3: Active turn moved to a different human player (or new hand started)
        const nextActive = next.players[next.activePlayerIndex];
        if (
          nextActive.kind === 'human' &&
          (nextActive.id !== lastHumanViewerRef.current ||
            action.type === 'START_NEXT_HAND')
        ) {
          const recap =
            action.type === 'START_NEXT_HAND'
              ? [`Hand #${next.handNumber} dealt.`]
              : buildTurnRecap(next.actionLog, lastHumanLogIdRef.current);
          lastHumanViewerRef.current = nextActive.id;
          lastHumanLogIdRef.current = next.nextLogId - 1;
          setCurtain({
            open: true,
            targetPlayerName: nextActive.name,
            recap,
            manualHide: false,
          });
        } else if (prevActive.kind === 'human' && nextActive.kind === 'bot') {
          // Record log point right after human ended turn so next human sees all bot moves
          lastHumanLogIdRef.current = next.nextLogId - 1;
        }
      }

      return true;
    },
    [botSpeed, mode, persistIfActive, showToast, state],
  );

  const revealCurtain = useCallback(() => {
    soundEngine.playUiClick();
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

  // Paced Bot Turn & Bot Partner-Answer Runner
  useEffect(() => {
    if (!state) return;
    if (state.phase !== 'DRAW' && state.phase !== 'MELD_OR_DISCARD') return;

    // Determine if a bot needs to act right now (either answering a partner prompt or taking its turn)
    let botActorId: string | null = null;
    if (state.partnerGoOut?.status === 'PENDING') {
      const partner = state.players.find(
        (p) => p.id === state.partnerGoOut!.partnerPlayerId,
      );
      if (partner?.kind === 'bot') {
        botActorId = partner.id;
      }
    } else {
      const active = state.players[state.activePlayerIndex];
      if (active.kind === 'bot') {
        botActorId = active.id;
      }
    }

    if (!botActorId) return;
    const bot = botsRef.current.get(botActorId);
    if (!bot) return;

    const delay = BOT_SPEED_MS[botSpeed];
    const timer = window.setTimeout(() => {
      const botView = getPlayerView(state, botActorId!);
      const action = bot.chooseAction(botView);
      dispatch(action);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [botSpeed, dispatch, state]);

  const viewerId = useMemo(() => {
    if (!state) return null;
    // If a human partner must answer a pending go-out request, render from their perspective!
    if (state.partnerGoOut?.status === 'PENDING') {
      const partner = state.players.find(
        (p) => p.id === state.partnerGoOut!.partnerPlayerId,
      );
      if (partner?.kind === 'human') return partner.id;
    }
    if (mode === 'solo_bots') {
      return state.players.find((p) => p.kind === 'human')?.id ?? state.players[0].id;
    }
    const active = state.players[state.activePlayerIndex];
    if (active.kind === 'human') return active.id;
    return (
      lastHumanViewerRef.current ??
      state.players.find((p) => p.kind === 'human')?.id ??
      state.players[0].id
    );
  }, [mode, state]);

  // In multi-human Pass-and-Play, also mask the hand while a bot plays between humans
  const hideHandForBotInterlude = useMemo(() => {
    if (!state || mode !== 'pass_and_play') return false;
    if (state.partnerGoOut?.status === 'PENDING') {
      const partner = state.players.find(
        (p) => p.id === state.partnerGoOut!.partnerPlayerId,
      );
      return partner?.kind !== 'human';
    }
    return (
      (state.phase === 'DRAW' || state.phase === 'MELD_OR_DISCARD') &&
      state.players[state.activePlayerIndex].kind === 'bot'
    );
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

  const toggleSoundMuted = useCallback(() => {
    const next = !soundEngine.isMuted();
    soundEngine.setMuted(next);
    setSoundMuted(next);
    if (!next) {
      soundEngine.playUiClick();
    }
  }, []);

  return {
    state,
    view,
    mode,
    botSpeed,
    setBotSpeed: updateBotSpeed,
    soundMuted,
    toggleSoundMuted,
    savedSummary,
    toast,
    dismissToast: () => setToast(null),
    curtain,
    hideHandForBotInterlude,
    revealCurtain,
    toggleManualHide,
    startNewMatch,
    resumeSavedMatch,
    discardSavedMatch,
    exitToMenu,
    dispatch,
  };
}
