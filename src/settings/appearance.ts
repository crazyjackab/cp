export type ThemeMode = "dark" | "light" | "system";
export type AccentColor = "blue" | "green" | "purple" | "orange";
export type FontSize = "small" | "medium" | "large";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  accent: AccentColor;
  fontSize: FontSize;
}

const STORAGE_KEY = "file-manager-appearance";

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: "dark",
  accent: "blue",
  fontSize: "medium",
};

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    return {
      themeMode: parsed.themeMode ?? DEFAULT_APPEARANCE.themeMode,
      accent: parsed.accent ?? DEFAULT_APPEARANCE.accent,
      fontSize: parsed.fontSize ?? DEFAULT_APPEARANCE.fontSize,
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.themeMode);
  root.dataset.accent = settings.accent;
  root.dataset.fontSize = settings.fontSize;
}
