import type { MatchLengthPreset, RulesetConfig, RulesetId } from './types';

export const BICYCLE_2P_CLASSIC: RulesetConfig = {
  id: 'bicycle-2p-classic',
  name: 'Bicycle 2-Player Classic',
  shortName: '2P Classic',
  description:
    'Official Bicycle 2-player head-to-head Canasta: 15 cards dealt, draw 2 per turn, 2 Canastas required to go out, classic wild-card limits (≥ 2 naturals, ≤ 3 wilds).',
  playerCount: 2,
  teamCount: 2,
  dealSize: 15,
  drawCount: 2,
  canastasRequiredToGoOut: 2,
  winScore: 5000,
  allowPartnerGoOutPrompt: false,
  initialMeldThresholds: [
    { minScore: -Infinity, requiredPoints: 0 },
    { minScore: 0, requiredPoints: 50 },
    { minScore: 1500, requiredPoints: 90 },
    { minScore: 3000, requiredPoints: 120 },
  ],
  minMeldSize: 3,
  minNaturalsPerMeld: 2,
  maxWildsPerMeld: 3,
  requireNaturalMajority: false,
  allowAllWildMelds: false,
  allowBlackThreeMeldOnGoOut: true,
  goingOutBonus: 100,
  concealedGoingOutExtraBonus: 100,
  naturalCanastaBonus: 500,
  mixedCanastaBonus: 300,
  redThreeValue: 100,
  allFourRedThreesBonus: 800,
  penalizeRedThreesWithoutInitialMeld: true,
};

export const BICYCLE_3P_CUTTHROAT: RulesetConfig = {
  ...BICYCLE_2P_CLASSIC,
  id: 'bicycle-3p-cutthroat',
  name: 'Bicycle 3-Player Cutthroat',
  shortName: '3P Cutthroat',
  description:
    'Bicycle 3-player individual Canasta: every player for themselves, 13 cards dealt, draw 1 per turn, 1 Canasta required to go out.',
  playerCount: 3,
  teamCount: 3,
  dealSize: 13,
  drawCount: 1,
  canastasRequiredToGoOut: 1,
  allowPartnerGoOutPrompt: false,
};

export const BICYCLE_4P_PARTNERSHIP: RulesetConfig = {
  ...BICYCLE_2P_CLASSIC,
  id: 'bicycle-4p-partnership',
  name: 'Bicycle 4-Player Partnership',
  shortName: '4P Partnership',
  description:
    'Official Bicycle 4-player partnership Canasta: 2 teams of 2 sitting opposite, 11 cards dealt, draw 1 per turn, 1 Canasta required to go out, with binding "Partner, may I go out?" permission.',
  playerCount: 4,
  teamCount: 2,
  dealSize: 11,
  drawCount: 1,
  canastasRequiredToGoOut: 1,
  allowPartnerGoOutPrompt: true,
};

export const BICYCLE_4P_CUTTHROAT: RulesetConfig = {
  ...BICYCLE_2P_CLASSIC,
  id: 'bicycle-4p-cutthroat',
  name: 'Bicycle 4-Player Cutthroat',
  shortName: '4P Cutthroat',
  description:
    'Bicycle 4-player head-to-head Canasta: 4 individual players, 11 cards dealt, draw 1 per turn, 1 Canasta required to go out.',
  playerCount: 4,
  teamCount: 4,
  dealSize: 11,
  drawCount: 1,
  canastasRequiredToGoOut: 1,
  allowPartnerGoOutPrompt: false,
};

/** Back-compat alias */
export const BICYCLE_4P_CLASSIC = BICYCLE_4P_PARTNERSHIP;

export const ALL_RULESETS: readonly RulesetConfig[] = [
  BICYCLE_2P_CLASSIC,
  BICYCLE_3P_CUTTHROAT,
  BICYCLE_4P_PARTNERSHIP,
  BICYCLE_4P_CUTTHROAT,
];

export function getRulesetById(id: RulesetId): RulesetConfig {
  const found = ALL_RULESETS.find((r) => r.id === id);
  return found ?? BICYCLE_2P_CLASSIC;
}

export function createRuleset(
  base: RulesetConfig = BICYCLE_2P_CLASSIC,
  matchLength: MatchLengthPreset = 'standard_5000',
): RulesetConfig {
  const winScore =
    matchLength === 'standard_5000'
      ? 5000
      : matchLength === 'quick_2500'
        ? 2500
        : null;

  return {
    ...base,
    winScore,
    initialMeldThresholds: base.initialMeldThresholds.map((t) => ({ ...t })),
  };
}

export function getRequiredInitialMeldPoints(
  ruleset: RulesetConfig,
  cumulativeScore: number,
): number {
  let required = 0;
  for (const tier of ruleset.initialMeldThresholds) {
    if (cumulativeScore >= tier.minScore) {
      required = tier.requiredPoints;
    }
  }
  return required;
}
