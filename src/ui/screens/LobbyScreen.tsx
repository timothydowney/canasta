import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeftRight,
  Bot,
  Check,
  Copy,
  LogOut,
  Play,
  Tv,
  User,
  Users,
  Wifi,
} from 'lucide-react';
import { getRulesetById, type BotDifficulty } from '../../engine';
import type { NetworkInfoResponse, RoomLobbyState } from '../../shared/protocol';

export interface LobbyScreenProps {
  lobby: RoomLobbyState;
  isHost: boolean;
  onConfigureSeat: (
    seatIndex: number,
    kind: 'open' | 'bot',
    botDifficulty?: BotDifficulty,
  ) => void;
  onSwapSeats: (seatA: number, seatB: number) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  lobby,
  isHost,
  onConfigureSeat,
  onSwapSeats,
  onStartMatch,
  onLeaveRoom,
}) => {
  const [netInfo, setNetInfo] = useState<NetworkInfoResponse | null>(null);
  const [selectedIp, setSelectedIp] = useState<string>(
    typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const ruleset = getRulesetById(lobby.rulesetId);
  const isPartnership = lobby.rulesetId === 'bicycle-4p-partnership';
  const humanCount = lobby.seats.filter((s) => s.occupantKind === 'human').length;

  useEffect(() => {
    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: NetworkInfoResponse | null) => {
        if (!data) return;
        setNetInfo(data);
        setSelectedIp(data.preferredIp);
      })
      .catch(() => {});
  }, []);

  const port =
    netInfo?.clientPort ??
    (typeof window !== 'undefined' && window.location.port
      ? Number(window.location.port)
      : 5173);
  const joinUrl = `http://${selectedIp}:${port}/?join=${lobby.roomCode}`;

  useEffect(() => {
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#062716', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [joinUrl]);

  const handleCopy = () => {
    void navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-dvh w-full casino-felt flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl rounded-3xl border border-amber-300/35 bg-black/45 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/15 pb-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest text-amber-200">
              <Wifi className="h-3 w-3" /> LAN Multi-Device Lobby
            </span>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black text-white">
              {ruleset.name}
            </h1>
            <p className="text-xs text-emerald-100/80">
              {lobby.hostDisplayMode === 'table_display'
                ? 'Living-Room TV / Shared Table Mode — Players join privately on phones'
                : 'Multi-Device Room — Players join on phones or separate laptops'}
            </p>
          </div>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
          >
            <LogOut className="h-4 w-4" /> Leave Room
          </button>
        </div>

        {/* Main 2-Column Lobby Body */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left: QR Code & Join Instructions */}
          <div className="md:col-span-5 flex flex-col items-center rounded-2xl border border-amber-300/30 bg-black/35 p-5 text-center">
            <div className="text-xs font-bold uppercase tracking-widest text-emerald-200/80">
              Room Code
            </div>
            <div className="mt-1 font-mono text-4xl font-black tracking-[0.22em] text-amber-300">
              {lobby.roomCode}
            </div>

            {qrDataUrl && (
              <div className="mt-4 rounded-2xl bg-white p-2.5 shadow-xl">
                <img
                  src={qrDataUrl}
                  alt={`QR Code to join room ${lobby.roomCode}`}
                  className="h-44 w-44 sm:h-48 sm:w-48"
                />
              </div>
            )}

            <p className="mt-3 text-xs text-emerald-100/85">
              Scan with your phone camera on the same Wi-Fi, or visit:
            </p>

            <div className="mt-2 flex w-full items-center gap-1.5 rounded-xl border border-white/15 bg-black/45 px-2.5 py-1.5">
              <code className="flex-1 truncate text-[11px] text-amber-200">
                {joinUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-lg bg-white/10 p-1.5 text-emerald-100 hover:bg-white/20 cursor-pointer"
                title="Copy Join URL"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Smart Multi-Adapter Dropdown (handles Windows + WSL virtual adapters cleanly) */}
            {isHost && netInfo && netInfo.candidates.length > 1 && (
              <div className="mt-3 w-full text-left">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-emerald-200/70">
                  Network Adapter (QR IP)
                </label>
                <select
                  value={selectedIp}
                  onChange={(e) => setSelectedIp(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                >
                  {netInfo.candidates.map((c) => (
                    <option key={`${c.name}-${c.address}`} value={c.address}>
                      {c.address} — {c.name} {c.isVirtual ? '(Virtual)' : '(LAN)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isHost && lobby.hostDisplayMode === 'table_display' && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300/25 bg-emerald-950/60 p-2.5 text-left text-[11px] text-emerald-100/85">
                <Tv className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  <strong>Google TV Streamer tip:</strong> In Chrome, use{' '}
                  <em>Cast → Cast Tab</em> to put this table on your big TV while everyone plays from their phones.
                </span>
              </div>
            )}
          </div>

          {/* Right: Seats & Host Controls */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-amber-200">
                Table Seats ({lobby.seats.filter((s) => s.occupantKind !== 'open').length} /{' '}
                {lobby.seats.length})
              </h2>
              {isHost && isPartnership && (
                <button
                  type="button"
                  onClick={() => onSwapSeats(1, 2)}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-white/10 cursor-pointer"
                  title="Swap Seat 2 and Seat 3 to adjust teams"
                >
                  <ArrowLeftRight className="h-3 w-3" /> Swap Teams (2 ↔ 3)
                </button>
              )}
            </div>

            <div className="space-y-2">
              {lobby.seats.map((seat) => {
                const isTeam0 = isPartnership && seat.seatIndex % 2 === 0;
                const isTeam1 = isPartnership && seat.seatIndex % 2 === 1;
                return (
                  <div
                    key={seat.seatIndex}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3.5 ${
                      isTeam0
                        ? 'border-emerald-300/35 bg-emerald-950/40'
                        : isTeam1
                          ? 'border-amber-300/30 bg-black/30'
                          : 'border-white/15 bg-black/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          seat.occupantKind === 'human'
                            ? 'bg-emerald-400/20 text-emerald-300'
                            : seat.occupantKind === 'bot'
                              ? 'bg-amber-400/20 text-amber-300'
                              : 'bg-white/10 text-emerald-100/40'
                        }`}
                      >
                        {seat.occupantKind === 'bot' ? (
                          <Bot className="h-5 w-5" />
                        ) : (
                          <User className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">
                            {seat.occupantKind === 'open'
                              ? `Seat ${seat.seatIndex + 1} — Waiting for player…`
                              : seat.name}
                          </span>
                          {isPartnership && (
                            <span
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                isTeam0
                                  ? 'bg-emerald-400/20 text-emerald-200'
                                  : 'bg-amber-400/20 text-amber-200'
                              }`}
                            >
                              <Users className="h-2.5 w-2.5" />
                              {isTeam0 ? 'Team 1' : 'Team 2'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-emerald-200/75">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${
                              seat.occupantKind === 'open'
                                ? 'bg-stone-500'
                                : seat.connected
                                  ? 'bg-emerald-400'
                                  : 'bg-amber-400 animate-pulse'
                            }`}
                          />
                          {seat.occupantKind === 'human'
                            ? seat.connected
                              ? 'Connected'
                              : 'Reconnecting…'
                            : seat.occupantKind === 'bot'
                              ? `Computer (${seat.botDifficulty ?? 'normal'})`
                              : 'Open seat (auto-fills with Bot if left open)'}
                        </div>
                      </div>
                    </div>

                    {isHost && seat.occupantKind !== 'human' && (
                      <div className="flex items-center gap-1">
                        {(['easy', 'normal', 'hard'] as const).map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() =>
                              onConfigureSeat(seat.seatIndex, 'bot', diff)
                            }
                            className={`rounded-lg border px-2 py-1 text-[11px] font-bold capitalize cursor-pointer ${
                              seat.occupantKind === 'bot' &&
                              seat.botDifficulty === diff
                                ? 'border-amber-400 bg-amber-400/25 text-amber-200'
                                : 'border-white/15 bg-black/35 text-emerald-100/70 hover:text-white'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                        {seat.occupantKind === 'bot' && (
                          <button
                            type="button"
                            onClick={() => onConfigureSeat(seat.seatIndex, 'open')}
                            className="ml-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-emerald-200/80 hover:bg-white/15 cursor-pointer"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isHost ? (
              <div className="pt-3">
                <button
                  type="button"
                  disabled={humanCount === 0}
                  onClick={onStartMatch}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3.5 text-base font-extrabold text-stone-950 shadow-xl transition hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
                >
                  <Play className="h-5 w-5 fill-current" />
                  Deal Cards &amp; Start Match
                </button>
                <p className="mt-1.5 text-center text-[11px] text-emerald-200/70">
                  Any seats still open when you start will automatically fill with Normal Bots.
                </p>
              </div>
            ) : (
              <div className="mt-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-center text-sm text-amber-200">
                You&apos;re seated! Waiting for the Host to start the match…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
