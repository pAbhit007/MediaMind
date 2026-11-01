import { DEFAULT_SETTINGS, type Settings } from './schema';

/** User settings live in chrome.storage.local (small, synchronous-feeling, survives reinstall of the DB). */
export async function getSettings(): Promise<Settings> {
  const got = (await chrome.storage.local.get({ ...DEFAULT_SETTINGS })) as Partial<Settings>;
  return {
    onboardingDone: got.onboardingDone ?? DEFAULT_SETTINGS.onboardingDone,
    purpose: got.purpose ?? DEFAULT_SETTINGS.purpose,
    dailyGoal: got.dailyGoal ?? DEFAULT_SETTINGS.dailyGoal,
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}
