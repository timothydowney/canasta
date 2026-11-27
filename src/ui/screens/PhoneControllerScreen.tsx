import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Hand,
  HelpCircle,
  Layers,
  LayoutGrid,
  LogOut,
  Maximize2,
  Minimize2,
  Monitor,
  PlusCircle,
  RotateCcw,
  Send,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getCardLabel,
  getCardPoints,
  getTeamById,
  inferMeldRank,
  isBlackThree,
  isWildCard,
  validateAddToMeld,
  validateMeldCards,
  type Card,
  type GameAction,
  type Meld,
  type MeldDraftItem,
  type PlayerView,
  type TeamId,
} from '../../engine';
import type { RoomLobbyState } from '../../shared/protocol';
import type { ToastNotice } from '../../store';
import { soundEngine } from '../audio/soundEngine';
import { type StagedMeldDisplay } from '../components/ActionBar';
import { ActionLog } from '../components/ActionLog';
import { GuardrailModal, type GuardrailPrompt } from '../components/GuardrailModal';
import { HandSummaryModal } from '../components/HandSummaryModal';
import { MeldZone } from '../components/MeldZone';
import { MobileCardHand } from '../components/MobileCardHand';
import { PartnerPromptModal } from '../components/PartnerPromptModal';
import { PlayingCard } from '../components/PlayingCard';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';
import { StockAndDiscard } from '../components/StockAndDiscard';
import { useFullscreen } from '../hooks/useFullscreen';

export interface PhoneControllerScreenProps {
  lobby: RoomLobbyState;
  view: PlayerView;
  soundMuted: boolean;
  onToggleSound: () => void;
  toast: ToastNotice | null;
  onDismissToast: () => void;
  onDispatch: (action: GameAction) => boolean;
  onSwitchToFullTable: () => void;
  onLeaveRoom: () => void;
}

type MobileTab = 'hand' | 'table' | 'melds';

/**
 * Purpose-built 3-Tab Mobile Phone Controller:
 *  - Tab 1 (Hand): Rank-grouped touch-first hand canvas + single-row thumb action dock
 *  - Tab 2 (Table): Full-size Stock & Discard Pile + Turn Order seats + Live Log
 *  - Tab 3 (Melds): Selectable Team / Player Meld Inspector (with direct tap-to-add)
 */
