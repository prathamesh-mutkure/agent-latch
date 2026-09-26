import { useSyncExternalStore } from "react";

/** Owner session from the API. The token goes out as `Authorization: Bearer`. */
export type Session = { token: string; wallet: string; expiresAt: string };

const SESSION_KEY = "agentlatch.session";
const listeners = new Set<() => void>();

function load(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("token" in parsed && "wallet" in parsed && "expiresAt" in parsed) ||
      typeof parsed.token !== "string" ||
      typeof parsed.wallet !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      new Date(parsed.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    return {
      token: parsed.token,
      wallet: parsed.wallet,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

let current = load();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

// Another tab signed in or out.
window.addEventListener("storage", (event) => {
  if (event.key === SESSION_KEY) {
    current = load();
    emit();
  }
});

export function currentSession(): Session | null {
  return current;
}

export function saveSession(session: Session) {
  current = session;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  emit();
}

export function clearSession() {
  if (!current) {
    return;
  }
  current = null;
  window.localStorage.removeItem(SESSION_KEY);
  emit();
}

export function onSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null {
  return useSyncExternalStore(onSessionChange, currentSession);
}
