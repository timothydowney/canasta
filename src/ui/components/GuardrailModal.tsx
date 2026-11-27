import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface GuardrailPrompt {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export interface GuardrailModalProps {
  prompt: GuardrailPrompt | null;
  onCancel: () => void;
}

export const GuardrailModal: React.FC<GuardrailModalProps> = ({
  prompt,
  onCancel,
}) => {
  if (!prompt) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-[#13291e] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-xl bg-amber-400/15 p-2.5 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{prompt.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-emerald-100/85">
              {prompt.description}
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-emerald-200/20 bg-white/5 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              prompt.onConfirm();
              onCancel();
            }}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-stone-950 hover:bg-amber-300 cursor-pointer"
          >
            {prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
