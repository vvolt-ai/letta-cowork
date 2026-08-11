import { useCallback, useEffect, useRef, useState } from "react";

import type { ServerEvent, ClientEvent } from "../types";

export function useIPC(onEvent: (event: ServerEvent) => void) {
  const [connected, setConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Subscribe to server events when running inside Electron.
    // Browser-only shells do not expose window.electron.
    const unsubscribe = window.electron?.onServerEvent?.((event: ServerEvent) => {
      onEvent(event);
    }) ?? (() => {});
    
    unsubscribeRef.current = unsubscribe;
    setConnected(Boolean(window.electron?.onServerEvent));

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setConnected(false);
    };
  }, [onEvent]);

  const sendEvent = useCallback((event: ClientEvent) => {
    if (!window.electron?.sendClientEvent) {
      console.warn('[useIPC] sendClientEvent unavailable outside Electron', event);
      return;
    }
    window.electron.sendClientEvent(event);
  }, []);

  return { connected, sendEvent };
}
