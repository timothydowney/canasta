import React, { useMemo, useState } from 'react';
import { useCanastaSession, useRemoteCanastaSession } from './store';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { PhoneControllerScreen } from './ui/screens/PhoneControllerScreen';
import { StartScreen } from './ui/screens/StartScreen';
import { TableDisplayScreen } from './ui/screens/TableDisplayScreen';
import { TableScreen } from './ui/screens/TableScreen';

export const App: React.FC = () => {
  const local = useCanastaSession();
  const remote = useRemoteCanastaSession();

  const [preferPhoneMode, setPreferPhoneMode] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );

  const initialJoinCode = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  }, []);

  // 1. Remote LAN Room Active
  if (remote.lobby) {
    if (remote.lobby.status === 'LOBBY') {
      return (
        <LobbyScreen
          lobby={remote.lobby}
          isHost={remote.isHost}
          onConfigureSeat={remote.configureSeat}
          onSwapSeats={remote.swapSeats}
          onStartMatch={remote.startMatch}
          onLeaveRoom={remote.leaveRoom}
        />
      );
    }

    // Playing — Shared TV / Laptop Display Mode (zero private hands!)
    if (remote.role === 'table_display' && remote.tableView) {
      return (
        <TableDisplayScreen
          lobby={remote.lobby}
          view={remote.tableView}
          isHost={remote.isHost}
          soundMuted={remote.soundMuted}
          onToggleSound={remote.toggleSound}
          toast={remote.toast}
          onDismissToast={remote.dismissToast}
          onChangeBotSpeed={remote.setBotSpeed}
          onSubstituteBot={(seatIdx) => remote.substituteBot(seatIdx, 'normal')}
          onDispatch={remote.dispatchAction}
          onLeaveRoom={remote.leaveRoom}
        />
      );
    }

    // Playing — Remote Player (Phone Controller OR Full Table View on laptop/tablet)
    if (remote.role === 'player' && remote.playerView) {
      if (preferPhoneMode) {
        return (
          <PhoneControllerScreen
            lobby={remote.lobby}
            view={remote.playerView}
            soundMuted={remote.soundMuted}
            onToggleSound={remote.toggleSound}
            toast={remote.toast}
            onDismissToast={remote.dismissToast}
            onDispatch={remote.dispatchAction}
            onSwitchToFullTable={() => setPreferPhoneMode(false)}
            onLeaveRoom={remote.leaveRoom}
          />
        );
      }

      return (
        <TableScreen
          state={null}
          view={remote.playerView}
          mode="solo_bots"
          botSpeed={remote.lobby.botSpeed}
          onChangeBotSpeed={remote.isHost ? remote.setBotSpeed : undefined}
          soundMuted={remote.soundMuted}
          onToggleSound={remote.toggleSound}
          toast={remote.toast}
          onDismissToast={remote.dismissToast}
          curtain={{ open: false, targetPlayerName: '', recap: [], manualHide: false }}
          hideHandForBotInterlude={false}
          onRevealCurtain={() => {}}
          onToggleManualHide={() => {}}
          onDispatch={remote.dispatchAction}
          onSwitchToPhoneMode={() => setPreferPhoneMode(true)}
          roomCode={remote.roomCode}
          onExitToMenu={remote.leaveRoom}
        />
      );
    }
  }

  // 2. Local Offline Match Active
  if (local.state && local.view) {
    return (
      <TableScreen
        state={local.state}
        view={local.view}
        mode={local.mode}
        botSpeed={local.botSpeed}
        onChangeBotSpeed={local.setBotSpeed}
        soundMuted={local.soundMuted}
        onToggleSound={local.toggleSoundMuted}
        toast={local.toast}
        onDismissToast={local.dismissToast}
        curtain={local.curtain}
        hideHandForBotInterlude={local.hideHandForBotInterlude}
        onRevealCurtain={local.revealCurtain}
        onToggleManualHide={local.toggleManualHide}
        onDispatch={local.dispatch}
        onExitToMenu={local.exitToMenu}
      />
    );
  }

  // 3. Start Screen
  return (
    <StartScreen
      savedSummary={local.savedSummary}
      initialJoinCode={initialJoinCode}
      remoteError={remote.toast?.kind === 'error' ? remote.toast.message : null}
      onStartNewMatch={local.startNewMatch}
      onResumeSaved={local.resumeSavedMatch}
      onDiscardSaved={local.discardSavedMatch}
      onHostLanRoom={remote.createRoom}
      onJoinLanRoom={remote.joinRoom}
    />
  );
};

export default App;
