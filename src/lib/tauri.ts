// Thin wrappers around the Tauri APIs the app uses. Every call is a no-op
// when running outside Tauri (e.g. `vite` in a plain browser) so the UI still
// works for design review.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import {
  disable as autostartDisable,
  enable as autostartEnable,
  isEnabled as autostartIsEnabled,
} from "@tauri-apps/plugin-autostart";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// --- window / tray -----------------------------------------------------
export async function hideToTray(): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await getCurrentWindow().hide();
  } catch {
    /* ignore */
  }
}

export async function minimizeWindow(): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* ignore */
  }
}

export async function quitApp(): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await invoke("quit_app");
  } catch {
    /* ignore */
  }
}

/** Subscribe to the "toggle-timer" event (tray menu + global shortcut). */
export async function onToggleTimer(cb: () => void): Promise<UnlistenFn> {
  if (!IS_TAURI) return () => {};
  return listen("toggle-timer", () => cb());
}

// --- global shortcut ---------------------------------------------------
export async function syncGlobalShortcut(
  accelerator: string,
  enabled: boolean,
): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await invoke("update_global_shortcut", { accelerator, enabled });
  } catch {
    /* ignore */
  }
}

// --- autostart ---------------------------------------------------------
export async function syncAutostart(enabled: boolean): Promise<void> {
  if (!IS_TAURI) return;
  try {
    const on = await autostartIsEnabled();
    if (enabled && !on) await autostartEnable();
    else if (!enabled && on) await autostartDisable();
  } catch {
    /* ignore */
  }
}

// --- notifications -----------------------------------------------------
export async function notify(title: string, body: string): Promise<void> {
  if (!IS_TAURI) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
    /* ignore */
  }
}

// --- updater -----------------------------------------------------------
export async function checkForUpdate(): Promise<Update | null> {
  if (!IS_TAURI) return null;
  try {
    return await check();
  } catch {
    return null;
  }
}

export async function installUpdateAndRelaunch(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
