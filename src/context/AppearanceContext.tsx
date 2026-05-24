import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyAppearance,
  DEFAULT_APPEARANCE,
  loadAppearance,
  saveAppearance,
  type AppearanceSettings,
  type AccentColor,
  type FontSize,
  type ThemeMode,
} from "../settings/appearance";

interface AppearanceContextValue {
  settings: AppearanceSettings;
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  setFontSize: (size: FontSize) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(() =>
    loadAppearance(),
  );

  const update = useCallback((patch: Partial<AppearanceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      applyAppearance(next);
      return next;
    });
  }, []);

  useEffect(() => {
    applyAppearance(settings);
  }, [settings]);

  useEffect(() => {
    if (settings.themeMode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyAppearance(settings);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      settings,
      setThemeMode: (themeMode) => update({ themeMode }),
      setAccent: (accent) => update({ accent }),
      setFontSize: (fontSize) => update({ fontSize }),
      resetAppearance: () => {
        setSettings({ ...DEFAULT_APPEARANCE });
        saveAppearance(DEFAULT_APPEARANCE);
        applyAppearance(DEFAULT_APPEARANCE);
      },
    }),
    [settings, update],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error("useAppearance must be used within AppearanceProvider");
  }
  return ctx;
}
