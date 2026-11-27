import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Hand,
  LayoutGrid,
  LogOut,
  Monitor,
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
} from '../../engine';
import type { RoomLobbyState } from '../../shared/protocol';
import type { ToastNotice } from '../../store';
import { soundEngine } from '../audio/soundEngine';
import { ActionBar, type StagedMeldDisplay } from '../components/ActionBar';
import { ActionLog } from '../components/ActionLog';
import { CardHand } from '../components/CardHand';
import { GuardrailModal, type GuardrailPrompt } from '../components/GuardrailModal';
import { HandSummaryModal } from '../components/HandSummaryModal';
import { MeldZone } from '../components/MeldZone';
import { PartnerPromptModal } from '../components/PartnerPromptModal';
import { PlayingCard } from '../components/PlayingCard';
import { RulesScoringDrawer } from '../components/RulesScoringDrawer';

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

/**
 * Touch-First Mobile Hand Controller for Jackbox-style Phone-Hands LAN play.
 * Defaults to Hand tab (private hand + top discard + thumb actions) with a
 * secondary Table/Melds tab + Rules drawer so players can inspect anything.
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
  const [tab, setTab] = useState<'hand' | 'table'>('hand');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stagedMelds, setStagedMelds] = useState<StagedMeldDisplay[]>([]);
  const [takePileMode, setTakePileMode] = useState(false);
  const [takePileExtraMelds, setTakePileExtraMelds] = useState<MeldDraftItem[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [guardrail, setGuardrail] = useState<GuardrailPrompt | null>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setStagedMelds([]);
    setTakePileMode(false);
    setTakePileExtraMelds([]);
  }, [view.turnNumber, view.phase, view.handNumber]);

  const myTeam = getTeamById(view.teams, view.viewerTeamId);
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
      rank === '3B' ? `${selectedCards.length}×Black 3` : `${selectedCards.length}×${rank}`;
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

  const matchingExistingMeldForSelection = useMemo(() => {
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

  const partnerAskerName = view.partnerGoOut
    ? view.players.find((p) => p.id === view.partnerGoOut!.askedByPlayerId)?.name ?? 'Partner'
    : 'Partner';

  return (
    <div className="flex h-dvh w-full flex-col casino-felt overflow-hidden">
      {/* Compact Mobile Header */}
      <header className="felt-rail flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-white">
              {viewerPlayer.name}
            </span>
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">
              {lobby.roomCode}
            </span>
          </div>
          <div className="text-[11px] text-emerald-200/80">
            Score: <strong className="text-white">{myTeam.cumulativeScore}</strong> •{' '}
            {view.legalHints.isViewerTurn ? (
              <span className="font-bold text-amber-300">YOUR TURN</span>
            ) : (
              <span>{activePlayer?.name}&apos;s turn</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onSwitchToFullTable}
            title="Switch to Full Table View"
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <Monitor className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleSound}
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            {soundMuted ? (
              <VolumeX className="h-4 w-4 text-rose-300" />
            ) : (
              <Volume2 className="h-4 w-4 text-amber-300" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="rounded-lg border border-amber-300/35 bg-amber-400/15 p-1.5 text-amber-200 cursor-pointer"
          >
            <BookOpen className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-emerald-100 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Floating Toast */}
      {toast && (
        <div
          key={toast.id}
          className="toast-float-in pointer-events-none fixed bottom-20 left-1/2 z-40 w-[92vw] max-w-md"
        >
          <div
            className={`pointer-events-auto flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-md ${
              toast.kind === 'error'
                ? 'border-rose-400/75 bg-rose-950/95 text-rose-100'
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

      {/* Main Mobile Content */}
      <main className="flex-1 overflow-y-auto px-3 py-2.5 flex flex-col gap-2.5">
        {tab === 'hand' ? (
          <>
            {/* Compact Stock & Top Discard Strip */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/15 bg-black/25 px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase text-emerald-200/75">
                    Stock
                  </div>
                  <div className="text-lg font-black text-amber-300">
                    {view.stockCount}
                  </div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  {view.discardPile.topCard ? (
                    <PlayingCard card={view.discardPile.topCard} size="xs" />
                  ) : (
                    <div className="flex h-[50px] w-9 items-center justify-center rounded border border-dashed border-white/25 text-[9px] text-emerald-200/50">
                      Empty
                    </div>
                  )}
                  <div className="text-xs">
                    <div className="font-bold text-white">
                      Discard ({view.discardPile.count})
                    </div>
                    <div className="text-[11px] text-amber-200/85">
                      {view.discardPile.blockedByBlackThree
                        ? 'Blocked (Black 3)'
                        : view.discardPile.isFrozenForViewer
                          ? 'Frozen'
                          : 'Unfrozen'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="text-emerald-200/75">Canastas</div>
                <div className="font-extrabold text-amber-300">
                  {view.legalHints.viewerCanastas} / {view.legalHints.canastasRequired}
                </div>
              </div>
            </div>

            {/* Contextual Thumb Action Bar */}
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
                onDispatch({
                  type: 'TAKE_DISCARD_PILE',
                  playerId: view.viewerId,
                  topCardUsage: { kind: 'add_to_meld', meldId: meld.id },
                });
                setTakePileMode(false);
              }}
              onStageExtraInitialMeldForPickup={() => {
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
              }}
              onConfirmTakePileWithHand={() => {
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
              onPassExhaustedStock={() =>
                onDispatch({ type: 'PASS_EXHAUSTED_STOCK', playerId: view.viewerId })
              }
              onStageSelectedMeld={handleStageSelectedMeld}
              onStageAddToMeld={handleAddToMeldWithGuardrail}
              onCommitStagedMelds={() => {
                onDispatch({
                  type: 'COMMIT_MELDS',
                  playerId: view.viewerId,
                  submissions: stagedMelds.map((s) => s.submission),
                });
                setStagedMelds([]);
                setSelectedIds(new Set());
              }}
              onClearStaged={() => setStagedMelds([])}
              onUndoTurnMelds={() =>
                onDispatch({ type: 'UNDO_TURN_MELDS', playerId: view.viewerId })
              }
              onDiscardSelected={handleDiscardSelected}
              onAskPartnerGoOut={() =>
                onDispatch({ type: 'ASK_PARTNER_GO_OUT', playerId: view.viewerId })
              }
              onClearSelection={() => setSelectedIds(new Set())}
            />

            {/* Quick Tap-to-Add Your Melds Strip (if player has melds & cards selected) */}
            {targetableMeldIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs">
                <span className="font-bold text-amber-200">Tap to add:</span>
                {myTeam.melds
                  .filter((m) => targetableMeldIds.has(m.id))
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleAddToMeldWithGuardrail(m)}
                      className="rounded-lg bg-amber-400 px-2.5 py-1 font-extrabold text-stone-950 cursor-pointer"
                    >
                      + {m.rank}s ({m.cards.length})
                    </button>
                  ))}
              </div>
            )}

            {/* Private Hand Fan */}
            <div className="mt-auto">
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
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {view.teams.map((team) => (
              <MeldZone
                key={team.id}
                title={`${team.name} — ${team.cumulativeScore.toLocaleString()} pts`}
                melds={team.melds}
                redThrees={team.redThrees}
                hasMadeInitialMeld={team.hasMadeInitialMeld}
                targetableMeldIds={
                  team.id === view.viewerTeamId ? targetableMeldIds : undefined
                }
                onSelectMeld={
                  team.id === view.viewerTeamId
                    ? handleAddToMeldWithGuardrail
                    : undefined
                }
              />
            ))}
            <ActionLog entries={view.actionLog} />
          </div>
        )}
      </main>

      {/* Bottom Mobile Navigation Tabs */}
      <nav className="felt-rail grid shrink-0 grid-cols-2 border-t">
        <button
          type="button"
          onClick={() => setTab('hand')}
          className={`flex items-center justify-center gap-2 py-3 text-xs font-bold cursor-pointer ${
            tab === 'hand'
              ? 'bg-amber-400/15 text-amber-300 border-t-2 border-amber-400'
              : 'text-emerald-200/70'
          }`}
        >
          <Hand className="h-4 w-4" /> My Hand ({view.viewerHand.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('table')}
          className={`flex items-center justify-center gap-2 py-3 text-xs font-bold cursor-pointer ${
            tab === 'table'
              ? 'bg-amber-400/15 text-amber-300 border-t-2 border-amber-400'
              : 'text-emerald-200/70'
          }`}
        >
          <LayoutGrid className="h-4 w-4" /> Table &amp; Melds
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
