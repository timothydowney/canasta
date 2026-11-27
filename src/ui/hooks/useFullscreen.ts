import { useCallback, useEffect, useState } from 'react';

interface FullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const isSupported =
    typeof document !== 'undefined' &&
    Boolean(
      document.fullscreenEnabled ||
        (document as FullscreenDocument).webkitFullscreenEnabled,
    );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const sync = () => {
      const doc = document as FullscreenDocument;
      setIsFullscreen(
        Boolean(doc.fullscreenElement || doc.webkitFullscreenElement),
      );
    };
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (typeof document === 'undefined') return;
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else {
        if (root.requestFullscreen) await root.requestFullscreen();
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      }
    } catch {
      // Ignore if blocked by OS/browser gesture rules
    }
  }, []);

  return { isSupported, isFullscreen, toggleFullscreen };
}
