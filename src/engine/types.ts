export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type NaturalRank =
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A';

export type Rank = NaturalRank | '2' | '3' | 'JOKER';

export type MeldRank = NaturalRank | '3B';

export interface Card {
  /** Unique across both decks, e.g. "d0-KH", "d1-KH", "d0-JOKER-R", "d1-JOKER-B" */
  id: string;
  deckIndex: 0 | 1;
  rank: Rank;
  suit: Suit | 'joker';
  color: 'red' | 'black';
}

export interface Meld {
  id: string;
  rank: MeldRank;
  cards: Card[];
  naturalCount: number;
  wildCount: number;
  isCanasta: boolean;
  canastaType: 'natural' | 'mixed' | null;
}

export interface InitialMeldThreshold {
  minScore: number;
  requiredPoints: number;
}

export type MatchLengthPreset = 'standard_5000' | 'quick_2500' | 'single_hand';

export interface RulesetConfig {
  id: string;
  name: string;
  description: string;
  playerCount: 2 | 4;
  teamCount: 2;
  dealSize: number;
  drawCount: number;
  canastasRequiredToGoOut: number;
  winScore: number | null;
  initialMeldThresholds: InitialMeldThreshold[];
  minMeldSize: number;
  minNaturalsPerMeld: number;
  maxWildsPerMeld: number;
  requireNaturalMajority: boolean;
  allowAllWildMelds: boolean;
  allowBlackThreeMeldOnGoOut: boolean;
  goingOutBonus: number;
  concealedGoingOutExtraBonus: number;
  naturalCanastaBonus: number;
  mixedCanastaBonus: number;
  redThreeValue: number;
  allFourRedThreesBonus: number;
  penalizeRedThreesWithoutInitialMeld: boolean;
}

export type TurnPhase = 'DRAW' | 'MELD_OR_DISCARD' | 'HAND_OVER' | 'MATCH_OVER';

export interface DiscardPile {
  cards: Card[];
  frozenByWildOrInitial: boolean;
  frozenCardId: string | null;
  blockedByBlackThree: boolean;
}

export interface HandScoreBreakdown {
  handNumber: number;
  teamId: 'team-0' | 'team-1';
  meldedCardPoints: number;
  naturalCanastaCount: number;
  naturalCanastaPoints: number;
  mixedCanastaCount: number;
  mixedCanastaPoints: number;
  redThreeCount: number;
  redThreePoints: number;
  goingOutBonus: number;
  wentOutConcealed: boolean;
  unmeldedHandPenalty: number;
  handNetScore: number;
  cumulativeAfterHand: number;
}

export type HandEndReason =
  | 'WENT_OUT'
  | 'WENT_OUT_CONCEALED'
  | 'STOCK_EXHAUSTED_RED_THREE'
  | 'STOCK_EXHAUSTED_PASS';

export interface HandSummary {
  handNumber: number;
  reason: HandEndReason;
  wentOutPlayerId: string | null;
  wentOutTeamId: 'team-0' | 'team-1' | null;
  breakdowns: [HandScoreBreakdown, HandScoreBreakdown];
}

export interface TeamState {
  id: 'team-0' | 'team-1';
  name: string;
  playerIds: string[];
  melds: Meld[];
  redThrees: Card[];
  hasMadeInitialMeld: boolean;
  /** Player IDs who melded or added to any meld on an earlier turn in this hand */
  meldedOnPriorTurnPlayerIds: string[];
  cumulativeScore: number;
  handHistory: HandScoreBreakdown[];
}

export type BotDifficulty = 'easy' | 'normal';

export interface PlayerConfig {
  id: string;
  name: string;
  teamId: 'team-0' | 'team-1';
  kind: 'human' | 'bot';
  botDifficulty?: BotDifficulty;
}

export interface PlayerState extends PlayerConfig {
  seatIndex: number;
  hand: Card[];
  hasTakenFirstTurn: boolean;
}

export interface TurnUndoCheckpoint {
  playerId: string;
  hand: Card[];
  teams: [TeamState, TeamState];
}

export type ActionLogKind =
  | 'deal'
  | 'draw'
  | 'take_pile'
  | 'red_three'
  | 'meld'
  | 'undo'
  | 'discard'
  | 'go_out'
  | 'hand_end'
  | 'info';

