import React, { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getCardLabel,
  getCardPoints,
  isWildCard,
  type Card,
  type Rank,
} from '../../engine';
import { PlayingCard, type CardSize } from './PlayingCard';

export type MobileCardScale = 'm' | 'l' | 'xl';

export interface MobileCardHandProps {
  cards: Card[];
  scale: MobileCardScale;
  selectedIds: Set<string>;
  stagedIds: Set<string>;
  newCardIds?: Set<string>;
  dimmedIds?: Set<string>;
  disabled?: boolean;
  onToggleCard: (cardId: string) => void;
}

const SCALE_TO_CARD_SIZE: Record<MobileCardScale, CardSize> = {
  m: 'mobile-m',
  l: 'mobile-l',
  xl: 'mobile-xl',
};

const GROUP_OVERLAP: Record<MobileCardScale, string> = {
  m: '-ml-14',
  l: '-ml-[74px]',
  xl: '-ml-[94px]',
};

/**
 * Large, horizontally swipeable Mobile Carousel Fan:
 * - Renders huge, TV-glance-friendly playing cards (M / L / XL) in a smooth
 *   touch-swipeable carousel clustered by rank with clear gaps between ranks.
 * - Includes an interactive Rank Mini-Map strip right below so players always
 *   see their full hand composition at a glance and can tap any rank to jump!
 */
export const MobileCardHand: React.FC<MobileCardHandProps> = ({
  cards,
  scale,
  selectedIds,
  stagedIds,
  newCardIds,
  dimmedIds,
  disabled = false,
  onToggleCard,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const visibleCards = useMemo(
    () => cards.filter((c) => !stagedIds.has(c.id)),
    [cards, stagedIds],
  );

  const groups = useMemo(() => {
    const result: Array<{ key: string; rank: Rank; label: string; cards: Card[] }> = [];
    for (const card of visibleCards) {
      const last = result[result.length - 1];
      if (last && last.rank === card.rank) {
        last.cards.push(card);
      } else {
        const label =
          card.rank === 'JOKER'
            ? 'JKR'
            : card.rank === '3'
              ? '3♣'
              : card.rank;
        result.push({
          key: `${card.rank}-${card.id}`,
          rank: card.rank,
          label,
          cards: [card],
        });
      }
    }
    return result;
  }, [visibleCards]);

  const selectedPoints = visibleCards
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + getCardPoints(c), 0);

  const newlyAcquiredVisible = newCardIds
    ? visibleCards.filter((c) => newCardIds.has(c.id))
    : [];

  const scrollByAmount = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: dir * 220,
      behavior: 'smooth',
    });
  };

  const scrollToGroup = (groupKey: string) => {
    const el = groupRefs.current.get(groupKey);
    el?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  };

  const cardSize = SCALE_TO_CARD_SIZE[scale];
  const overlapClass = GROUP_OVERLAP[scale];

  return (
    <div className="flex w-full flex-col gap-2 [@media(max-height:500px)]:gap-1">
      {/* Slim readable status summary */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-2 text-xs sm:text-sm text-emerald-100/90">
        <span className="font-semibold">
          <strong className="text-white">{visibleCards.length}</strong> card
          {visibleCards.length === 1 ? '' : 's'}
          {stagedIds.size > 0 && (
            <span className="ml-1 text-amber-300">(+{stagedIds.size} staged)</span>
          )}
        </span>
        {newlyAcquiredVisible.length > 0 && (
          <span className="rounded-full border border-emerald-300/60 bg-emerald-400/20 px-2.5 py-0.5 text-xs font-bold text-emerald-200">
            {newlyAcquiredVisible.length <= 3
              ? `Drew: ${newlyAcquiredVisible.map(getCardLabel).join(', ')}`
              : `Picked up ${newlyAcquiredVisible.length}`}
          </span>
        )}
        {selectedIds.size > 0 && (
          <span className="rounded-full border border-amber-300/60 bg-amber-400/25 px-2.5 py-0.5 text-xs font-extrabold text-amber-200">
            {selectedIds.size} selected ({selectedPoints} pts)
          </span>
        )}
      </div>

      {/* Swipeable Carousel Stage with Left/Right Quick-Scroll Arrows */}
      <div className="relative w-full">
        <button
          type="button"
          onClick={() => scrollByAmount(-1)}
          aria-label="Scroll hand left"
          className="absolute left-1 top-1/2 z-[45] -translate-y-1/2 flex h-11 w-9 items-center justify-center rounded-full border border-amber-300/40 bg-black/65 text-amber-200 shadow-lg backdrop-blur-xs active:scale-95 cursor-pointer"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={() => scrollByAmount(1)}
          aria-label="Scroll hand right"
          className="absolute right-1 top-1/2 z-[45] -translate-y-1/2 flex h-11 w-9 items-center justify-center rounded-full border border-amber-300/40 bg-black/65 text-amber-200 shadow-lg backdrop-blur-xs active:scale-95 cursor-pointer"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        <div
          ref={scrollerRef}
          className="no-scrollbar w-full overflow-x-auto touch-pan-x px-11 pt-5 pb-2 [@media(max-height:500px)]:pt-4 [@media(max-height:500px)]:pb-1 scroll-smooth"
        >
          <div className="mx-auto flex w-max items-end gap-4">
            {groups.map((group) => (
              <div
                key={group.key}
                ref={(node) => {
                  if (node) groupRefs.current.set(group.key, node);
                  else groupRefs.current.delete(group.key);
                }}
                className="flex items-end shrink-0"
              >
                {group.cards.map((card, idx) => {
                  const isSelected = selectedIds.has(card.id);
                  const isDimmed = dimmedIds?.has(card.id) ?? false;
                  const isNew = newCardIds?.has(card.id) ?? false;
                  return (
                    <div
                      key={card.id}
                      className={`relative shrink-0 ${idx === 0 ? '' : overlapClass} hover:!z-40`}
                      style={{ zIndex: isSelected ? 35 : idx + 1 }}
                    >
                      <PlayingCard
                        card={card}
                        size={cardSize}
                        selected={isSelected}
                        isNew={isNew}
                        dimmed={disabled || isDimmed}
                        showWildBadge
                        onClick={disabled ? undefined : () => onToggleCard(card.id)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Rank Mini-Map Strip (always shows full hand at a glance; tap any rank to jump) */}
      <div className="no-scrollbar flex flex-wrap items-center justify-center gap-1.5 px-3 [@media(max-height:500px)]:flex-nowrap [@media(max-height:500px)]:justify-center [@media(max-height:500px)]:overflow-x-auto [@media(max-height:500px)]:pb-0">
        {groups.map((group) => {
          const hasSelected = group.cards.some((c) => selectedIds.has(c.id));
          const hasNew = group.cards.some((c) => newCardIds?.has(c.id));
          const isWild = isWildCard(group.cards[0]);
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => scrollToGroup(group.key)}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-extrabold transition active:scale-95 cursor-pointer [@media(max-height:500px)]:px-2 [@media(max-height:500px)]:py-0.5 ${
                hasSelected
                  ? 'border-amber-300 bg-amber-400 text-stone-950 shadow'
                  : hasNew
                    ? 'border-emerald-300 bg-emerald-500/30 text-emerald-100'
                    : isWild
                      ? 'border-amber-400/50 bg-amber-400/15 text-amber-200'
                      : 'border-white/15 bg-black/35 text-emerald-100/90 hover:bg-black/50'
              }`}
            >
              <span>{group.label}</span>
              {group.cards.length > 1 && (
                <span className="opacity-80">×{group.cards.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
