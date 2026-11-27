import React from 'react';
import { getCardAssetPath, getCardLabel, isWildCard, type Card } from '../../engine';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'mobile-m' | 'mobile-l' | 'mobile-xl';

const SIZE_CLASSES: Record<CardSize, string> = {
  xs: 'w-9 h-[50px]',
  sm: 'w-12 h-[67px] sm:w-14 sm:h-[78px]',
  md: 'w-[66px] h-[92px] sm:w-[76px] sm:h-[106px]',
  lg: 'w-[80px] h-[112px] sm:w-[92px] sm:h-[129px]',
  // Generous mobile carousel sizes with exact 5:7 aspect ratio across portrait & short landscape viewports
  'mobile-m': 'h-[min(154px,38dvh)] w-[calc(min(154px,38dvh)*5/7)]',
  'mobile-l': 'h-[min(198px,43dvh)] w-[calc(min(198px,43dvh)*5/7)]',
  'mobile-xl': 'h-[min(248px,48dvh)] w-[calc(min(248px,48dvh)*5/7)]',
};

export interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  backColor?: 'blue' | 'red';
  size?: CardSize;
  selected?: boolean;
  rotated?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  isNew?: boolean;
  showWildBadge?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  backColor = 'blue',
  size = 'md',
  selected = false,
  rotated = false,
  dimmed = false,
  highlight = false,
  isNew = false,
  showWildBadge = false,
  onClick,
  className = '',
  style,
}) => {
  const src =
    faceDown || !card
      ? backColor === 'red'
        ? '/cards/BACK-RED.svg'
        : '/cards/BACK-BLUE.svg'
      : getCardAssetPath(card);

  const label = faceDown || !card ? 'Face-down card' : getCardLabel(card);
  const interactive = Boolean(onClick);
  const isWild = !faceDown && card ? isWildCard(card) : false;
  const isMobileLarge = size.startsWith('mobile-');

  const classes = [
    'relative shrink-0 select-none rounded-lg bg-white p-[2px] transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300',
    SIZE_CLASSES[size],
    selected
      ? isMobileLarge
        ? '-translate-y-4 card-selected-shadow z-30'
        : '-translate-y-3.5 card-selected-shadow z-30'
      : isNew
        ? '-translate-y-2 card-new-shadow card-new-animate'
        : 'card-shadow',
    interactive && !dimmed && !selected
      ? 'cursor-pointer hover:-translate-y-2 hover:z-20'
      : interactive
        ? 'cursor-pointer'
        : 'cursor-default',
    rotated ? 'rotate-90' : '',
    highlight && !selected ? 'ring-2 ring-amber-300/90' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <img
        src={src}
        alt={label}
        draggable={false}
        className={`h-full w-full rounded-[5px] object-contain pointer-events-none ${
          dimmed ? 'brightness-[0.78] saturate-[0.75]' : ''
        }`}
      />
      {showWildBadge && isWild && (
        <span
          className={`pointer-events-none absolute top-1.5 right-1.5 rounded bg-amber-400/95 font-black uppercase tracking-wider text-stone-950 shadow ${
            isMobileLarge ? 'px-1.5 py-0.5 text-[10px]' : 'px-1 py-[1px] text-[8px]'
          }`}
        >
          Wild
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div aria-label={label} style={style} className={classes}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      style={style}
      className={classes}
    >
      {content}
    </button>
  );
};
