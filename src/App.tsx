import React from 'react';
import { useCanastaSession } from './store';
import { StartScreen } from './ui/screens/StartScreen';
import { TableScreen } from './ui/screens/TableScreen';

export const App: React.FC = () => {
  const session = useCanastaSession();

  if (!session.state || !session.view) {
    return (
      <StartScreen
        savedSummary={session.savedSummary}
        onStartNewMatch={session.startNewMatch}
        onResumeSaved={session.resumeSavedMatch}
        onDiscardSaved={session.discardSavedMatch}
      />
    );
  }

  return (
    <TableScreen
      state={session.state}
      view={session.view}
      mode={session.mode}
      botSpeed={session.botSpeed}
      onChangeBotSpeed={session.setBotSpeed}
      toast={session.toast}
      onDismissToast={session.dismissToast}
      curtain={session.curtain}
      onRevealCurtain={session.revealCurtain}
      onToggleManualHide={session.toggleManualHide}
      onDispatch={session.dispatch}
      onExitToMenu={session.exitToMenu}
    />
  );
};

export default App;