export const PhoneControllerScreen: React.FC<PhoneControllerScreenProps> = ({
  lobby,
  view,
  soundMuted,
  onToggleSound,
  toast,
  onDismissToast,
  onDispatch,
  onSwitchToFullTable,
  onLeaveRoom,
}) => {
  const [tab, setTab] = useState<MobileTab>('hand');
  const [selectedMeldTeamId, setSelectedMeldTeamId] = useState<TeamId>(
    view.viewerTeamId,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stagedMelds, setStagedMelds] = useState<StagedMeldDisplay[]>([]);
  const [takePileMode, setTakePileMode] = useState(false);
  const [takePileExtraMelds, setTakePileExtraMelds] = useState<MeldDraftItem[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [guardrail, setGuardrail] = useState<GuardrailPrompt | null>(null);

  const fullscreen = useFullscreen();

  useEffect(() => {
    setSelectedIds(new Set());
    setStagedMelds([]);
    setTakePileMode(false);
    setTakePileExtraMelds([]);
  }, [view.turnNumber, view.phase, view.handNumber]);

  const myTeam = getTeamById(view.teams, view.viewerTeamId);
  const inspectedTeam =
    view.teams.find((t) => t.id === selectedMeldTeamId) ?? myTeam;
  const viewerPlayer = view.players.find((p) => p.id === view.viewerId)!;
  const activePlayer = view.players.find((p) => p.id === view.activePlayerId);
  const handMap = useMemo(
    () => new Map(view.viewerHand.map((c) => [c.id, c])),
    [view.viewerHand],
  );
  const newCardIds = useMemo(
    () => new Set(view.newlyAcquiredCardIds),
    [view.newlyAcquiredCardIds],
  );

  const stagedCardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const sm of stagedMelds) for (const id of sm.submission.cardIds) ids.add(id);
    for (const em of takePileExtraMelds) for (const id of em.cardIds) ids.add(id);
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
      if (!soundMuted) soundEngine.playCardClick(willSelect);
      return next;
    });
  };

  const canStageSelectedAsNewMeld = useMemo(() => {
    if (selectedCards.length < view.ruleset.minMeldSize) return { valid: false };
    const rank = inferMeldRank(selectedCards);
    if (!rank) return { valid: false };
    const alreadyHasRank =
      myTeam.melds.some((m) => m.rank === rank) ||
      stagedMelds.some(
        (sm) => sm.submission.kind === 'new_meld' && sm.submission.rank === rank,
      ) ||
      takePileExtraMelds.some((em) => em.rank === rank);
    if (alreadyHasRank) return { valid: false };
    if (takePileMode && view.discardPile.topCard?.rank === rank) return { valid: false };

    const remainingAfter =
      view.viewerHand.length - stagedCardIds.size - selectedCards.length;
    const check = validateMeldCards(selectedCards, rank, view.ruleset, {
      isGoingOut: remainingAfter <= 1,
    });
    if (!check.valid) return { valid: false, reason: check.reason };
    const label =
      rank === '3B' ? `${selectedCards.length}×3B` : `${selectedCards.length}×${rank}`;
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
      if (validateAddToMeld(meld, selectedCards, view.ruleset).valid) ids.add(meld.id);
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

  const matchingSingleMeld = useMemo(() => {
    if (targetableMeldIds.size === 1) {
      const onlyId = [...targetableMeldIds][0];
      return myTeam.melds.find((m) => m.id === onlyId) ?? null;
    }
    return null;
  }, [myTeam.melds, targetableMeldIds]);

  const canAddTopToExistingMeld = useMemo(() => {
    const top = view.discardPile.topCard;
    if (!top || view.discardPile.isFrozenForViewer || !myTeam.hasMadeInitialMeld) return null;
    return myTeam.melds.find((m) => m.rank === top.rank) ?? null;
  }, [myTeam.hasMadeInitialMeld, myTeam.melds, view.discardPile]);

  const takePileTopMeldPreviewCards = useMemo(() => {
    if (!takePileMode || !view.discardPile.topCard) return [];
    const topRank = view.discardPile.topCard.rank;
    const frozen = view.discardPile.isFrozenForViewer;
    return selectedCards.filter((c) => c.rank === topRank || (!frozen && isWildCard(c)));
  }, [selectedCards, takePileMode, view.discardPile]);

  const dimmedIds = useMemo(() => {
    const dimmed = new Set<string>();
    if (!takePileMode || !view.discardPile.topCard || !myTeam.hasMadeInitialMeld) return dimmed;
    const topRank = view.discardPile.topCard.rank;
    const frozen = view.discardPile.isFrozenForViewer;
    for (const card of view.viewerHand) {
      if (card.rank !== topRank && (frozen || !isWildCard(card))) dimmed.add(card.id);
    }
    return dimmed;
  }, [myTeam.hasMadeInitialMeld, takePileMode, view.discardPile, view.viewerHand]);

  const startGuidedTakePile = () => {
    setSelectedIds(new Set());
    setTakePileExtraMelds([]);
    setTakePileMode(true);
    setTab('hand');
  };

  const handleStageSelectedMeld = () => {
    if (!canStageSelectedAsNewMeld.valid || !canStageSelectedAsNewMeld.rank) return;
    const rank = canStageSelectedAsNewMeld.rank;
    const submission: MeldDraftItem = {
      kind: 'new_meld',
      rank,
      cardIds: selectedCards.map((c) => c.id),
    };
    if (myTeam.hasMadeInitialMeld && stagedMelds.length === 0) {
      onDispatch({
        type: 'COMMIT_MELDS',
        playerId: view.viewerId,
        submissions: [submission],
      });
      setSelectedIds(new Set());
      return;
    }
    setStagedMelds((prev) => [
      ...prev,
      {
        submission,
        cards: selectedCards,
        points: selectedCards.reduce((s, c) => s + getCardPoints(c), 0),
        label: canStageSelectedAsNewMeld.label ?? `${selectedCards.length}×${rank}`,
      },
    ]);
    setSelectedIds(new Set());
  };

  const executeAddToMeld = (meld: Meld, cardsToAdd: Card[]) => {
    onDispatch({
      type: 'COMMIT_MELDS',
      playerId: view.viewerId,
      submissions: [
        { kind: 'add_to_meld', meldId: meld.id, cardIds: cardsToAdd.map((c) => c.id) },
      ],
    });
    setSelectedIds(new Set());
  };

  const handleAddToMeldWithGuardrail = (meld: Meld) => {
    if (selectedCards.length === 0) return;
    if (meld.canastaType === 'natural' && selectedCards.some(isWildCard)) {
      const copy = selectedCards.slice();
      setGuardrail({
        title: 'Downgrade Natural Canasta?',
        description: `Adding a wild card downgrades your Natural ${meld.rank}s Canasta (+500 → +300).`,
        confirmLabel: 'Add Wild Anyway',
        onConfirm: () => executeAddToMeld(meld, copy),
      });
      return;
    }
    executeAddToMeld(meld, selectedCards);
  };

  const handleDiscardSelected = () => {
    if (selectedCards.length !== 1) return;
    const card = selectedCards[0];
    const doDiscard = () => {
      onDispatch({ type: 'DISCARD', playerId: view.viewerId, cardId: card.id });
      setSelectedIds(new Set());
    };
    if (isWildCard(card)) {
      setGuardrail({
        title: `Discard Wild (${getCardLabel(card)})?`,
        description: `Freezes the discard pile and spends a ${getCardPoints(card)}-point wild card.`,
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
        description: 'The discard pile is empty or already frozen.',
        confirmLabel: `Discard ${getCardLabel(card)}`,
        onConfirm: doDiscard,
      });
      return;
    }
    doDiscard();
  };

  const totalTableMelds = view.teams.reduce((s, t) => s + t.melds.length, 0);
  const partnerAskerName = view.partnerGoOut
    ? view.players.find((p) => p.id === view.partnerGoOut!.askedByPlayerId)?.name ?? 'Partner'
    : 'Partner';

  // Compute Guided Take-Pile totals
  const topCard = view.discardPile.topCard;
  const takePileExtraPts = takePileExtraMelds.reduce(
    (sum, m) => sum + m.cardIds.reduce((s, id) => s + getCardPoints(handMap.get(id)!), 0),
    0,
  );
  const takePileTotalPts =
    (topCard ? getCardPoints(topCard) : 0) +
    takePileTopMeldPreviewCards.reduce((s, c) => s + getCardPoints(c), 0) +
    takePileExtraPts;
  const needsInitial = !view.legalHints.viewerTeamHasInitialMeld;
  const requiredInitial = view.legalHints.initialMeldRequired;
  const takePileTopValid =
    Boolean(topCard) &&
    takePileTopMeldPreviewCards.length >= 2 &&
    (view.discardPile.isFrozenForViewer
      ? takePileTopMeldPreviewCards.filter((c) => c.rank === topCard!.rank).length >= 2
      : takePileTopMeldPreviewCards.filter((c) => c.rank === topCard!.rank).length >= 1);
  const takePileMeetsInitial = !needsInitial || takePileTotalPts >= requiredInitial;

  const stagedPoints = stagedMelds.reduce((s, m) => s + m.points, 0);
  const stagedMeetsInitial = !needsInitial || stagedPoints >= requiredInitial;

  return (
    <div className="flex h-dvh w-full flex-col casino-felt overflow-hidden">
      {/* Ultra-Slim Mobile Top Rail */}
      <header className="felt-rail flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
              view.legalHints.isViewerTurn
                ? 'bg-amber-400 text-stone-950 shadow'
                : 'bg-black/45 text-emerald-200/80 border border-white/10'
            }`}
          >
            {view.legalHints.isViewerTurn
              ? view.phase === 'DRAW'
                ? 'Your Turn • Draw'
                : 'Your Turn'
              : `${activePlayer?.name ?? 'Waiting'}`}
          </span>
          <span className="truncate text-xs font-bold text-white">
            {viewerPlayer.name}{' '}
            <span className="font-normal text-emerald-200/75">
              ({myTeam.cumulativeScore})
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          {fullscreen.isSupported && (
            <button
              type="button"
              onClick={() => void fullscreen.toggleFullscreen()}
              title={fullscreen.isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="rounded-lg border border-amber-300/35 bg-amber-400/15 p-1.5 text-amber-200 hover:bg-amber-400/25 cursor-pointer"
            >
              {fullscreen.isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleSound}
            title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
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
            onClick={() => setRulesOpen(true)}
            title="Rules & Scoring"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-amber-200 hover:bg-white/10 cursor-pointer"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSwitchToFullTable}
            title="Switch to Full Desktop Table"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            title="Leave Room"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Floating Announcement Toast */}
      {toast && (
        <div
          key={toast.id}
          className="toast-float-in pointer-events-none fixed top-12 left-1/2 z-40 w-[92vw] max-w-md"
        >
          <div
            className={`pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-md ${
              toast.kind === 'error'
                ? 'border-rose-400/75 bg-rose-950/95 text-rose-100'
                : toast.kind === 'red_three'
                  ? 'border-rose-300/75 bg-rose-900/95 text-amber-100'
                  : 'border-amber-300/70 bg-[#10261b]/95 text-amber-200'
            }`}
          >
            <span>{toast.message}</span>
            <button type="button" onClick={onDismissToast} className="p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: HAND VIEW (Focused card canvas + clean thumb dock) */}
      {tab === 'hand' && (
        <>
          <main className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col justify-between gap-2">
            {/* Guided Take-Discard-Pile Banner (only mounted when claiming pile) */}
            {takePileMode && topCard && (
              <div className="rounded-2xl border border-amber-400/60 bg-[#133522] p-3 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <PlayingCard card={topCard} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold text-amber-300">
                      Taking Discard ({view.discardPile.count} cards)
                    </div>
                    <div className="text-[11px] text-emerald-100/90 leading-snug">
                      {view.discardPile.isFrozenForViewer
                        ? `Frozen: tap 2 natural ${topCard.rank}s in hand.`
                        : canAddTopToExistingMeld
                          ? `Add ${getCardLabel(topCard)} to your ${topCard.rank}s, or tap matches.`
                          : `Tap matching ${topCard.rank}s (or 1 + wild) in hand.`}
                    </div>
                    {needsInitial && (
                      <div
                        className={`mt-0.5 text-[11px] font-bold ${
                          takePileMeetsInitial ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        Initial Meld: {takePileTotalPts} / {requiredInitial} pts{' '}
                        {takePileMeetsInitial ? '✓' : ''}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTakePileMode(false);
                      setTakePileExtraMelds([]);
                      setSelectedIds(new Set());
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-emerald-100 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {canAddTopToExistingMeld && !view.discardPile.isFrozenForViewer && (
                    <button
                      type="button"
                      onClick={() => {
                        onDispatch({
                          type: 'TAKE_DISCARD_PILE',
                          playerId: view.viewerId,
                          topCardUsage: {
                            kind: 'add_to_meld',
                            meldId: canAddTopToExistingMeld.id,
                          },
                        });
                        setTakePileMode(false);
                      }}
                      className="flex-1 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-extrabold text-stone-950 cursor-pointer"
                    >
                      Add to {canAddTopToExistingMeld.rank}s &amp; Take
                    </button>
                  )}

                  {needsInitial && canStageSelectedAsNewMeld.valid && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!canStageSelectedAsNewMeld.rank) return;
                        setTakePileExtraMelds((prev) => [
                          ...prev,
                          {
                            kind: 'new_meld',
                            rank: canStageSelectedAsNewMeld.rank!,
                            cardIds: selectedCards.map((c) => c.id),
                          },
                        ]);
                        setSelectedIds(new Set());
                      }}
                      className="rounded-xl border border-amber-300/50 bg-amber-400/15 px-3 py-2 text-xs font-bold text-amber-200 cursor-pointer"
                    >
                      + Stage {canStageSelectedAsNewMeld.label}
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!takePileTopValid || !takePileMeetsInitial}
                    onClick={() => {
                      onDispatch({
                        type: 'TAKE_DISCARD_PILE',
                        playerId: view.viewerId,
                        topCardUsage: {
                          kind: 'new_meld',
                          handCardIds: takePileTopMeldPreviewCards.map((c) => c.id),
                        },
                        additionalInitialMelds:
                          takePileExtraMelds.length > 0 ? takePileExtraMelds : undefined,
                      });
                      setTakePileMode(false);
                      setTakePileExtraMelds([]);
                      setSelectedIds(new Set());
                    }}
                    className="flex-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-stone-950 disabled:opacity-40 cursor-pointer"
                  >
                    Confirm Take ({takePileTotalPts} pts)
                  </button>
                </div>
              </div>
            )}

            {/* Staged Multi-Meld Pill Strip (only mounted when staging initial/multiple melds) */}
            {stagedMelds.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/40 bg-amber-400/12 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-amber-200">
                    Staged ({stagedPoints}
                    {needsInitial ? ` / ${requiredInitial}` : ''} pts
                    {needsInitial && stagedMeetsInitial ? ' ✓' : ''}):
                  </span>
                  {stagedMelds.map((sm, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-amber-100"
                    >
                      {sm.label}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDispatch({
                        type: 'COMMIT_MELDS',
                        playerId: view.viewerId,
                        submissions: stagedMelds.map((s) => s.submission),
                      });
                      setStagedMelds([]);
                      setSelectedIds(new Set());
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-stone-950 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" /> Commit
                  </button>
                  <button
                    type="button"
                    onClick={() => setStagedMelds([])}
                    className="rounded-lg bg-white/10 p-1.5 text-emerald-100 cursor-pointer"
                    title="Clear staged melds"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Rank-Grouped Touch Hand */}
            <div className="my-auto">
              <MobileCardHand
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
            </div>

            {/* Multiple-Meld Quick Target Chips (when tapping a wild card that fits >1 meld) */}
            {targetableMeldIds.size > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-sky-300/35 bg-sky-950/50 px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-sky-200">Add to:</span>
                {myTeam.melds
                  .filter((m) => targetableMeldIds.has(m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleAddToMeldWithGuardrail(m)}
                      className="rounded-lg bg-sky-400 px-2.5 py-1 font-extrabold text-stone-950 cursor-pointer"
                    >
                      + {m.rank}s
                    </button>
                  ))}
              </div>
            )}
          </main>

          {/* Single-Row Thumb Action Dock (pinned cleanly above Bottom Tabs) */}
          {!takePileMode && (
            <div className="shrink-0 border-t border-white/10 bg-black/40 px-3 py-2">
              {view.legalHints.partnerGoOutStatus === 'PENDING' ? (
                <div className="py-1.5 text-center text-xs font-semibold text-amber-200">
                  Waiting for partner&apos;s answer…
                </div>
              ) : !view.legalHints.isViewerTurn ? (
                <div className="flex items-center justify-between text-xs text-emerald-100/80 py-1">
                  <span>
                    Waiting for <strong className="text-white">{activePlayer?.name}</strong>…
                  </span>
                  <span className="text-[11px] text-amber-200/80">
                    Canastas: {view.legalHints.viewerCanastas}/{view.legalHints.canastasRequired}
                  </span>
                </div>
              ) : view.phase === 'DRAW' ? (
                <div className="flex items-center gap-2">
                  {view.legalHints.canDrawStock && (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({ type: 'DRAW_STOCK', playerId: view.viewerId })
                      }
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-extrabold text-stone-950 shadow cursor-pointer"
                    >
                      <Layers className="h-4 w-4" />
                      Draw {Math.min(view.ruleset.drawCount, view.stockCount)}
                      <span className="text-[11px] font-bold opacity-75">
                        ({view.stockCount})
                      </span>
                    </button>
                  )}

                  {view.legalHints.canTakeDiscardPile && topCard ? (
                    <button
                      type="button"
                      onClick={startGuidedTakePile}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300/60 bg-emerald-500/25 px-3 py-2.5 text-sm font-extrabold text-emerald-100 cursor-pointer"
                    >
                      Take {getCardLabel(topCard)}
                      <span className="text-[11px] opacity-80">
                        ({view.discardPile.count})
                      </span>
                    </button>
                  ) : view.legalHints.canPassExhaustedStock ? (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({
                          type: 'PASS_EXHAUSTED_STOCK',
                          playerId: view.viewerId,
                        })
                      }
                      className="flex-1 rounded-xl bg-rose-500 px-3 py-2.5 text-sm font-extrabold text-white cursor-pointer"
                    >
                      Pass (End Hand)
                    </button>
                  ) : null}

                  {view.legalHints.canAskPartnerGoOut && (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({
                          type: 'ASK_PARTNER_GO_OUT',
                          playerId: view.viewerId,
                        })
                      }
                      title="Ask Partner to Go Out"
                      className="shrink-0 rounded-xl border border-amber-300/45 bg-amber-400/15 p-2.5 text-amber-200 cursor-pointer"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                /* MELD_OR_DISCARD Thumb Dock */
                <div className="flex items-center gap-2">
                  {selectedCards.length >= 3 && canStageSelectedAsNewMeld.valid && (
                    <button
                      type="button"
                      onClick={handleStageSelectedMeld}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-extrabold text-stone-950 shadow cursor-pointer"
                    >
                      <PlusCircle className="h-4 w-4" />
                      {needsInitial ? 'Stage' : 'Meld'} {canStageSelectedAsNewMeld.label}
                    </button>
                  )}

                  {!needsInitial && matchingSingleMeld && selectedCards.length >= 1 && (
                    <button
                      type="button"
                      onClick={() => handleAddToMeldWithGuardrail(matchingSingleMeld)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-400 px-3 py-2.5 text-sm font-extrabold text-stone-950 shadow cursor-pointer"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Add to {matchingSingleMeld.rank}s
                    </button>
                  )}

                  {selectedCards.length === 1 && stagedMelds.length === 0 && (
                    <button
                      type="button"
                      onClick={handleDiscardSelected}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 py-2.5 text-sm font-extrabold text-white shadow cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      Discard {getCardLabel(selectedCards[0])}
                    </button>
                  )}

                  {selectedCards.length === 0 && stagedMelds.length === 0 && (
                    <div className="flex-1 text-xs text-emerald-100/80">
                      {needsInitial
                        ? `Tap cards to meld (Initial: ${requiredInitial} pts) or discard`
                        : 'Tap cards to meld, add, or discard'}
                    </div>
                  )}

                  {selectedCards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2.5 text-xs font-semibold text-emerald-100 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}

                  {view.legalHints.canUndoMelds && stagedMelds.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({
                          type: 'UNDO_TURN_MELDS',
                          playerId: view.viewerId,
                        })
                      }
                      title="Undo Melds This Turn"
                      className="shrink-0 rounded-xl border border-amber-300/40 bg-amber-400/15 p-2.5 text-amber-200 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}

                  {view.legalHints.canAskPartnerGoOut && (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({
                          type: 'ASK_PARTNER_GO_OUT',
                          playerId: view.viewerId,
                        })
                      }
                      title="Ask Partner to Go Out"
                      className="shrink-0 rounded-xl border border-amber-300/40 bg-amber-400/15 p-2.5 text-amber-200 cursor-pointer"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: TABLE VIEW (Stock, Discard Pile, Seats & Log) */}
      {tab === 'table' && (
        <main className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-3.5">
          {/* Big Stock & Discard Centerpiece */}
          <div className="rounded-2xl border border-emerald-200/15 bg-black/25 py-5 px-3">
            <StockAndDiscard
              stockCount={view.stockCount}
              drawCount={view.ruleset.drawCount}
              discardPile={view.discardPile}
              canDrawStock={view.legalHints.canDrawStock}
              canTakeDiscardPile={view.legalHints.canTakeDiscardPile}
              mustTakeDiscardPile={view.legalHints.mustTakeDiscardPile}
              takePileModeActive={takePileMode}
              onDrawStock={() => {
                onDispatch({ type: 'DRAW_STOCK', playerId: view.viewerId });
                setTab('hand');
              }}
              onClickDiscardPile={startGuidedTakePile}
            />
          </div>

          {/* All Players Turn-Order Grid */}
          <div className="grid grid-cols-2 gap-2">
            {view.players.map((p) => {
              const team = getTeamById(view.teams, p.teamId);
              const seatMeta = lobby.seats[p.seatIndex];
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border px-3 py-2 ${
                    p.isActive
                      ? 'border-amber-400 bg-amber-400/15'
                      : 'border-white/10 bg-black/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-white">
                      {p.name}
                    </span>
                    {p.isActive && (
                      <span className="rounded bg-amber-400 px-1.5 py-[1px] text-[9px] font-black text-stone-950">
                        TURN
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-emerald-100/80">
                    <span>
                      <strong className="text-white">{p.handCount}</strong> cards
                    </span>
                    <span className="font-semibold text-amber-200">
                      {team.cumulativeScore} pts
                    </span>
                  </div>
                  {seatMeta?.occupantKind === 'human' && !seatMeta.connected && (
                    <div className="mt-0.5 text-[10px] font-semibold text-rose-300">
                      Reconnecting…
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <ActionLog entries={view.actionLog} />
        </main>
      )}

      {/* TAB 3: MELDS INSPECTOR (Selectable Player / Team Pills) */}
      {tab === 'melds' && (
        <main className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          {/* Team / Player Selector Pills */}
          <div className="flex flex-wrap gap-1.5">
            {view.teams.map((team) => {
              const isMine = team.id === view.viewerTeamId;
              const active = inspectedTeam.id === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedMeldTeamId(team.id)}
                  className={`flex-1 min-w-[44%] rounded-xl border px-3 py-2 text-left transition cursor-pointer ${
                    active
                      ? 'border-amber-400 bg-amber-400/20 text-white shadow'
                      : 'border-white/15 bg-black/25 text-emerald-100/80 hover:bg-black/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-extrabold">
                      {isMine ? `My Melds` : team.name}
                    </span>
                    <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                      {team.melds.length}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-emerald-200/75">
                    {team.cumulativeScore.toLocaleString()} pts •{' '}
                    {team.melds.filter((m) => m.isCanasta).length} Canasta(s)
                  </div>
                </button>
              );
            })}
          </div>

          {inspectedTeam.id === view.viewerTeamId && targetableMeldIds.size > 0 && (
            <div className="rounded-xl border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-200">
              Tap any highlighted meld below to add your {selectedCards.length} selected card(s).
            </div>
          )}

          <MeldZone
            title={
              inspectedTeam.id === view.viewerTeamId
                ? `My Melds (${inspectedTeam.name})`
                : `${inspectedTeam.name} — Melds`
            }
            melds={inspectedTeam.melds}
            redThrees={inspectedTeam.redThrees}
            hasMadeInitialMeld={inspectedTeam.hasMadeInitialMeld}
            targetableMeldIds={
              inspectedTeam.id === view.viewerTeamId ? targetableMeldIds : undefined
            }
            onSelectMeld={
              inspectedTeam.id === view.viewerTeamId
                ? (meld) => {
                    handleAddToMeldWithGuardrail(meld);
                    setTab('hand');
                  }
                : undefined
            }
          />
        </main>
      )}

      {/* Bottom 3-Tab Navigation Bar */}
      <nav className="felt-rail grid shrink-0 grid-cols-3 border-t pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={() => setTab('hand')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold cursor-pointer ${
            tab === 'hand'
              ? 'bg-amber-400/15 text-amber-300 border-t-2 border-amber-400'
              : 'text-emerald-200/75'
          }`}
        >
          <Hand className="h-4 w-4" />
          <span>Hand ({view.viewerHand.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('table')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold cursor-pointer ${
            tab === 'table'
              ? 'bg-amber-400/15 text-amber-300 border-t-2 border-amber-400'
              : 'text-emerald-200/75'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>
            {topCard
              ? `Discard ${getCardLabel(topCard)} (${view.discardPile.count})`
              : `Discard (0)`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTab('melds')}
          className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold cursor-pointer ${
            tab === 'melds'
              ? 'bg-amber-400/15 text-amber-300 border-t-2 border-amber-400'
              : 'text-emerald-200/75'
          }`}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>Melds ({totalTableMelds})</span>
        </button>
      </nav>

      <RulesScoringDrawer
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        ruleset={view.ruleset}
        teams={view.teams}
        viewerTeamId={view.viewerTeamId}
      />

      <GuardrailModal prompt={guardrail} onCancel={() => setGuardrail(null)} />

      <PartnerPromptModal
        open={view.legalHints.mustAnswerPartnerGoOut}
        askerName={partnerAskerName}
        partnerHand={view.viewerHand}
        teamCanastas={view.legalHints.viewerCanastas}
        onAnswer={(allow) =>
          onDispatch({
            type: 'ANSWER_PARTNER_GO_OUT',
            playerId: view.viewerId,
            allow,
          })
        }
      />

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
        onExitToMenu={onLeaveRoom}
        onExportReplay={() => {}}
      />
    </div>
  );
};
