import { MiniKit } from "@worldcoin/minikit-js";
import {
  Permission,
  RequestPermissionError,
  WalletAuthError,
} from "@worldcoin/minikit-js/commands";

/** True inside World App. World App injects its bridge before the page runs. */
export const insideWorldApp = MiniKit.isInWorldApp();

/** Must match `LINK_REQUEST_ID` in `@agentlatch/world`. */
export const LINK_REQUEST_ID = "link";

export function installWorldApp() {
  if (insideWorldApp) {
    MiniKit.install();
  }
}

export type SignedWalletAuth = {
  address: string;
  message: string;
  signature: string;
};

/** Asks World App to sign. Resolves null when the person closes the prompt. */
export async function signInWorldApp(input: {
  nonce: string;
  statement?: string;
  requestId?: string;
  expirationTime?: string;
}): Promise<SignedWalletAuth | null> {
  if (!insideWorldApp) {
    throw new Error("Open DSAP in World App to sign.");
  }
  try {
    const result = await MiniKit.walletAuth({
      nonce: input.nonce,
      statement: input.statement,
      requestId: input.requestId,
      expirationTime: input.expirationTime
        ? new Date(input.expirationTime)
        : undefined,
    });
    const { address, message, signature } = result.data;
    return { address, message, signature };
  } catch (error) {
    if (error instanceof WalletAuthError && error.code === "user_rejected") {
      return null;
    }
    throw error;
  }
}

/** `blocked` means World App will not ask again; the person turns it on in settings. */
export type NotificationState = "on" | "off" | "blocked" | "unknown";

export async function notificationState(): Promise<NotificationState> {
  if (!insideWorldApp) {
    return "unknown";
  }
  try {
    const result = await MiniKit.getPermissions();
    if (result.executedWith !== "minikit") {
      return "unknown";
    }
    const value: unknown = result.data.permissions.notifications;
    if (value === true) {
      return "on";
    }
    return value === false ? "off" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function enableNotifications(): Promise<NotificationState> {
  try {
    await MiniKit.requestPermission({ permission: Permission.Notifications });
    return "on";
  } catch (error) {
    if (!(error instanceof RequestPermissionError)) {
      throw error;
    }
    const code: string = error.error_code;
    if (code === "already_granted") {
      return "on";
    }
    if (code === "already_requested" || code === "permission_disabled") {
      return "blocked";
    }
    if (code === "user_rejected") {
      return "off";
    }
    throw new Error(`World App refused notifications: ${code}.`);
  }
}

/**
 * Opens `path` inside the mini app. Built by hand because
 * `MiniKit.getMiniAppUrl` encodes the path twice, and World App then ignores
 * it and opens the mini app home.
 */
export function miniAppUrl(appId: string, path: string): string {
  const url = new URL("https://world.org/mini-app");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("path", path.startsWith("/") ? path : `/${path}`);
  return url.toString();
}
