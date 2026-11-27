import React from 'react';
import {
  Check,
  Layers,
  PlusCircle,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  getCardLabel,
  getCardPoints,
  type Card,
  type Meld,
  type MeldDraftItem,
  type MeldSubmission,
  type PlayerView,
} from '../../engine';
import { PlayingCard } from './PlayingCard';

export interface StagedMeldDisplay {
  submission: MeldSubmission;
  cards: Card[];
  points: number;
  label: string;
}

export interface ActionBarProps {
  view: PlayerView;
  selectedCards: Card[];
  stagedMelds: StagedMeldDisplay[];
  takePileMode: boolean;
  takePileExtraMelds: MeldDraftItem[];
  takePileTopMeldPreviewCards: Card[];
  canAddTopToExistingMeld: Meld | null;
  canStageSelectedAsNewMeld: { valid: boolean; reason?: string; label?: string };
  matchingExistingMeldForSelection: Meld | null;
  onDrawStock: () => void;
  onStartTakePile: () => void;
  onCancelTakePile: () => void;
  onConfirmTakePileAddExisting: (meld: Meld) => void;
  onStageExtraInitialMeldForPickup: () => void;
  onConfirmTakePileWithHand: () => void;
  onPassExhaustedStock: () => void;
  onStageSelectedMeld: () => void;
  onStageAddToMeld: (meld: Meld) => void;
  onCommitStagedMelds: () => void;
  onClearStaged: () => void;
  onUndoTurnMelds: () => void;
  onDiscardSelected: () => void;
  onClearSelection: () => void;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  view,
  selectedCards,
  stagedMelds,
  takePileMode,
  takePileExtraMelds,
  takePileTopMeldPreviewCards,
  canAddTopToExistingMeld,
  canStageSelectedAsNewMeld,
  matchingExistingMeldForSelection,
  onDrawStock,
  onStartTakePile,
  onCancelTakePile,
  onConfirmTakePileAddExisting,
  onStageExtraInitialMeldForPickup,
  onConfirmTakePileWithHand,
  onPassExhaustedStock,
  onStageSelectedMeld,
  onStageAddToMeld,
  onCommitStagedMelds,
  onClearStaged,
  onUndoTurnMelds,
  onDiscardSelected,
  onClearSelection,
}) => {
  const { legalHints, phase, discardPile } = view;
  const activePlayer = view.players.find((p) => p.id === view.activePlayerId);

  if (!legalHints.isViewerTurn) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-emerald-200/15 bg-black/30 px-4 py-2.5 text-sm text-emerald-100/85">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse mr-2.5" />
        Waiting for <strong className="mx-1 text-white">{activePlayer?.name}</strong>…
      </div>
    );
  }

  // Guided "Take Discard Pile" Staging Mode
  if (phase === 'DRAW' && takePileMode && discardPile.topCard) {
    const topCard = discardPile.topCard;
    const handMap = new Map(view.viewerHand.map((c) => [c.id, c]));
    const extraPoints = takePileExtraMelds.reduce(
      (sum, m) =>
        sum + m.cardIds.reduce((s, id) => s + getCardPoints(handMap.get(id)!), 0),
      0,
    );
    const topMeldPoints =
      getCardPoints(topCard) +
      takePileTopMeldPreviewCards.reduce((s, c) => s + getCardPoints(c), 0);
    const totalPoints = topMeldPoints + extraPoints;
    const needsInitial = !legalHints.viewerTeamHasInitialMeld;
    const required = legalHints.initialMeldRequired;
    const meetsInitial = !needsInitial || totalPoints >= required;
    const frozen = discardPile.isFrozenForViewer;

    const matchingNaturalsCount = takePileTopMeldPreviewCards.filter(
      (c) => c.rank === topCard.rank,
    ).length;
    const topMeldValid =
      takePileTopMeldPreviewCards.length >= 2 &&
      (frozen ? matchingNaturalsCount >= 2 : matchingNaturalsCount >= 1);

    return (
      <div className="rounded-xl border border-amber-400/50 bg-[#143322] px-4 py-2.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PlayingCard card={topCard} size="xs" />
            <div>
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                Guided Pickup: Taking {discardPile.count} Discard Card{discardPile.count === 1 ? '' : 's'}
              </div>
              <div className="text-xs text-emerald-100/90 mt-0.5">
                {frozen
                  ? `Pile is frozen — select 2 natural ${topCard.rank}s from your hand.`
                  : canAddTopToExistingMeld
                    ? `Add ${getCardLabel(topCard)} to your ${topCard.rank}s meld, or select matching cards from hand.`
                    : `Select 2 matching ${topCard.rank}s (or 1 ${topCard.rank} + 1 wild) from hand.`}
              </div>
              {needsInitial && (
                <div
                  className={`mt-1 text-xs font-bold ${
                    meetsInitial ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  Initial Meld Progress: {totalPoints} / {required} pts{' '}
                  {meetsInitial ? '✓ Ready!' : '(stage extra hand melds if needed)'}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canAddTopToExistingMeld && !frozen && (
              <button
                type="button"
                onClick={() => onConfirmTakePileAddExisting(canAddTopToExistingMeld)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-emerald-300 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                Add {getCardLabel(topCard)} to {canAddTopToExistingMeld.rank}s &amp; Take Pile
              </button>
            )}

            {needsInitial && canStageSelectedAsNewMeld.valid && (
              <button
                type="button"
                onClick={onStageExtraInitialMeldForPickup}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-300/50 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/25 cursor-pointer"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Stage Extra Meld ({canStageSelectedAsNewMeld.label})
              </button>
            )}

            <button
              type="button"
              disabled={!topMeldValid || !meetsInitial}
              onClick={onConfirmTakePileWithHand}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-stone-950 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              Confirm Take Pile ({totalPoints} pts)
            </button>

            <button
              type="button"
              onClick={onCancelTakePile}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>

        {takePileExtraMelds.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-amber-200">
            <span>Extra initial melds staged:</span>
            {takePileExtraMelds.map((m, idx) => (
              <span
                key={idx}
                className="rounded bg-black/40 border border-amber-300/30 px-2 py-0.5 font-semibold"
              >
                {m.cardIds.length}×{m.rank}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Normal DRAW Phase Bar
  if (phase === 'DRAW') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/35 bg-black/35 px-4 py-2.5">
        <div className="text-sm font-medium text-emerald-100">
          <span className="font-bold text-amber-300">Your Turn — Draw Phase:</span>{' '}
          {legalHints.mustTakeDiscardPile
            ? 'Stock is empty and top discard matches your meld — you must take the discard pile.'
            : legalHints.canDrawStock
              ? `Draw ${Math.min(view.ruleset.drawCount, view.stockCount)} card(s) from stock, or take the discard pile.`
              : 'Stock is empty — take the discard pile if able, or pass to end the hand.'}
        </div>
        <div className="flex items-center gap-2">
          {legalHints.canDrawStock && (
            <button
              type="button"
              onClick={onDrawStock}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-extrabold text-stone-950 shadow hover:bg-amber-300 cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              Draw {Math.min(view.ruleset.drawCount, view.stockCount)} from Stock
            </button>
          )}
          {legalHints.canTakeDiscardPile && (
            <button
              type="button"
              onClick={onStartTakePile}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300/60 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
            >
              Take Discard Pile ({discardPile.count})
            </button>
          )}
          {legalHints.canPassExhaustedStock && (
            <button
              type="button"
              onClick={onPassExhaustedStock}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/80 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-400 cursor-pointer"
            >
              Pass (End Hand)
            </button>
          )}
        </div>
      </div>
    );
  }

  // MELD_OR_DISCARD Phase Bar
  const stagedPoints = stagedMelds.reduce((s, m) => s + m.points, 0);
  const needsInitial = !legalHints.viewerTeamHasInitialMeld;
  const required = legalHints.initialMeldRequired;
  const meetsInitial = !needsInitial || stagedPoints >= required;

  return (
    <div className="rounded-xl border border-emerald-200/20 bg-black/35 px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-amber-300">Meld or Discard:</span>
          {needsInitial ? (
            <span
              className={`rounded-full px-2.5 py-0.5 font-semibold ${
                stagedMelds.length > 0 && meetsInitial
                  ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
                  : 'bg-amber-500/15 text-amber-200 border border-amber-400/30'
              }`}
            >
              Initial Meld: {stagedPoints} / {required} pts {meetsInitial && stagedMelds.length > 0 ? '✓' : ''}
            </span>
          ) : (
            <span className="text-emerald-200/75">
              Canastas: {legalHints.viewerCanastas} / {legalHints.canastasRequired} to go out
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Stage New Meld */}
          {selectedCards.length >= 3 && canStageSelectedAsNewMeld.valid && (
            <button
              type="button"
              onClick={onStageSelectedMeld}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-emerald-300 cursor-pointer"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              {needsInitial ? 'Stage Meld' : 'Meld'} ({canStageSelectedAsNewMeld.label})
            </button>
          )}

          {/* Add to existing meld shortcut */}
          {!needsInitial &&
            selectedCards.length >= 1 &&
            matchingExistingMeldForSelection && (
              <button
                type="button"
                onClick={() => onStageAddToMeld(matchingExistingMeldForSelection)}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-400 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-sky-300 cursor-pointer"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add to {matchingExistingMeldForSelection.rank}s
              </button>
            )}

          {/* Commit Staged Melds (batch) */}
          {stagedMelds.length > 0 && (
            <>
              <button
                type="button"
                onClick={onCommitStagedMelds}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-extrabold text-stone-950 shadow hover:bg-amber-300 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                Commit {stagedMelds.length} Meld{stagedMelds.length === 1 ? '' : 's'} ({stagedPoints} pts)
              </button>
              <button
                type="button"
                onClick={onClearStaged}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-white/10 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear Staged
              </button>
            </>
          )}

          {/* Undo Melds Made This Turn */}
          {legalHints.canUndoMelds && stagedMelds.length === 0 && (
            <button
              type="button"
              onClick={onUndoTurnMelds}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo Turn Melds
            </button>
          )}

          {/* Discard (exact 1 card selected & nothing staged) */}
          <button
            type="button"
            disabled={selectedCards.length !== 1 || stagedMelds.length > 0}
            onClick={onDiscardSelected}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-400 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            Discard{selectedCards.length === 1 ? ` ${getCardLabel(selectedCards[0])}` : ''}
          </button>

          {selectedCards.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-emerald-200/75 hover:bg-white/10 cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Visual Staged Melds Strip */}
      {stagedMelds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-xs">
          <span className="text-amber-300/90 font-semibold">Staged:</span>
          {stagedMelds.map((sm, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/35 bg-amber-400/15 px-2.5 py-1 text-amber-100 font-medium"
            >
              {sm.label} ({sm.points} pts)
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
