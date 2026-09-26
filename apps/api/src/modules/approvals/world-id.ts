import {
  type DeviceOutcome,
  type WorldIdSettings,
  waitForDeviceCheck,
} from "@agentlatch/world";

/** World ID for Agents client from the API env. The secret never leaves the API. */
export function worldIdSettings(): WorldIdSettings | null {
  const issuer = process.env.WORLD_OIDC_ISSUER?.trim();
  const clientId = process.env.WORLD_CLIENT_ID?.trim();
  const clientSecret = process.env.WORLD_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) {
    return null;
  }
  return { issuer, clientId, clientSecret };
}

export type WatchedCheck = {
  id: string;
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  pollInterval: number;
  startedAt: Date;
  expiresAt: Date;
  /** The approval's expiry. Polling stops there even if World's code lives longer. */
  deadline: Date;
};

export type SettleCheck = (
  checkId: string,
  outcome: DeviceOutcome,
) => Promise<void>;

// One poller per check. A restart resumes waiting checks from the database.
const watching = new Map<string, AbortController>();

/** Polls World ID for one check in the background, then hands the outcome to `settle`. */
export function watchWorldIdCheck(check: WatchedCheck, settle: SettleCheck) {
  if (watching.has(check.id)) {
    return;
  }
  const settings = worldIdSettings();
  if (!settings) {
    void settle(check.id, {
      status: "failed",
      error: "World ID for Agents is not configured on the API.",
    });
    return;
  }
  const controller = new AbortController();
  watching.set(check.id, controller);
  const stopAt = Math.min(check.deadline.getTime(), check.expiresAt.getTime());
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(0, stopAt - Date.now()),
  );
  void waitForDeviceCheck(
    settings,
    {
      deviceCode: check.deviceCode,
      userCode: check.userCode,
      verificationUrl: check.verificationUrl,
      interval: check.pollInterval,
      expiresAt: check.expiresAt,
      startedAt: check.startedAt,
    },
    controller.signal,
  )
    .then((outcome) => settle(check.id, outcome))
    .catch((error) => {
      console.error(`world id check ${check.id} could not settle`, error);
    })
    .finally(() => {
      clearTimeout(timer);
      watching.delete(check.id);
    });
}

/** Stops polling for checks that ended another way, for example an in-app Deny. */
export function stopWorldIdChecks(checkIds: string[]) {
  for (const id of checkIds) {
    watching.get(id)?.abort();
  }
}
