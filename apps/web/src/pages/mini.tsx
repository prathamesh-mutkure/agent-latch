import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { worldNonce, worldSignIn } from "../api";
import { useAccount, useAgents } from "../hooks";
import { formatDollars } from "../model";
import { clearSession, saveSession, useSession } from "../session";
import { Empty, OpenInWorldApp, PageHeader, Panel, Pill } from "../ui";
import {
  enableNotifications,
  insideWorldApp,
  LINK_REQUEST_ID,
  type NotificationState,
  notificationState,
  signInWorldApp,
} from "../world";

const SIGN_IN_TTL_MS = 5 * 60 * 1000;

export function MiniPage() {
  return insideWorldApp ? <WorldAppHome /> : <OutsideWorldApp />;
}

function OutsideWorldApp() {
  return (
    <>
      <PageHeader
        title="World App"
        detail="When one of your agents goes past its rules, the approval is pushed to you in World App. You approve or deny there."
      />
      <Panel>
        <p className="text-sm text-muted">
          Open this page in World App to turn on notifications and decide
          approvals.
        </p>
        <OpenInWorldApp path="/mini" label="Open in World App" />
      </Panel>
    </>
  );
}

function WorldAppHome() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] =
    useState<NotificationState>("unknown");

  useEffect(() => {
    void notificationState().then(setNotifications);
  }, []);

  async function turnOnNotifications() {
    setError(null);
    try {
      setNotifications(await enableNotifications());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not turn on notifications.",
      );
    }
  }

  /** One signature. The first sign-in creates the account. */
  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      const nonce = await worldNonce();
      const signed = await signInWorldApp({
        nonce,
        statement:
          "Sign in to Delegated Spend Authorization Protocol. Approvals for your agents come to this World App.",
        requestId: LINK_REQUEST_ID,
        expirationTime: new Date(Date.now() + SIGN_IN_TTL_MS).toISOString(),
      });
      if (!signed) {
        return;
      }
      const result = await worldSignIn({ nonce, payload: signed });
      saveSession(result.session);
      if (notifications !== "on") {
        await turnOnNotifications();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "World App sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Delegated Spend Authorization Protocol"
        detail="Your agents run on their own inside their rules. Anything past the rules waits here for you."
      />
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-block-soft px-4 py-3 text-sm text-block"
        >
          {error}
        </p>
      ) : null}
      {session ? (
        <SignedInHome
          wallet={session.wallet}
          notifications={notifications}
          onTurnOnNotifications={() => void turnOnNotifications()}
        />
      ) : (
        <Panel title="Sign in">
          <p className="text-sm text-muted">
            Your World App wallet is your account. The first sign-in creates it.
            Approvals for your agents then come to this phone.
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-md bg-ink px-4 py-3 text-sm font-medium text-paper disabled:opacity-50"
            disabled={busy}
            onClick={() => void signIn()}
          >
            {busy ? "Signing…" : "Sign in with World App"}
          </button>
        </Panel>
      )}
    </>
  );
}

function SignedInHome({
  wallet,
  notifications,
  onTurnOnNotifications,
}: {
  wallet: string;
  notifications: NotificationState;
  onTurnOnNotifications: () => void;
}) {
  const account = useAccount();
  const agents = useAgents();
  const pending = account.data?.pending ?? [];

  return (
    <div className="grid gap-4">
      <Panel title="Waiting for you">
        {pending.length ? (
          <ul className="grid gap-3">
            {pending.map((approval) => (
              <li key={approval.id}>
                <Link
                  to="/approve/$approvalId"
                  params={{ approvalId: approval.id }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-wait/40 bg-wait-soft px-4 py-3"
                >
                  <span className="font-medium">
                    {approval.action} {formatDollars(approval.amountUsdc)}
                  </span>
                  <Pill>{approval.status}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No approval is waiting.</Empty>
        )}
      </Panel>

      <Panel title="Notifications">
        {notifications === "on" ? (
          <p className="text-sm text-muted">
            On. Approvals push to this phone.
          </p>
        ) : notifications === "blocked" ? (
          <p className="text-sm text-muted">
            Off. Turn on notifications for this app in World App settings, then
            reopen this page.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Turn on notifications so approvals reach you.
            </p>
            <button
              type="button"
              className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium"
              onClick={onTurnOnNotifications}
            >
              Turn on notifications
            </button>
          </>
        )}
      </Panel>

      <Panel title="Your agents">
        {agents.data?.length ? (
          <ul className="grid gap-2">
            {agents.data.map((agent) => (
              <li key={agent.id} className="text-sm font-medium">
                {agent.ens.name ?? agent.name}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            {agents.isPending ? "Loading…" : "You have no agents yet."}
          </Empty>
        )}
      </Panel>

      <Panel title="This phone">
        <p className="font-mono text-xs break-all text-muted">{wallet}</p>
        <p className="mt-2 text-sm text-muted">
          Signed in. Approvals for your agents come to this wallet.
        </p>
        <button
          type="button"
          className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium"
          onClick={clearSession}
        >
          Sign out
        </button>
      </Panel>
    </div>
  );
}
