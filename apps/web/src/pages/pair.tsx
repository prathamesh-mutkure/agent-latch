import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { confirmPairing, getPairingChallenge } from "../api";
import { formatPairingCode } from "../model";
import { saveSession } from "../session";
import { PageHeader, Panel } from "../ui";
import { insideWorldApp, signInWorldApp } from "../world";

/** Opened from the computer's QR code. One World App signature signs both in. */
export function PairPage() {
  const { code } = useParams({ from: "/pair/$code" });
  const challenge = useQuery({
    queryKey: ["pair-challenge", code],
    queryFn: () => getPairingChallenge(code),
    enabled: insideWorldApp,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!challenge.data) {
      return;
    }
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const signed = await signInWorldApp(challenge.data);
      if (!signed) {
        setNote(
          "You closed the World App prompt. The computer is not signed in.",
        );
        return;
      }
      const result = await confirmPairing(code, {
        nonce: challenge.data.nonce,
        payload: signed,
      });
      saveSession(result.session);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      // A failed attempt can spend the nonce, so the next tap gets a fresh one.
      void challenge.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!insideWorldApp) {
    return (
      <>
        <PageHeader title="Sign in on a computer" />
        <Panel>
          <p className="text-sm text-muted">
            Scan the code on the computer with your phone's camera. It opens
            this page in World App.
          </p>
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Sign in on your computer"
        detail="Your computer shows a code. If it matches the one below, sign with your World App wallet. The computer then shows your agents and approvals."
      />
      <Panel>
        <p className="font-mono text-3xl font-semibold tracking-widest">
          {formatPairingCode(code)}
        </p>
        {done ? (
          <p role="status" className="mt-4 text-sm text-allow">
            Done. Your computer is signed in.
          </p>
        ) : challenge.error ? (
          <p role="alert" className="mt-4 text-sm text-block">
            {challenge.error instanceof Error
              ? challenge.error.message
              : "This code no longer works."}
          </p>
        ) : (
          <button
            type="button"
            className="mt-4 w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
            disabled={busy || !challenge.data}
            onClick={() => void signIn()}
          >
            {busy ? "Signing…" : challenge.data ? "Sign in" : "Loading…"}
          </button>
        )}
        {note ? (
          <p role="status" className="mt-3 text-sm text-muted">
            {note}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-block">
            {error}
          </p>
        ) : null}
      </Panel>
      <Link to="/mini" className="mt-6 inline-block text-sm underline">
        Back to DSAP
      </Link>
    </>
  );
}
