const STORAGE_KEY = "file-manager-updater";

export interface UpdaterSettings {
  autoCheckOnStartup: boolean;
}

export const DEFAULT_UPDATER_SETTINGS: UpdaterSettings = {
  autoCheckOnStartup: true,
};

export function loadUpdaterSettings(): UpdaterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UPDATER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UpdaterSettings>;
    return {
      autoCheckOnStartup:
        parsed.autoCheckOnStartup ?? DEFAULT_UPDATER_SETTINGS.autoCheckOnStartup,
    };
  } catch {
    return { ...DEFAULT_UPDATER_SETTINGS };
  }
}

export function saveUpdaterSettings(settings: UpdaterSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