export interface ActionLogEntry {
  id: number;
  handNumber: number;
  turnNumber: number;
  playerId: string | null;
  kind: ActionLogKind;
  message: string;
}

export interface MeldDraftItem {
  kind: 'new_meld';
  rank: MeldRank;
  cardIds: string[];
}

export interface AddToMeldDraftItem {
  kind: 'add_to_meld';
  meldId: string;
  cardIds: string[];
}

export type MeldSubmission = MeldDraftItem | AddToMeldDraftItem;

export type TopCardUsage =
  | { kind: 'new_meld'; handCardIds: string[] }
  | { kind: 'add_to_meld'; meldId: string };

export type GameAction =
  | { type: 'DRAW_STOCK'; playerId: string }
  | {
      type: 'TAKE_DISCARD_PILE';
      playerId: string;
      topCardUsage: TopCardUsage;
      additionalInitialMelds?: MeldDraftItem[];
    }
  | { type: 'COMMIT_MELDS'; playerId: string; submissions: MeldSubmission[] }
  | { type: 'UNDO_TURN_MELDS'; playerId: string }
  | { type: 'DISCARD'; playerId: string; cardId: string }
  | { type: 'GO_OUT_WITHOUT_DISCARD'; playerId: string }
  | { type: 'PASS_EXHAUSTED_STOCK'; playerId: string }
  | { type: 'START_NEXT_HAND' };

export interface GameState {
  schemaVersion: 1;
  matchId: string;
  matchSeed: number;
  handSeed: number;
  rngState: number;
  handNumber: number;
  turnNumber: number;
  dealerIndex: number;
  ruleset: RulesetConfig;
  players: PlayerState[];
  teams: [TeamState, TeamState];
  activePlayerIndex: number;
  phase: TurnPhase;
  stock: Card[];
  discardPile: DiscardPile;
  tookDiscardPileThisTurn: boolean;
  /** True if the active player already melded/added cards earlier in THIS turn */
  meldedThisTurn: boolean;
  turnUndoCheckpoint: TurnUndoCheckpoint | null;
  actionHistory: GameAction[];
  actionLog: ActionLogEntry[];
  nextLogId: number;
  nextMeldSeq: number;
  lastHandSummary: HandSummary | null;
  winnerTeamId: 'team-0' | 'team-1' | null;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

export interface PublicPlayerView {
  id: string;
  name: string;
  teamId: 'team-0' | 'team-1';
  seatIndex: number;
  kind: 'human' | 'bot';
  botDifficulty?: BotDifficulty;
  handCount: number;
  isActive: boolean;
}

export interface DiscardPileView {
  topCard: Card | null;
  count: number;
  frozenByWildOrInitial: boolean;
  isFrozenForViewer: boolean;
  frozenCard: Card | null;
  blockedByBlackThree: boolean;
}

export interface LegalHints {
  isViewerTurn: boolean;
  canDrawStock: boolean;
  canTakeDiscardPile: boolean;
  mustTakeDiscardPile: boolean;
  canPassExhaustedStock: boolean;
  canUndoMelds: boolean;
  canGoOutWithoutDiscard: boolean;
  viewerCanastas: number;
  canastasRequired: number;
  initialMeldRequired: number;
  viewerTeamHasInitialMeld: boolean;
}

export interface PlayerView {
  matchId: string;
  handNumber: number;
  turnNumber: number;
  phase: TurnPhase;
  ruleset: RulesetConfig;
  viewerId: string;
  viewerTeamId: 'team-0' | 'team-1';
  viewerHand: Card[];
  activePlayerId: string;
  players: PublicPlayerView[];
  teams: [TeamState, TeamState];
  stockCount: number;
  discardPile: DiscardPileView;
  actionLog: ActionLogEntry[];
  lastHandSummary: HandSummary | null;
  winnerTeamId: 'team-0' | 'team-1' | null;
  legalHints: LegalHints;
}

export interface TableView {
  matchId: string;
  handNumber: number;
  turnNumber: number;
  phase: TurnPhase;
  ruleset: RulesetConfig;
  activePlayerId: string;
  players: PublicPlayerView[];
  teams: [TeamState, TeamState];
  stockCount: number;
  discardPile: Omit<DiscardPileView, 'isFrozenForViewer'>;
  actionLog: ActionLogEntry[];
  lastHandSummary: HandSummary | null;
  winnerTeamId: 'team-0' | 'team-1' | null;
}
