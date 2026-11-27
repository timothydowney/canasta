/**
 * Lightweight, 100% offline Web Audio API synthesizer for realistic
 * card-table sound effects (deal riffle, card click, draw swoosh, felt discard,
 * pile scoop, meld snap, Canasta chime, Red 3 sparkle, freeze chime).
 */

const MUTE_STORAGE_KEY = 'canasta_sound_muted_v1';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        this.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
      }
    } catch {
      this.muted = false;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
      }
    } catch {
      // ignore
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** Crisp filtered noise burst resembling card paper snap / slide. */
  private playNoiseBurst(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    filterFreq: number,
    q: number,
    volume: number,
    filterType: BiquadFilterType = 'bandpass',
    freqEnd?: number,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, startTime);
    if (freqEnd !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(80, freqEnd),
        startTime + duration,
      );
    }
    filter.Q.setValueAtTime(q, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(0.008, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }

  /** Warm soft pitched tone for chimes & UI feedback. */
  private playTone(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    freqStart: number,
    volume: number,
    type: OscillatorType = 'triangle',
    freqEnd?: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        startTime + duration,
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /** Subtle crisp card flick when selecting/deselecting a card in hand. */
  playCardClick(selected = true): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playNoiseBurst(ctx, t, 0.032, selected ? 2600 : 1900, 1.8, 0.14, 'bandpass');
    this.playTone(ctx, t, 0.04, selected ? 520 : 390, 0.045, 'sine', selected ? 640 : 310);
  }

  /** Crisp paper riffle when dealing a new hand. */
  playDeal(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const offset = i * 0.046;
      const pitch = 1700 + i * 140;
      this.playNoiseBurst(ctx, t + offset, 0.048, pitch, 1.4, 0.15, 'bandpass', pitch * 0.7);
      this.playTone(ctx, t + offset, 0.035, 190 + i * 12, 0.035, 'triangle', 120);
    }
  }

  /** Smooth card slide when drawing from the stock. */
  playDraw(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playNoiseBurst(ctx, t, 0.085, 1400, 1.2, 0.16, 'bandpass', 2800);
    this.playNoiseBurst(ctx, t + 0.095, 0.085, 1500, 1.2, 0.14, 'bandpass', 2900);
  }

  /** Soft felt thud + light card slap when discarding. */
  playDiscard(frozePile = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playNoiseBurst(ctx, t, 0.06, 1200, 1.0, 0.17, 'lowpass', 450);
    this.playTone(ctx, t, 0.065, 175, 0.09, 'sine', 85);
    if (frozePile) {
      // Crystalline freeze shimmer
      this.playTone(ctx, t + 0.05, 0.24, 1046.5, 0.06, 'sine', 1318.5);
      this.playTone(ctx, t + 0.12, 0.28, 1568, 0.05, 'triangle');
    }
  }

  /** Satisfying multi-card scoop when picking up the discard pile. */
  playTakePile(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const offset = i * 0.042;
      this.playNoiseBurst(ctx, t + offset, 0.065, 1500 + i * 250, 1.1, 0.15, 'bandpass', 2600);
    }
    this.playTone(ctx, t + 0.08, 0.18, 440, 0.06, 'triangle', 587.3);
  }

  /** Crisp card placement snaps + warm confirmation chord when melding. */
  playMeld(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.playNoiseBurst(ctx, t + i * 0.04, 0.045, 2000 + i * 200, 1.5, 0.14, 'bandpass');
    }
    this.playTone(ctx, t + 0.05, 0.22, 523.25, 0.065, 'triangle'); // C5
    this.playTone(ctx, t + 0.11, 0.26, 659.25, 0.065, 'triangle'); // E5
  }

  /** Celebratory warm arpeggio when completing a Natural or Mixed Canasta. */
  playCanasta(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      this.playTone(ctx, t + i * 0.075, 0.35, freq, 0.085, 'triangle');
    });
  }

  /** Bright delicate double chime when a Red 3 is exposed. */
  playRedThree(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playTone(ctx, t, 0.16, 880, 0.06, 'sine');
    this.playTone(ctx, t + 0.09, 0.24, 1174.66, 0.065, 'sine');
  }

  /** Soft rewind swoosh for undoing turn melds. */
  playUndo(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playNoiseBurst(ctx, t, 0.08, 2400, 1.3, 0.12, 'bandpass', 1100);
    this.playTone(ctx, t, 0.12, 420, 0.05, 'sine', 290);
  }

  /** Warm fanfare when a hand or match ends. */
  playHandEnd(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const chord = [392.0, 523.25, 659.25, 783.99];
    chord.forEach((freq, i) => {
      this.playTone(ctx, t + i * 0.08, 0.48, freq, 0.075, 'triangle');
    });
  }

  /** Gentle muted double thud for invalid move / error notice. */
  playError(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playTone(ctx, t, 0.09, 180, 0.08, 'sine', 130);
    this.playTone(ctx, t + 0.1, 0.11, 150, 0.07, 'sine', 110);
  }

  /** Subtle click for general UI buttons (drawer, curtain reveal). */
  playUiClick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.playTone(ctx, t, 0.045, 620, 0.04, 'sine', 500);
  }
}

export const soundEngine = new SoundEngine();
