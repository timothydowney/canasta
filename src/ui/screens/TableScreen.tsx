import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  EyeOff,
  Gauge,
  Home,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  getCardLabel,
  getCardPoints,
  inferMeldRank,
  isBlackThree,
  isWildCard,
  validateAddToMeld,
  validateMeldCards,
  type Card,
  type GameAction,
  type GameState,
  type Meld,
  type MeldDraftItem,
  type PlayerView,
} from '../../engine';
import {
  buildReplayExportJson,
  type BotSpeed,
  type GameMode,
  type PrivacyCurtainState,
  type ToastNotice,
} from '../../store';
import { ActionBar, type StagedMeldDisplay } from '../components/ActionBar';
import { ActionLog } from '../components/ActionLog';
import { CardHand } from '../components/CardHand';
import { GuardrailModal, type GuardrailPrompt } from '../components/GuardrailModal';
import { HandSummaryModal } from '../components/HandSummaryModal';
import { MeldZone } from '../components/MeldZone';
import { PlayingCard } from '../components/PlayingCard';
import { PrivacyCurtain } from '../components/PrivacyCurtain';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';
import { StockAndDiscard } from '../components/StockAndDiscard';

export interface TableScreenProps {
  state: GameState;
  view: PlayerView;
  mode: GameMode;
  botSpeed: BotSpeed;
  onChangeBotSpeed: (speed: BotSpeed) => void;
  soundMuted: boolean;
  onToggleSound: () => void;
  toast: ToastNotice | null;
  onDismissToast: () => void;
  curtain: PrivacyCurtainState;
  onRevealCurtain: () => void;
  onToggleManualHide: () => void;
  onDispatch: (action: GameAction) => boolean;
  onExitToMenu: () => void;
}

