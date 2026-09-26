import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MiniKit } from "@worldcoin/minikit-js";
import { Permission } from "@worldcoin/minikit-js/commands";
import { useEffect, useState } from "react";
import { saveWorldWallet, worldNonce } from "../api";
import { useAgents, useMe, useMyApprovals, useWorldAppId } from "../hooks";
import { formatDollars } from "../model";
import { Empty, PageHeader, Panel, Pill } from "../ui";
import { ClaimButton } from "./agents";

export function MiniPage() {
  const me = useMe();
  const app = useWorldAppId();
  const agents = useAgents();
  const pending = useMyApprovals(Boolean(me.data));
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (app.isPending) {
      return;
    }
    MiniKit.install(app.data ?? undefined);
  }, [app.data, app.isPending]);

  async function linkWallet() {
    setError(null);
    setNote(null);
    if (!MiniKit.isInstalled()) {
      setError(
        "Open this page inside World App to link your wallet. Approval from this browser still works.",
      );
      return;
    }
    setLinking(true);
    try {
      const nonce = await worldNonce();
      const result = await MiniKit.walletAuth({
        nonce,
        statement: "Link this World App wallet to AgentLatch.",
        expirationTime: new Date(Date.now() + 10 * 60 * 1000),
      });
      if (result.executedWith === "fallback") {
        setError("World App did not return a wallet signature.");
        return;
      }
      await saveWorldWallet({
        address: result.data.address,
        message: result.data.message,
        signature: result.data.signature,
      });
      const permission = await MiniKit.requestPermission({
        permission: Permission.Notifications,
      });
      setNote(
        permission.executedWith === "fallback"
          ? "Wallet linked. Enable notifications inside World App so approvals can reach you."
          : "Wallet linked. Approval notifications will open in World App.",
      );
      await queryClient.invalidateQueries();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not link the wallet.",
      );
    } finally {
      setLinking(false);
    }
  }

  const unclaimed = agents.data?.filter((agent) => !agent.userId) ?? [];

  return (
    <>
      <PageHeader
        title="World App"
        detail="Sign in with World ID, link this phone, then approve or deny from the notification. The API still holds the key."
      />
      {note ? (
        <p
          role="status"
          className="mb-6 rounded-xl bg-allow-soft px-4 py-3 text-sm text-allow"
        >
          {note}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mb-6 rounded-xl bg-block-soft px-4 py-3 text-sm text-block"
        >
          {error}
        </p>
      ) : null}
      {!me.data ? (
        <a
          href="/auth/world/login"
          className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Sign in with World ID
        </a>
      ) : (
        <div className="grid gap-4">
          <Panel title="This phone">
            <p className="text-sm text-muted">
              {me.data.worldWallet
                ? `Notifications go to ${me.data.worldWallet}`
                : "No World App wallet is linked yet."}
            </p>
            {app.data ? null : (
              <p className="mt-2 text-sm text-muted">
                Pushes wait on WORLD_APP_ID and WORLD_NOTIFICATION_API_KEY.
                Approvals still work in this browser.
              </p>
            )}
            <button
              type="button"
              className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
              disabled={linking}
              onClick={() => {
                void linkWallet();
              }}
            >
              {linking ? "Linking…" : "Link World App"}
            </button>
          </Panel>
          <Panel title="Waiting for you">
            {pending.isPending ? (
              <Empty>Loading approvals…</Empty>
            ) : pending.data?.length ? (
              <ul className="grid gap-3">
                {pending.data.map((approval) => (
                  <li key={approval.id}>
                    <Link
                      to="/approve/$approvalId"
                      params={{ approvalId: approval.id }}
                      className="flex items-center justify-between gap-3"
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
          {unclaimed.length > 0 ? (
            <Panel title="Unclaimed agents">
              <ul className="grid gap-3">
                {unclaimed.map((agent) => (
                  <li key={agent.id}>
                    <p className="text-sm font-medium">
                      {agent.ens.name ?? agent.name}
                    </p>
                    <ClaimButton agentId={agent.id} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
    </>
  );
}
