import React, { useState } from 'react';
import { BookOpen, Calculator, X } from 'lucide-react';
import {
  getCardPoints,
  getRequiredInitialMeldPoints,
  getTeamById,
  type RulesetConfig,
  type TeamId,
  type TeamState,
} from '../../engine';

export interface RulesScoringDrawerProps {
  open: boolean;
  onClose: () => void;
  ruleset: RulesetConfig;
  teams?: TeamState[];
  viewerTeamId?: TeamId;
  initialTab?: 'rules' | 'scoring';
}

export const RulesScoringDrawer: React.FC<RulesScoringDrawerProps> = ({
  open,
  onClose,
  ruleset,
  teams,
  viewerTeamId,
  initialTab = 'rules',
}) => {
  const [tab, setTab] = useState<'rules' | 'scoring'>(initialTab);

  if (!open) return null;

  const viewerTeam =
    teams && viewerTeamId ? getTeamById(teams, viewerTeamId) : undefined;
  const activeRequired = viewerTeam
    ? getRequiredInitialMeldPoints(ruleset, viewerTeam.cumulativeScore)
    : null;

  const liveMeldPoints = (team: TeamState) =>
    team.melds.reduce(
      (sum, m) => sum + m.cards.reduce((s, c) => s + getCardPoints(c), 0),
      0,
    );

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-amber-300/30 bg-[#0b291a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-200/15 bg-black/25 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold text-white">
              Rules &amp; Scoring Reference
            </h2>
            <p className="text-xs text-amber-200/90">{ruleset.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-emerald-200 hover:bg-white/10 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-emerald-200/15 bg-black/15 px-5 pt-2">
          <button
            type="button"
            onClick={() => setTab('rules')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${
              tab === 'rules'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-emerald-200/70 hover:text-white'
            }`}
          >
            <BookOpen className="h-4 w-4" /> Active Rules
          </button>
          <button
            type="button"
            onClick={() => setTab('scoring')}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${
              tab === 'scoring'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-emerald-200/70 hover:text-white'
            }`}
          >
            <Calculator className="h-4 w-4" /> Scoring &amp; Scoreboard
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm text-emerald-100/90">
          {tab === 'rules' ? (
            <>
              <p className="rounded-xl border border-emerald-200/15 bg-black/20 p-3 text-xs leading-relaxed text-emerald-100/85">
                {ruleset.description}
              </p>

              {/* Core Parameters */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  Match Setup &amp; Turn Flow
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-black/25 p-2.5 border border-white/5">
                    <div className="text-emerald-300/75">Deck</div>
                    <div className="font-bold text-white">108 cards (2 decks + 4 Jokers)</div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2.5 border border-white/5">
                    <div className="text-emerald-300/75">Deal / Draw</div>
                    <div className="font-bold text-white">
                      Deal {ruleset.dealSize} • Draw {ruleset.drawCount} / turn
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2.5 border border-white/5">
                    <div className="text-emerald-300/75">Going Out</div>
                    <div className="font-bold text-white">
                      Requires ≥ {ruleset.canastasRequiredToGoOut} Canasta
                      {ruleset.canastasRequiredToGoOut === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-black/25 p-2.5 border border-white/5">
                    <div className="text-emerald-300/75">Match Target</div>
                    <div className="font-bold text-white">
                      {ruleset.winScore === null
                        ? 'Single Hand'
                        : `${ruleset.winScore.toLocaleString()} points`}
                    </div>
                  </div>
                </div>
              </section>

              {/* Initial Meld Thresholds */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  Initial Meld Minimums (Start-of-Hand Score)
                </h3>
                <div className="overflow-hidden rounded-xl border border-emerald-200/15">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-black/35 text-emerald-200/80">
                      <tr>
                        <th className="px-3 py-2">Starting Match Score</th>
                        <th className="px-3 py-2 text-right">Minimum Card Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-black/15">
                      {ruleset.initialMeldThresholds.map((tier, idx) => {
                        const nextTier = ruleset.initialMeldThresholds[idx + 1];
                        const label =
                          tier.minScore === -Infinity
                            ? 'Negative (< 0)'
                            : nextTier
                              ? `${tier.minScore.toLocaleString()} – ${(nextTier.minScore - 5).toLocaleString()}`
                              : `${tier.minScore.toLocaleString()}+`;
                        const isActiveTier = activeRequired === tier.requiredPoints;
                        return (
                          <tr
                            key={tier.requiredPoints}
                            className={
                              isActiveTier
                                ? 'bg-amber-400/20 font-bold text-amber-200'
                                : ''
                            }
                          >
                            <td className="px-3 py-2">
                              {label}
                              {isActiveTier && (
                                <span className="ml-2 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-stone-950">
                                  YOUR TIER
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {tier.requiredPoints} pts
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-emerald-200/70">
                  Only base card face values count toward the initial meld (not Canasta or Red 3 bonuses). When taking the discard pile for an initial meld, only the top card counts before picking up the rest.
                </p>
              </section>

              {/* Melds, Wilds & Special Cards */}
              <section className="space-y-2.5 text-xs leading-relaxed">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Melds, Wilds &amp; Special Cards
                </h3>
                <ul className="space-y-2 list-disc pl-4 text-emerald-100/85">
                  <li>
                    <strong className="text-white">Valid Melds:</strong> At least{' '}
                    {ruleset.minMeldSize} cards of the same rank ({ruleset.minNaturalsPerMeld}+ naturals, at most{' '}
                    {ruleset.maxWildsPerMeld} wild cards).{' '}
                    {ruleset.requireNaturalMajority
                      ? 'Natural cards must strictly outnumber wild cards.'
                      : 'Classic Bicycle rule: 2 naturals + up to 3 wilds is legal.'}
                  </li>
                  <li>
                    <strong className="text-white">Canastas (7+ cards):</strong> A{' '}
                    <span className="text-rose-300 font-semibold">Natural Canasta</span> (0 wilds) scores +{ruleset.naturalCanastaBonus}; a{' '}
                    <span className="text-amber-300 font-semibold">Mixed Canasta</span> (1–{ruleset.maxWildsPerMeld} wilds) scores +{ruleset.mixedCanastaBonus}. Adding a wild to a Natural Canasta converts it to Mixed.
                  </li>
                  <li>
                    <strong className="text-white">Freezing &amp; Taking Discard Pile:</strong>{' '}
                    The pile is frozen before your initial meld or whenever a Wild Card is discarded sideways (or a Wild/Red 3 was turned on deal). Taking a <em>frozen</em> pile requires a natural pair matching the top card from your hand. Taking an <em>unfrozen</em> pile allows a natural pair, 1 natural + 1 wild, or adding to an existing meld.
                  </li>
                  <li>
                    <strong className="text-white">Red 3s:</strong> Automatically placed face-up and replaced when dealt or drawn from stock (no replacement if scooped from the discard pile). Worth +{ruleset.redThreeValue} each (+{ruleset.allFourRedThreesBonus} for all 4), or negative if you never make an initial meld.
                  </li>
                  <li>
                    <strong className="text-white">Black 3s:</strong> Discarding a Black 3 blocks the discard pile for the next player&apos;s turn only. Sets of 3–4 Black 3s (no wilds) may only be melded on the turn you go out.
                  </li>
                  <li>
                    <strong className="text-white">Stock Exhaustion:</strong> If the last stock card drawn is a Red 3, the hand ends immediately. Otherwise play continues without a stock; you must take an unfrozen top discard if it matches your existing meld.
                  </li>
                  {ruleset.allowPartnerGoOutPrompt && (
                    <li>
                      <strong className="text-white">Partner Permission (&ldquo;May I go out?&rdquo;):</strong>{' '}
                      In 4-Player Partnership, you may optionally ask your partner before or after drawing. Their answer is strictly binding for that turn: <strong>Yes</strong> requires you to go out if legally possible; <strong>No</strong> forbids going out this turn.
                    </li>
                  )}
                </ul>
              </section>
            </>
          ) : (
            <>
              {/* Card Point Values */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  Card Point Values
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between rounded-lg bg-black/25 px-3 py-2 border border-white/5">
                    <span>Joker (Wild)</span>
                    <strong className="text-amber-300">50 pts</strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/25 px-3 py-2 border border-white/5">
                    <span>Ace / Deuce (2)</span>
                    <strong className="text-amber-300">20 pts</strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/25 px-3 py-2 border border-white/5">
                    <span>K, Q, J, 10, 9, 8</span>
                    <strong className="text-white">10 pts</strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/25 px-3 py-2 border border-white/5">
                    <span>7, 6, 5, 4, Black 3</span>
                    <strong className="text-white">5 pts</strong>
                  </div>
                </div>
              </section>

              {/* Bonuses */}
              <section>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                  Bonuses &amp; Penalties
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Natural Canasta (7+ natural, 0 wilds)</span>
                    <strong className="text-rose-300">+{ruleset.naturalCanastaBonus}</strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Mixed Canasta (7+ cards, 1–3 wilds)</span>
                    <strong className="text-amber-300">+{ruleset.mixedCanastaBonus}</strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Red 3s (1–3 / all 4)</span>
                    <strong className="text-emerald-300">
                      +{ruleset.redThreeValue} ea / +{ruleset.allFourRedThreesBonus}
                    </strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Red 3s with NO initial meld</span>
                    <strong className="text-rose-400">
                      -{ruleset.redThreeValue} ea / -{ruleset.allFourRedThreesBonus}
                    </strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Going Out / Going Out Concealed</span>
                    <strong className="text-emerald-300">
                      +{ruleset.goingOutBonus} / +
                      {ruleset.goingOutBonus + ruleset.concealedGoingOutExtraBonus}
                    </strong>
                  </div>
                  <div className="flex justify-between rounded-lg bg-black/20 px-3 py-2">
                    <span>Cards left unmelded in hand</span>
                    <strong className="text-rose-400">− Face Value</strong>
                  </div>
                </div>
              </section>

              {/* Live Match Scoreboard */}
              {teams && (
                <section>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-300">
                    Live Match Scoreboard
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {teams.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-xl border border-amber-300/25 bg-black/30 p-3"
                      >
                        <div className="text-xs font-semibold text-emerald-200/80">
                          {t.name}
                        </div>
                        <div className="mt-0.5 text-2xl font-extrabold text-white">
                          {t.cumulativeScore.toLocaleString()}
                        </div>
                        <div className="mt-1 text-[11px] text-amber-200/85">
                          On table now: {liveMeldPoints(t)} meld pts •{' '}
                          {t.melds.filter((m) => m.isCanasta).length} Canasta(s)
                        </div>
                      </div>
                    ))}
                  </div>

                  {teams[0].handHistory.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-emerald-200/15">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-black/35 text-emerald-200/80">
                          <tr>
                            <th className="px-3 py-2">Hand</th>
                            {teams.map((t) => (
                              <th key={t.id} className="px-3 py-2 text-right">
                                {t.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-black/15">
                          {teams[0].handHistory.map((h0, idx) => (
                            <tr key={h0.handNumber}>
                              <td className="px-3 py-2 font-medium">#{h0.handNumber}</td>
                              {teams.map((t) => {
                                const h = t.handHistory[idx];
                                return (
                                  <td key={t.id} className="px-3 py-2 text-right">
                                    <span
                                      className={
                                        h.handNetScore >= 0
                                          ? 'text-emerald-300'
                                          : 'text-rose-300'
                                      }
                                    >
                                      {h.handNetScore >= 0 ? '+' : ''}
                                      {h.handNetScore}
                                    </span>{' '}
                                    <span className="text-emerald-200/50">
                                      ({h.cumulativeAfterHand})
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
