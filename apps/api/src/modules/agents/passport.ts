import type { Failure } from "../../result";
import { readAgentEns } from "./ens";

export type PassportGate =
  | { state: "active"; name: string }
  | { state: "unread"; error: string }
  | { state: "inactive"; reason: string };

/** Identity check only. The spending decision reads the name's text records. */
export async function readPassportGate(
  label: string,
  now: Date,
): Promise<PassportGate> {
  const identity = await readAgentEns(label);
  if (identity.status === "UNAVAILABLE") {
    return {
      state: "unread",
      error: identity.detail ?? "ENS name could not be read.",
    };
  }
  if (identity.expiry && new Date(identity.expiry).getTime() <= now.getTime()) {
    return { state: "inactive", reason: "ENS name is expired." };
  }
  if (identity.status !== "REGISTERED" || !identity.name) {
    return { state: "inactive", reason: "ENS name is not registered." };
  }
  return { state: "active", name: identity.name };
}

export function passportFailure(gate: PassportGate): Failure | null {
  if (gate.state === "active") {
    return null;
  }
  if (gate.state === "unread") {
    return { ok: false, status: 503, error: gate.error };
  }
  return { ok: false, status: 403, error: gate.reason };
}
