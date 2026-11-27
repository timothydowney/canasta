import React from 'react';
import { HelpCircle, Check, X } from 'lucide-react';
import { getCardPoints, type Card } from '../../engine';

export interface PartnerPromptModalProps {
  open: boolean;
  askerName: string;
  partnerHand: Card[];
  teamCanastas: number;
  onAnswer: (allow: boolean) => void;
}

export const PartnerPromptModal: React.FC<PartnerPromptModalProps> = ({
  open,
  askerName,
  partnerHand,
  teamCanastas,
  onAnswer,
}) => {
  if (!open) return null;

  const unmeldedPts = partnerHand.reduce((s, c) => s + getCardPoints(c), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-amber-400/50 bg-[#0f2f1f] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-amber-400/15 p-2.5 text-amber-300 border border-amber-300/30">
            <HelpCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Partner Permission (Binding)
            </p>
            <h3 className="mt-0.5 text-lg font-extrabold text-white">
              {askerName} asks: &ldquo;Partner, may I go out?&rdquo;
            </h3>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-emerald-200/15 bg-black/30 p-3 text-xs text-emerald-100/90 space-y-1">
          <div>
            Your current hand: <strong className="text-white">{partnerHand.length} cards</strong>{' '}
            (<strong className="text-rose-300">−{unmeldedPts} pts</strong> if hand ends now)
          </div>
          <div>
            Partnership Canastas on table:{' '}
            <strong className="text-amber-300">{teamCanastas}</strong>
          </div>
          <p className="pt-1 text-[11px] text-emerald-200/75">
            Your answer is binding: <strong>Yes</strong> requires {askerName} to go out this turn;{' '}
            <strong>No</strong> forbids going out this turn.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-sm font-bold text-rose-100 hover:bg-rose-500/30 cursor-pointer"
          >
            <X className="h-4 w-4" /> No — Keep Playing
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-extrabold text-stone-950 hover:bg-emerald-300 cursor-pointer"
          >
            <Check className="h-4 w-4" /> Yes — Go Out
          </button>
        </div>
      </div>
    </div>
  );
};