export const TableScreen: React.FC<TableScreenProps> = ({
  state,
  view,
  mode,
  botSpeed,
  onChangeBotSpeed,
  soundMuted,
  onToggleSound,
  toast,
  onDismissToast,
  curtain,
  onRevealCurtain,
  onToggleManualHide,
  onDispatch,
  onExitToMenu,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stagedMelds, setStagedMelds] = useState<StagedMeldDisplay[]>([]);
  const [takePileMode, setTakePileMode] = useState(false);
  const [takePileExtraMelds, setTakePileExtraMelds] = useState<MeldDraftItem[]>([]);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [guardrail, setGuardrail] = useState<GuardrailPrompt | null>(null);

  // Clear local UI selection/staging whenever turn, phase, or viewer changes
  useEffect(() => {
    setSelectedIds(new Set());
    setStagedMelds([]);
    setTakePileMode(false);
    setTakePileExtraMelds([]);
  }, [view.turnNumber, view.phase, view.viewerId, view.handNumber]);

  const handMap = useMemo(
    () => new Map(view.viewerHand.map((c) => [c.id, c])),
    [view.viewerHand],
  );

  const myTeam = view.teams[view.viewerTeamId === 'team-0' ? 0 : 1];
  const oppTeam = view.teams[view.viewerTeamId === 'team-0' ? 1 : 0];
  const oppPlayer = view.players.find((p) => p.teamId !== view.viewerTeamId)!;
  const viewerPlayer = view.players.find((p) => p.id === view.viewerId)!;

  const stagedCardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sm of stagedMelds) {
      for (const id of sm.submission.cardIds) ids.add(id);
    }
    for (const em of takePileExtraMelds) {
      for (const id of em.cardIds) ids.add(id);
    }
    return ids;
  }, [stagedMelds, takePileExtraMelds]);

  const selectedCards = useMemo(
    () =>
      view.viewerHand.filter(
        (c) => selectedIds.has(c.id) && !stagedCardIds.has(c.id),
      ),
    [view.viewerHand, selectedIds, stagedCardIds],
  );

  const toggleCardSelection = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const willSelect = !next.has(cardId);
      if (willSelect) next.add(cardId);
      else next.delete(cardId);
      soundEngine.playCardClick(willSelect);
      return next;
    });
  };

  // Evaluate whether currently selected cards can form a new meld
  const canStageSelectedAsNewMeld = useMemo(() => {
    if (selectedCards.length < view.ruleset.minMeldSize) {
      return { valid: false };
    }
    const rank = inferMeldRank(selectedCards);
    if (!rank) return { valid: false };

    // Prevent duplicate rank with existing team melds or already-staged melds
    const alreadyHasRank =
      myTeam.melds.some((m) => m.rank === rank) ||
      stagedMelds.some(
        (sm) => sm.submission.kind === 'new_meld' && sm.submission.rank === rank,
      ) ||
      takePileExtraMelds.some((em) => em.rank === rank);
    if (alreadyHasRank) return { valid: false };

    // In takePileMode, extra initial melds cannot match the top discard card rank
    if (takePileMode && view.discardPile.topCard?.rank === rank) {
      return { valid: false };
    }

    const remainingAfter =
      view.viewerHand.length - stagedCardIds.size - selectedCards.length;
    const check = validateMeldCards(selectedCards, rank, view.ruleset, {
      isGoingOut: remainingAfter <= 1,
    });
    if (!check.valid) return { valid: false, reason: check.reason };

    const label =
      rank === '3B'
        ? `${selectedCards.length}×Black 3`
        : `${selectedCards.length}×${rank}`;
    return { valid: true, label, rank };
  }, [
    myTeam.melds,
    selectedCards,
    stagedCardIds.size,
    stagedMelds,
    takePileExtraMelds,
    takePileMode,
    view.discardPile.topCard,
    view.ruleset,
    view.viewerHand.length,
  ]);

  // Existing melds that can accept currently selected cards (during MELD_OR_DISCARD)
  const targetableMeldIds = useMemo(() => {
    const ids = new Set<string>();
    if (
      !view.legalHints.isViewerTurn ||
      view.phase !== 'MELD_OR_DISCARD' ||
      !myTeam.hasMadeInitialMeld ||
      selectedCards.length === 0
    ) {
      return ids;
    }
    for (const meld of myTeam.melds) {
      if (validateAddToMeld(meld, selectedCards, view.ruleset).valid) {
        ids.add(meld.id);
      }
    }
    return ids;
  }, [
    myTeam.hasMadeInitialMeld,
    myTeam.melds,
    selectedCards,
    view.legalHints.isViewerTurn,
    view.phase,
    view.ruleset,
  ]);

  const matchingExistingMeldForSelection = useMemo(() => {
    if (targetableMeldIds.size === 1) {
      const onlyId = [...targetableMeldIds][0];
      return myTeam.melds.find((m) => m.id === onlyId) ?? null;
    }
    // If multiple melds match (e.g. selected a pure wild card), let user click the specific meld on the table
    return null;
  }, [myTeam.melds, targetableMeldIds]);

  // Existing meld that can accept the top discard card directly (unfrozen pickup shortcut)
  const canAddTopToExistingMeld = useMemo(() => {
    const top = view.discardPile.topCard;
    if (!top || view.discardPile.isFrozenForViewer || !myTeam.hasMadeInitialMeld) {
      return null;
    }
    return myTeam.melds.find((m) => m.rank === top.rank) ?? null;
  }, [myTeam.hasMadeInitialMeld, myTeam.melds, view.discardPile]);

  // Cards dimmed in hand during Guided Take-Discard-Pile mode (when initial meld already made)
  const dimmedIds = useMemo(() => {
    const dimmed = new Set<string>();
    if (!takePileMode || !view.discardPile.topCard) return dimmed;
    // If team still needs initial meld, allow selecting any card so they can stage extra initial melds
    if (!myTeam.hasMadeInitialMeld) return dimmed;

    const topRank = view.discardPile.topCard.rank;
    const frozen = view.discardPile.isFrozenForViewer;
    for (const card of view.viewerHand) {
      const matchesTop = card.rank === topRank;
      const usableWild = !frozen && isWildCard(card);
      if (!matchesTop && !usableWild) {
        dimmed.add(card.id);
      }
    }
    return dimmed;
  }, [myTeam.hasMadeInitialMeld, takePileMode, view.discardPile, view.viewerHand]);

  // Cards selected specifically for the top-card meld in takePileMode
  const takePileTopMeldPreviewCards = useMemo(() => {
    if (!takePileMode || !view.discardPile.topCard) return [];
    const topRank = view.discardPile.topCard.rank;
    const frozen = view.discardPile.isFrozenForViewer;
    return selectedCards.filter(
      (c) => c.rank === topRank || (!frozen && isWildCard(c)),
    );
  }, [selectedCards, takePileMode, view.discardPile]);

  const handleStageSelectedMeld = () => {
    if (!canStageSelectedAsNewMeld.valid || !canStageSelectedAsNewMeld.rank) return;
    const rank = canStageSelectedAsNewMeld.rank;
    const cardIds = selectedCards.map((c) => c.id);
    const submission: MeldDraftItem = { kind: 'new_meld', rank, cardIds };

    // If initial meld is already met and nothing else is staged, commit directly in 1 click!
    if (myTeam.hasMadeInitialMeld && stagedMelds.length === 0) {
      if (
        onDispatch({
          type: 'COMMIT_MELDS',
          playerId: view.viewerId,
          submissions: [submission],
        })
      ) {
        setSelectedIds(new Set());
      }
      return;
    }

    setStagedMelds((prev) => [
      ...prev,
      {
        submission,
        cards: selectedCards,
        points: selectedCards.reduce((s, c) => s + getCardPoints(c), 0),
        label: canStageSelectedAsNewMeld.label ?? `${cardIds.length}×${rank}`,
      },
    ]);
    setSelectedIds(new Set());
  };

  const executeAddToMeld = (meld: Meld, cardsToAdd: Card[]) => {
    const ok = onDispatch({
      type: 'COMMIT_MELDS',
      playerId: view.viewerId,
      submissions: [
        {
          kind: 'add_to_meld',
          meldId: meld.id,
          cardIds: cardsToAdd.map((c) => c.id),
        },
      ],
    });
    if (ok) {
      setSelectedIds(new Set());
    }
  };

  const handleAddToMeldWithGuardrail = (meld: Meld) => {
    if (selectedCards.length === 0) return;
    const addingWild = selectedCards.some(isWildCard);
    if (meld.canastaType === 'natural' && addingWild) {
      const cardsCopy = selectedCards.slice();
      setGuardrail({
        title: 'Downgrade Natural Canasta?',
        description: `Adding a wild card to your Natural ${meld.rank}s Canasta will downgrade it from a +${view.ruleset.naturalCanastaBonus} Natural Canasta to a +${view.ruleset.mixedCanastaBonus} Mixed Canasta (losing 200 bonus points).`,
        confirmLabel: 'Add Wild Anyway',
        onConfirm: () => executeAddToMeld(meld, cardsCopy),
      });
      return;
    }
    executeAddToMeld(meld, selectedCards);
  };

  const handleCommitStagedMelds = () => {
    if (stagedMelds.length === 0) return;
    const ok = onDispatch({
      type: 'COMMIT_MELDS',
      playerId: view.viewerId,
      submissions: stagedMelds.map((s) => s.submission),
    });
    if (ok) {
      setStagedMelds([]);
      setSelectedIds(new Set());
    }
  };

  const handleDiscardSelected = () => {
    if (selectedCards.length !== 1) return;
    const card = selectedCards[0];
    const doDiscard = () => {
      if (
        onDispatch({
          type: 'DISCARD',
          playerId: view.viewerId,
          cardId: card.id,
        })
      ) {
        setSelectedIds(new Set());
      }
    };

    if (isWildCard(card)) {
      setGuardrail({
        title: `Discard Wild Card (${getCardLabel(card)})?`,
        description: `Discarding a wild card freezes the discard pile for everyone, but spends a valuable ${getCardPoints(card)}-point wild card.`,
        confirmLabel: `Discard ${getCardLabel(card)}`,
        onConfirm: doDiscard,
      });
      return;
    }

    if (
      isBlackThree(card) &&
      (view.discardPile.count === 0 || view.discardPile.frozenByWildOrInitial)
    ) {
      setGuardrail({
        title: `Discard Black 3 (${getCardLabel(card)})?`,
        description:
          view.discardPile.count === 0
            ? 'The discard pile is currently empty — saving a Black 3 can block your opponent from taking a larger pile later.'
            : 'The discard pile is already frozen by a wild card.',
        confirmLabel: `Discard ${getCardLabel(card)}`,
        onConfirm: doDiscard,
      });
      return;
    }

    doDiscard();
  };

  const handleStageExtraInitialMeldForPickup = () => {
    if (!canStageSelectedAsNewMeld.valid || !canStageSelectedAsNewMeld.rank) return;
    setTakePileExtraMelds((prev) => [
      ...prev,
      {
        kind: 'new_meld',
        rank: canStageSelectedAsNewMeld.rank!,
        cardIds: selectedCards.map((c) => c.id),
      },
    ]);
    setSelectedIds(new Set());
  };

  const handleConfirmTakePileWithHand = () => {
    const handCardIds = takePileTopMeldPreviewCards.map((c) => c.id);
    const ok = onDispatch({
      type: 'TAKE_DISCARD_PILE',
      playerId: view.viewerId,
      topCardUsage: { kind: 'new_meld', handCardIds },
      additionalInitialMelds:
        takePileExtraMelds.length > 0 ? takePileExtraMelds : undefined,
    });
    if (ok) {
      setTakePileMode(false);
      setTakePileExtraMelds([]);
      setSelectedIds(new Set());
    }
  };

  const handleExportReplay = () => {
    const json = buildReplayExportJson(state);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `canasta-hand-${state.handNumber}-replay.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cycleBotSpeed = () => {
    const order: BotSpeed[] = ['slow', 'normal', 'fast'];
    const next = order[(order.indexOf(botSpeed) + 1) % order.length];
    onChangeBotSpeed(next);
  };

  const possessive = (name: string) =>
    name === 'You' ? 'Your' : name.endsWith('s') ? `${name}'` : `${name}'s`;

  const newCardIds = useMemo(
    () => new Set(view.newlyAcquiredCardIds),
    [view.newlyAcquiredCardIds],
  );

  // Hide hand contents completely while Pass-and-Play privacy curtain is mounted
  const handHidden = curtain.open;
  const oppBackCount = Math.min(oppPlayer.handCount, 12);

  return (
    <div className="flex h-dvh w-full flex-col casino-felt overflow-hidden">
      {/* Top Wooden Casino Rail Bar */}
      <header className="felt-rail flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 sm:px-5 py-2 shadow-md">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-black tracking-tight text-amber-300">
            CANASTA
          </span>
          <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
            <Sparkles className="h-3 w-3" /> {view.ruleset.name} • Hand #{view.handNumber}
          </span>
        </div>

        {/* Live Match Score Pill */}
        <div className="flex items-center gap-2 rounded-full border border-amber-300/25 bg-black/45 px-3 py-1 text-xs">
          <span className="font-semibold text-emerald-200">
            {myTeam.name}:{' '}
            <strong className="text-white">
              {myTeam.cumulativeScore.toLocaleString()}
            </strong>
          </span>
          <span className="text-emerald-500/70">|</span>
          <span className="font-semibold text-emerald-200">
            {oppTeam.name}:{' '}
            <strong className="text-white">
              {oppTeam.cumulativeScore.toLocaleString()}
            </strong>
          </span>
          {view.ruleset.winScore && (
            <span className="hidden sm:inline text-[10px] text-amber-200/70">
              / {view.ruleset.winScore.toLocaleString()}
            </span>
          )}
        </div>

        {/* Utility Buttons */}
        <div className="flex items-center gap-1.5">
          {mode === 'solo_bot' && (
            <button
              type="button"
              onClick={cycleBotSpeed}
              title="Adjust Computer turn speed"
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
            >
              <Gauge className="h-3.5 w-3.5 text-amber-300" />
              <span className="hidden sm:inline capitalize">{botSpeed}</span>
            </button>
          )}

          {mode === 'pass_and_play' && (
            <button
              type="button"
              onClick={onToggleManualHide}
              title="Hide hand (Shortcut: H)"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-400/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Hide (H)</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleSound}
            title={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            {soundMuted ? (
              <VolumeX className="h-3.5 w-3.5 text-rose-300" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-amber-300" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playUiClick();
              setRulesDrawerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/35 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Rules &amp; Scoring
          </button>

          <button
            type="button"
            onClick={handleExportReplay}
            title="Export Hand Replay JSON"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onExitToMenu}
            title="Main Menu (match auto-saved)"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Floating Announcement Popup (always visible right above your hand regardless of scroll) */}
      {toast && (
        <div
          key={toast.id}
          className="toast-float-in pointer-events-none fixed bottom-36 sm:bottom-44 left-1/2 z-40 w-max max-w-[92vw] px-2"
        >
          <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-xs sm:text-sm font-bold shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-md ${
              toast.kind === 'error'
                ? 'border-rose-400/75 bg-rose-950/95 text-rose-100'
                : toast.kind === 'red_three'
                  ? 'border-rose-300/75 bg-rose-900/95 text-amber-100'
                  : 'border-amber-300/70 bg-[#10261b]/95 text-amber-200'
            }`}
          >
            <span className="leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={onDismissToast}
              aria-label="Dismiss announcement"
              className="shrink-0 rounded-full p-1 hover:bg-white/15 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main 3-Band Felt Layout */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-between gap-1.5 overflow-y-auto px-3 sm:px-5 py-1.5">
        {/* Band 1: Opponent Info + Opponent Melds */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
          <div className="lg:col-span-4 flex items-center gap-3 rounded-xl border border-emerald-200/15 bg-black/20 px-3 py-2">
            <div className="flex items-center">
              {Array.from({ length: oppBackCount }).map((_, idx) => (
                <div key={idx} className={idx === 0 ? '' : '-ml-7'}>
                  <PlayingCard faceDown backColor="red" size="xs" />
                </div>
              ))}
              {oppBackCount === 0 && (
                <span className="text-xs italic text-emerald-200/60">0 cards</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-white">
                  {oppPlayer.name}
                </span>
                {oppPlayer.isActive && (
                  <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-stone-950">
                    TURN
                  </span>
                )}
              </div>
              <div className="text-xs text-emerald-200/80">
                {oppPlayer.handCount} card{oppPlayer.handCount === 1 ? '' : 's'} in hand
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <MeldZone
              title={`${possessive(oppTeam.name)} Melds`}
              melds={oppTeam.melds}
              redThrees={oppTeam.redThrees}
              hasMadeInitialMeld={oppTeam.hasMadeInitialMeld}
              compact
            />
          </div>
        </section>

        {/* Band 2: Center Stock & Discard + Action Log */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center py-1">
          <div className="lg:col-span-7 flex justify-center">
            <StockAndDiscard
              stockCount={view.stockCount}
              drawCount={view.ruleset.drawCount}
              discardPile={view.discardPile}
              canDrawStock={view.legalHints.canDrawStock && !takePileMode}
              canTakeDiscardPile={view.legalHints.canTakeDiscardPile}
              mustTakeDiscardPile={view.legalHints.mustTakeDiscardPile}
              takePileModeActive={takePileMode}
              onDrawStock={() =>
                onDispatch({ type: 'DRAW_STOCK', playerId: view.viewerId })
              }
              onClickDiscardPile={() => {
                setSelectedIds(new Set());
                setTakePileExtraMelds([]);
                setTakePileMode(true);
              }}
            />
          </div>
          <div className="lg:col-span-5">
            <ActionLog entries={view.actionLog} />
          </div>
        </section>

        {/* Band 3: Player Melds + Contextual Action Bar + Adaptive Hand */}
        <section className="flex flex-col gap-2">
          <MeldZone
            title={`${possessive(viewerPlayer.name)} Melds`}
            melds={myTeam.melds}
            redThrees={myTeam.redThrees}
            hasMadeInitialMeld={myTeam.hasMadeInitialMeld}
            targetableMeldIds={targetableMeldIds}
            onSelectMeld={handleAddToMeldWithGuardrail}
          />

          <ActionBar
            view={view}
            selectedCards={selectedCards}
            stagedMelds={stagedMelds}
            takePileMode={takePileMode}
            takePileExtraMelds={takePileExtraMelds}
            takePileTopMeldPreviewCards={takePileTopMeldPreviewCards}
            canAddTopToExistingMeld={canAddTopToExistingMeld}
            canStageSelectedAsNewMeld={canStageSelectedAsNewMeld}
            matchingExistingMeldForSelection={matchingExistingMeldForSelection}
            onDrawStock={() =>
              onDispatch({ type: 'DRAW_STOCK', playerId: view.viewerId })
            }
            onStartTakePile={() => {
              setSelectedIds(new Set());
              setTakePileExtraMelds([]);
              setTakePileMode(true);
            }}
            onCancelTakePile={() => {
              setTakePileMode(false);
              setTakePileExtraMelds([]);
              setSelectedIds(new Set());
            }}
            onConfirmTakePileAddExisting={(meld) => {
              if (
                onDispatch({
                  type: 'TAKE_DISCARD_PILE',
                  playerId: view.viewerId,
                  topCardUsage: { kind: 'add_to_meld', meldId: meld.id },
                })
              ) {
                setTakePileMode(false);
                setSelectedIds(new Set());
              }
            }}
            onStageExtraInitialMeldForPickup={handleStageExtraInitialMeldForPickup}
            onConfirmTakePileWithHand={handleConfirmTakePileWithHand}
            onPassExhaustedStock={() =>
              onDispatch({ type: 'PASS_EXHAUSTED_STOCK', playerId: view.viewerId })
            }
            onStageSelectedMeld={handleStageSelectedMeld}
            onStageAddToMeld={handleAddToMeldWithGuardrail}
            onCommitStagedMelds={handleCommitStagedMelds}
            onClearStaged={() => setStagedMelds([])}
            onUndoTurnMelds={() =>
              onDispatch({ type: 'UNDO_TURN_MELDS', playerId: view.viewerId })
            }
            onDiscardSelected={handleDiscardSelected}
            onClearSelection={() => setSelectedIds(new Set())}
          />

          {!handHidden && (
            <CardHand
              cards={view.viewerHand}
              selectedIds={selectedIds}
              stagedIds={stagedCardIds}
              newCardIds={newCardIds}
              dimmedIds={dimmedIds}
              disabled={
                !view.legalHints.isViewerTurn ||
                (view.phase === 'DRAW' && !takePileMode)
              }
              onToggleCard={(cardId) => {
                if (handMap.has(cardId)) toggleCardSelection(cardId);
              }}
            />
          )}
        </section>
      </main>

      {/* Modals & Overlays */}
      <RulesScoringDrawer
        open={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        ruleset={view.ruleset}
        teams={view.teams}
        viewerTeamId={view.viewerTeamId}
      />

      <GuardrailModal prompt={guardrail} onCancel={() => setGuardrail(null)} />

      <HandSummaryModal
        summary={
          view.phase === 'HAND_OVER' || view.phase === 'MATCH_OVER'
            ? view.lastHandSummary
            : null
        }
        teams={view.teams}
        isMatchOver={view.phase === 'MATCH_OVER'}
        winnerTeamId={view.winnerTeamId}
        winScore={view.ruleset.winScore}
        onNextHand={() => onDispatch({ type: 'START_NEXT_HAND' })}
        onExitToMenu={onExitToMenu}
        onExportReplay={handleExportReplay}
      />

      <PrivacyCurtain curtain={curtain} onReveal={onRevealCurtain} />
    </div>
  );
};
