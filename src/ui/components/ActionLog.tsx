import React, { useEffect, useRef } from 'react';
import { ScrollText } from 'lucide-react';
import type { ActionLogEntry } from '../../engine';

export interface ActionLogProps {
  entries: ActionLogEntry[];
}

export const ActionLog: React.FC<ActionLogProps> = ({ entries }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries.length]);

  return (
    <div className="flex h-28 sm:h-32 w-full flex-col rounded-xl border border-emerald-200/15 bg-black/25 overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-emerald-200/10 bg-black/20 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
        <ScrollText className="h-3.5 w-3.5 text-amber-300" />
        Table Log
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1 text-xs">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={
              entry.kind === 'red_three'
                ? 'text-rose-300 font-medium'
                : entry.kind === 'meld' || entry.kind === 'take_pile'
                  ? 'text-amber-200'
                  : entry.kind === 'hand_end'
                    ? 'text-emerald-300 font-semibold'
                    : 'text-emerald-100/80'
            }
          >
            {entry.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
