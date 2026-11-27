import React, { useEffect } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import type { PrivacyCurtainState } from '../../store';

export interface PrivacyCurtainProps {
  curtain: PrivacyCurtainState;
  onReveal: () => void;
}

export const PrivacyCurtain: React.FC<PrivacyCurtainProps> = ({
  curtain,
  onReveal,
}) => {
  useEffect(() => {
    if (!curtain.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onReveal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [curtain.open, onReveal]);

  if (!curtain.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center casino-felt p-6">
      <div className="w-full max-w-md rounded-3xl border border-amber-300/35 bg-black/45 p-8 text-center shadow-2xl backdrop-blur-md">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 border border-amber-300/30">
          <ShieldCheck className="h-7 w-7" />
        </div>

        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/90">
          Pass-and-Play Privacy Shield
        </p>
        <h2 className="mt-2 text-2xl font-extrabold text-white">
          {curtain.manualHide
            ? `${curtain.targetPlayerName}'s Hand Hidden`
            : `Pass Laptop to ${curtain.targetPlayerName}`}
        </h2>
        <p className="mt-2 text-sm text-emerald-100/80">
          Make sure other players aren&apos;t peeking before revealing your hand.
        </p>

        {curtain.recap.length > 0 && (
          <div className="mt-5 rounded-xl border border-emerald-200/15 bg-black/35 p-3.5 text-left">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300/80">
              Recent Table Activity
            </div>
            <ul className="space-y-1 text-xs text-emerald-100/90">
              {curtain.recap.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={onReveal}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-base font-bold text-stone-950 shadow-lg transition hover:bg-amber-300 cursor-pointer"
        >
          <Eye className="h-5 w-5" />
          Reveal {curtain.targetPlayerName}&apos;s Hand
        </button>
        <p className="mt-2 text-[11px] text-emerald-200/60">
          Tip: Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">Space</kbd> to reveal, or{' '}
          <kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono">H</kbd> anytime to hide.
        </p>
      </div>
    </div>
  );
};
