import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { collectPairing, startPairing } from "../api";
import { useHealth, useWorldConfig } from "../hooks";
import { formatPairingCode } from "../model";
import { saveSession } from "../session";
import { miniAppUrl } from "../world";

type Pairing = Awaited<ReturnType<typeof startPairing>>;

/**
 * Desktop sign-in. The QR code opens `/pair/<code>` in World App, the phone
 * signs that code, and this browser collects the session with a secret that
 * never leaves it.
 */
export function SignInPage() {
  const config = useWorldConfig();
  const health = useHealth();
  const apiUp = health.data?.ok === true && health.data.database === "up";
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const appId = config.data?.appId;
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      setPairing(await startPairing());
    } catch (caught) {
      setPairing(null);
      setError(
        caught instanceof Error ? caught.message : "Could not start sign-in.",
      );
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const collected = useQuery({
    queryKey: ["pairing", pairing?.code],
    queryFn: () =>
      pairing
        ? collectPairing(pairing.code, pairing.secret)
        : Promise.reject(new Error("No sign-in code.")),
    enabled: pairing !== null,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    retry: false,
  });

  useEffect(() => {
    if (collected.data?.status === "signed_in") {
      saveSession(collected.data.session);
    }
  }, [collected.data]);

  // The code expired or was used: show a fresh one.
  useEffect(() => {
    if (collected.error) {
      void start();
    }
  }, [collected.error, start]);

  // The code expired unused: show a fresh one.
  const left = pairing ? secondsLeft(pairing.expiresAt, now) : null;
  useEffect(() => {
    if (left === 0) {
      void start();
    }
  }, [left, start]);

  return (
    <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col bg-ink px-6 py-8 text-paper sm:px-12 lg:min-h-screen lg:py-12">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="size-10 rounded-lg"
          />
          <p className="font-semibold tracking-tight">
            Delegated Spend Authorization Protocol
          </p>
        </div>

        <div className="my-10 max-w-lg lg:my-auto">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
            Your agents spend.
            <br />
            <span className="text-gold">You hold the latch.</span>
          </h1>
          <p className="mt-5 text-paper/70">
            Give an AI agent a policy, not your wallet. Decide what it may do,
            where, and how much. Everything inside the rules runs on its own.
            Everything outside them waits for you in World App, confirmed with
            World ID.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            <Rule
              title="Spend limits"
              text="What it spends alone, what needs you, and a daily cap."
            />
            <Rule
              title="Allowed actions"
              text="x402 payments, transfers, swaps, API and contract calls. Each on or off."
            />
            <Rule
              title="Allowed targets"
              text="Lock it to the merchants, addresses, and APIs you trust."
            />
            <Rule
              title="Human approval"
              text="Past the rules, it asks your phone. One tap and World ID."
            />
            <Rule
              title="Onchain identity"
              text="Each agent is an ENS name that carries its policy. No live name, no spending."
            />
            <Rule
              title="Payee screening"
              text="x402 payees are checked by Intercepta before money moves."
            />
          </ul>
          <p className="mt-6 border-l-2 border-gold pl-4 text-sm text-paper/80">
            Policies are never set in stone. Change an agent's rules whenever
            its job changes.
          </p>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-paper/50">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${apiUp ? "bg-allow" : "bg-block"}`}
          />
          Sepolia · {apiUp ? "API up" : "API unreachable"}
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-2 text-sm text-muted">
            Your World App wallet is your account. The first sign-in creates it.
          </p>

          <div className="mt-6 rounded-2xl border border-line bg-card p-6">
            {!appId ? (
              <p className="text-sm text-muted">
                {config.isPending
                  ? "Loading…"
                  : "Set WORLD_APP_ID on the API to sign in with World App."}
              </p>
            ) : pairing ? (
              <div className="grid justify-items-center gap-5 text-center">
                <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-line">
                  <QRCodeSVG
                    value={miniAppUrl(appId, `/pair/${pairing.code}`)}
                    size={200}
                    marginSize={0}
                  />
                </div>
                <div>
                  <p className="text-xs tracking-wide text-muted uppercase">
                    Code on your phone should match
                  </p>
                  <p className="mt-1 font-mono text-3xl font-semibold tracking-widest">
                    {formatPairingCode(pairing.code)}
                  </p>
                </div>
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted"
                >
                  <span
                    aria-hidden
                    className="size-2 animate-pulse rounded-full bg-wait"
                  />
                  Waiting for your phone · new code in{" "}
                  <span className="font-mono tabular-nums">
                    {formatSeconds(left ?? 0)}
                  </span>
                </p>
              </div>
            ) : error ? (
              <div className="grid justify-items-start gap-3">
                <p role="alert" className="text-sm text-block">
                  {error}
                </p>
                <button
                  type="button"
                  className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
                  onClick={() => void start()}
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </div>

          <ol className="mt-6 grid gap-3 text-sm">
            <Step n={1} text="Scan the code with your phone's camera." />
            <Step n={2} text="It opens the app in World App." />
            <Step
              n={3}
              text="Check the code matches, then tap Sign in. This page signs in by itself."
            />
          </ol>
        </div>
      </section>
    </div>
  );
}

function Rule({ title, text }: { title: string; text: string }) {
  return (
    <li className="rounded-xl bg-white/5 px-4 py-3">
      <p className="text-sm font-medium text-gold">{title}</p>
      <p className="mt-1 text-sm text-paper/70">{text}</p>
    </li>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs text-paper">
        {n}
      </span>
      <span className="pt-0.5 text-muted">{text}</span>
    </li>
  );
}

function secondsLeft(iso: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

function formatSeconds(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
