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
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export type SaveResult =
  | { status: "saved"; path: string }
  | { status: "downloaded" }
  | { status: "cancelled" }
  | { status: "error" };

/** Save text to a file. Under Tauri: native save dialog → write → reveal the
 *  file in the OS file manager. In the browser: fall back to a Blob download. */
export async function saveTextFile(
  suggestedName: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): Promise<SaveResult> {
  if (!IS_TAURI) {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { status: "downloaded" };
    } catch {
      return { status: "error" };
    }
  }
  try {
    const path = await save({
      defaultPath: suggestedName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return { status: "cancelled" };
    await invoke("write_file", { path, contents: content });
    try {
      await revealItemInDir(path);
    } catch {
      /* reveal is best-effort */
    }
    return { status: "saved", path };
  } catch {
    return { status: "error" };
  }
}

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

/** Subscribe to the "app-quit-requested" event the backend emits when the user
 *  closes the window while "閉じても計測を続ける" is OFF. The frontend flushes
 *  the running session, persists, and then quits. */
export async function onQuitRequested(cb: () => void): Promise<UnlistenFn> {
  if (!IS_TAURI) return () => {};
  return listen("app-quit-requested", () => cb());
}

/** Tell the backend whether closing the window should keep running in the tray
 *  (true) or fully quit the app (false). */
export async function syncCloseToTray(keep: boolean): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await invoke("set_close_to_tray", { keep });
  } catch {
    /* ignore */
  }
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
  if (!IS_TAURI) return;
  await update.downloadAndInstall();
  await relaunch();
}
