import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { collectPairing, startPairing } from "../api";
import { useWorldConfig } from "../hooks";
import { formatPairingCode } from "../model";
import { saveSession } from "../session";
import { PageHeader, Panel } from "../ui";
import { miniAppUrl } from "../world";

type Pairing = Awaited<ReturnType<typeof startPairing>>;

/**
 * Desktop sign-in. The QR code opens `/pair/<code>` in World App, the phone
 * signs that code, and this browser collects the session with a secret that
 * never leaves it.
 */
export function SignInPage() {
  const config = useWorldConfig();
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

  return (
    <>
      <PageHeader
        title="Sign in"
        detail="DSAP accounts are World App wallets. Your agents, their rules, and their approvals show up here once you sign in. The first sign-in creates your account."
      />
      <Panel>
        {!appId ? (
          <p className="text-sm text-muted">
            {config.isPending
              ? "Loading…"
              : "Set WORLD_APP_ID on the API to sign in with World App."}
          </p>
        ) : pairing ? (
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG
                value={miniAppUrl(appId, `/pair/${pairing.code}`)}
                size={208}
                marginSize={0}
              />
            </div>
            <div className="grid gap-3">
              <p className="text-sm">
                Scan with your phone's camera. It opens DSAP in World App. Check
                that the phone shows this code, then tap Sign in.
              </p>
              <p className="font-mono text-3xl font-semibold tracking-widest">
                {formatPairingCode(pairing.code)}
              </p>
              <p className="text-sm text-muted">
                Each code works once and lasts 5 minutes. A new one appears by
                itself.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="grid justify-items-start gap-3">
            <p role="alert" className="text-sm text-block">
              {error}
            </p>
            <button
              type="button"
              className="rounded-md border border-ink px-4 py-2 text-sm font-medium"
              onClick={() => void start()}
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </Panel>
    </>
  );
}
