import { useState, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";

export function useCoworkSettings() {
  const coworkSettings = useAppStore((s) => s.coworkSettings);
  const setCoworkSettings = useAppStore((s) => s.setCoworkSettings);
  const [showCoworkSettings, setShowCoworkSettings] = useState(false);

  const updateCoworkSettings = useCallback((updates: Partial<typeof coworkSettings>) => {
    setCoworkSettings({ ...coworkSettings, ...updates });
  }, [coworkSettings, setCoworkSettings]);

  return {
    coworkSettings,
    showCoworkSettings,
    setShowCoworkSettings,
    updateCoworkSettings,
  };
}
