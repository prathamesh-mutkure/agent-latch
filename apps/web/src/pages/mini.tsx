import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { linkWorldApp, worldNonce } from "../api";
import { useAgents, useOwner } from "../hooks";
import { formatDollars } from "../model";
import { Empty, OpenInWorldApp, PageHeader, Panel, Pill } from "../ui";
import {
  currentWallet,
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
        detail="When an agent goes past its rules, AgentLatch pushes the approval to its owner in World App. The owner approves or denies there."
      />
      <Panel>
        <p className="text-sm text-muted">
          Open AgentLatch in World App to claim agents, turn on notifications,
          and decide approvals.
        </p>
        <OpenInWorldApp path="/mini" label="Open in World App" />
      </Panel>
    </>
  );
}

function WorldAppHome() {
  const [wallet, setWallet] = useState(currentWallet);
  const owner = useOwner(wallet);
  const agents = useAgents();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
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

  /** One signature links this phone and, with an agent, claims it. */
  async function link(agent?: { id: string; name: string }) {
    setError(null);
    setBusy(agent?.id ?? LINK_REQUEST_ID);
    try {
      const nonce = await worldNonce();
      const signed = await signInWorldApp({
        nonce,
        statement: agent
          ? `Claim agent ${agent.name} and send its approvals to this World App.`
          : "Send AgentLatch approvals to this World App.",
        requestId: agent?.id ?? LINK_REQUEST_ID,
        expirationTime: new Date(Date.now() + SIGN_IN_TTL_MS).toISOString(),
      });
      if (!signed) {
        return;
      }
      const view = await linkWorldApp({
        nonce,
        agentId: agent?.id,
        payload: signed,
      });
      setWallet(view.wallet);
      queryClient.setQueryData(["owner", view.wallet], view);
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      if (notifications !== "on") {
        await turnOnNotifications();
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "World App sign-in failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  const linked = owner.data?.linked === true;
  const ownedIds = new Set(owner.data?.agentIds ?? []);
  const mine = agents.data?.filter((agent) => ownedIds.has(agent.id)) ?? [];
  const unclaimed = agents.data?.filter((agent) => !agent.userId) ?? [];
  const pending = owner.data?.pending ?? [];

  return (
    <>
      <PageHeader
        title="AgentLatch"
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
      <div className="grid gap-4">
        <Panel title="Waiting for you">
          {!linked ? (
            <Empty>Claim an agent below to get its approvals here.</Empty>
          ) : pending.length ? (
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
              Off. Turn on notifications for AgentLatch in World App settings,
              then reopen this page.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Turn on notifications so approvals reach you.
              </p>
              <button
                type="button"
                className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium"
                onClick={() => void turnOnNotifications()}
              >
                Turn on notifications
              </button>
            </>
          )}
        </Panel>

        {mine.length > 0 ? (
          <Panel title="Your agents">
            <ul className="grid gap-2">
              {mine.map((agent) => (
                <li key={agent.id} className="text-sm font-medium">
                  {agent.ens.name ?? agent.name}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        {unclaimed.length > 0 ? (
          <Panel title="Unclaimed agents">
            <ul className="grid gap-3">
              {unclaimed.map((agent) => {
                const name = agent.ens.name ?? agent.name;
                return (
                  <li
                    key={agent.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-medium">{name}</span>
                    <button
                      type="button"
                      className="rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
                      disabled={busy !== null}
                      onClick={() => void link({ id: agent.id, name })}
                    >
                      {busy === agent.id ? "Signing…" : "Claim"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

        <Panel title="This phone">
          <p className="font-mono text-xs break-all text-muted">
            {wallet ?? "World App wallet not known yet."}
          </p>
          <p className="mt-2 text-sm text-muted">
            {linked
              ? "Linked. Approvals for your agents come to this wallet."
              : "Not linked yet. Claiming an agent links this phone."}
          </p>
          {!linked ? (
            <button
              type="button"
              className="mt-3 rounded-md border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void link()}
            >
              {busy === LINK_REQUEST_ID ? "Signing…" : "Link this phone"}
            </button>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
