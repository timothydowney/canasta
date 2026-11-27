import type { Card, NaturalRank, Rank, Suit } from './types';

export const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export const NATURAL_RANKS: readonly NaturalRank[] = [
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

const ALL_SUITED_RANKS: readonly Exclude<Rank, 'JOKER'>[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
];

const SUIT_CODE: Record<Suit, string> = {
  clubs: 'C',
  diamonds: 'D',
  hearts: 'H',
  spades: 'S',
};

const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const RANK_SORT_ORDER: Record<Rank, number> = {
  '3': 0, // Black 3s first (Red 3s are auto-exposed)
  '4': 1,
  '5': 2,
  '6': 3,
  '7': 4,
  '8': 5,
  '9': 6,
  '10': 7,
  J: 8,
  Q: 9,
  K: 10,
  A: 11,
  '2': 12, // Wilds grouped cleanly at the right edge
  JOKER: 13,
};

const SUIT_SORT_ORDER: Record<Suit | 'joker', number> = {
  clubs: 0,
  diamonds: 1,
  spades: 2,
  hearts: 3,
  joker: 4,
};

/** Pure functional Mulberry32 step: returns [float in [0,1), nextRngState]. */
export function nextRng(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next >>> 0];
}

export function createDoubleDeck(): Card[] {
  const cards: Card[] = [];

  for (const deckIndex of [0, 1] as const) {
    for (const suit of SUITS) {
      const color: 'red' | 'black' =
        suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
      for (const rank of ALL_SUITED_RANKS) {
        cards.push({
          id: `d${deckIndex}-${rank}${SUIT_CODE[suit]}`,
          deckIndex,
          rank,
          suit,
          color,
        });
      }
    }

    cards.push({
      id: `d${deckIndex}-JOKER-R`,
      deckIndex,
      rank: 'JOKER',
      suit: 'joker',
      color: 'red',
    });
    cards.push({
      id: `d${deckIndex}-JOKER-B`,
      deckIndex,
      rank: 'JOKER',
      suit: 'joker',
      color: 'black',
    });
  }

  return cards;
}

export function shuffleCards(
  cards: readonly Card[],
  rngState: number,
): { cards: Card[]; rngState: number } {
  const result = cards.slice();
  let currentRng = rngState >>> 0;

  for (let i = result.length - 1; i > 0; i--) {
    const [rand, next] = nextRng(currentRng);
    currentRng = next;
    const j = Math.floor(rand * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }

  return { cards: result, rngState: currentRng };
}

export function isWildCard(card: Card): boolean {
  return card.rank === 'JOKER' || card.rank === '2';
}

export function isRedThree(card: Card): boolean {
  return card.rank === '3' && card.color === 'red';
}

export function isBlackThree(card: Card): boolean {
  return card.rank === '3' && card.color === 'black';
}

export function isNaturalRank(rank: Rank): rank is NaturalRank {
  return rank !== '2' && rank !== '3' && rank !== 'JOKER';
}

export function isNaturalCard(card: Card): boolean {
  return isNaturalRank(card.rank);
}

export function getCardPoints(card: Card): number {
  if (card.rank === 'JOKER') return 50;
  if (card.rank === 'A' || card.rank === '2') return 20;
  if (
    card.rank === 'K' ||
    card.rank === 'Q' ||
    card.rank === 'J' ||
    card.rank === '10' ||
    card.rank === '9' ||
    card.rank === '8'
  ) {
    return 10;
  }
  if (isRedThree(card)) return 100;
  // 4, 5, 6, 7, and Black 3
  return 5;
}

export function getCardLabel(card: Card): string {
  if (card.rank === 'JOKER') {
    return card.color === 'red' ? 'Red Joker' : 'Black Joker';
  }
  return `${card.rank}${SUIT_SYMBOL[card.suit as Suit]}`;
}

export function getCardAssetPath(card: Card): string {
  if (card.rank === 'JOKER') {
    return card.color === 'red' ? '/cards/JOKER-R.svg' : '/cards/JOKER-B.svg';
  }
  return `/cards/${card.rank}${SUIT_CODE[card.suit as Suit]}.svg`;
}

export function sortHandCards(cards: readonly Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const rankDiff = RANK_SORT_ORDER[a.rank] - RANK_SORT_ORDER[b.rank];
    if (rankDiff !== 0) return rankDiff;
    const suitDiff = SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit];
    if (suitDiff !== 0) return suitDiff;
    if (a.color !== b.color) return a.color === 'black' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
