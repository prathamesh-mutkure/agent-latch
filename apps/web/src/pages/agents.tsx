import { type ActionType, actionTypes } from "@agentlatch/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import {
  createAgent,
  type NewAgent,
  registerAgentEns,
  setUsername,
} from "../api";
import { useAccount, useAgents, useAllActions } from "../hooks";
import { agentPosture } from "../model";
import { Empty, PageHeader, Panel, Pill, QueryGate } from "../ui";

export function AgentsPage() {
  const agents = useAgents();
  const agentIds = agents.data?.map((agent) => agent.id) ?? [];
  const actionQueries = useAllActions(agentIds);
  const actions = actionQueries.flatMap((query) => query.data ?? []);

  return (
    <>
      <PageHeader
        title="Agents"
        detail="Each agent has an ENS name, a key, and a policy. The key is shown once."
      />
      <div className="mb-4">
        <RegisterAgent />
      </div>
      <QueryGate
        isPending={agents.isPending}
        error={agents.error}
        hasData={Boolean(agents.data)}
      >
        {agents.data?.length === 0 ? (
          <Empty>You have no agents yet.</Empty>
        ) : (
          <ul className="grid gap-3">
            {agents.data?.map((agent) => {
              const posture = agentPosture(
                actions.filter((action) => action.agentId === agent.id),
              );
              const granted = agent.ens.roles.filter((role) => role.granted);
              return (
                <li key={agent.id}>
                  <Link
                    to="/agents/$agentId"
                    params={{ agentId: agent.id }}
                    className="block rounded-xl border border-line bg-card p-5"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-medium">
                        {agent.ens.name ?? agent.ensName}
                      </h2>
                      <Pill>{agent.ens.status}</Pill>
                      <Pill>{posture}</Pill>
                    </div>
                    <p className="mt-3 font-mono text-sm break-all text-muted">
                      {agent.ens.address ?? "No ETH address record"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {granted.length > 0
                        ? `${granted.length} roles granted`
                        : "No roles granted"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </QueryGate>
    </>
  );
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const USDC = /^\d+(\.\d{1,6})?$/;

function isLabel(value: string): boolean {
  return value.length >= 3 && value.length <= 32 && LABEL.test(value);
}

/** Same keys and values the API writes to the name (`policyRecords`). */
function textRecords(policy: NewAgent["policy"]): [string, string][] {
  return [
    ["policy.autonomousLimit", policy.autonomousLimit],
    ["policy.hardLimit", policy.hardLimit],
    ["policy.dailyLimit", policy.dailyLimit ?? "none"],
    ["policy.actions", policy.allowedActions.join(",")],
    ["policy.tokens", "USDC"],
    [
      "policy.targets",
      policy.allowedTargets.length > 0
        ? policy.allowedTargets.join(",")
        : "any",
    ],
  ];
}

const inputClass =
  "rounded-md border border-line bg-card px-3 py-2 font-mono text-sm";

function RegisterAgent() {
  const queryClient = useQueryClient();
  const account = useAccount();
  const savedUsername = account.data?.username ?? null;
  const parent = account.data?.ensParent ?? "agent-latch.eth";

  const [username, setUsernameInput] = useState("");
  const [name, setName] = useState("");
  const [authAddress, setAuthAddress] = useState("");
  const [autonomous, setAutonomous] = useState("500");
  const [hard, setHard] = useState("5000");
  const [daily, setDaily] = useState("");
  const [allowedActions, setAllowedActions] = useState<ActionType[]>([
    ...actionTypes,
  ]);
  const [targets, setTargets] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    key: string;
    ensName: string;
    setupError: string | null;
  } | null>(null);

  const owner = savedUsername ?? username.trim().toLowerCase();
  const label = name.trim().toLowerCase();
  const ensName = `${label || "name"}.${owner || "username"}.${parent}`;
  const policy: NewAgent["policy"] = {
    autonomousLimit: autonomous.trim(),
    hardLimit: hard.trim(),
    dailyLimit: daily.trim() || undefined,
    allowedActions,
    allowedTargets: targets
      .split(/[\s,]+/)
      .map((target) => target.trim())
      .filter(Boolean),
  };

  const problem = !isLabel(owner)
    ? "Pick a username: 3 to 32 lower-case letters, digits, and dashes."
    : !isLabel(label)
      ? "Pick an agent name: 3 to 32 lower-case letters, digits, and dashes."
      : authAddress.trim() && !ADDRESS.test(authAddress.trim())
        ? "The signing address must be a 0x address."
        : !USDC.test(policy.autonomousLimit) || !USDC.test(policy.hardLimit)
          ? "Limits are USDC amounts, up to 6 decimals."
          : Number(policy.hardLimit) < Number(policy.autonomousLimit)
            ? "The hard limit must be at least the autonomous limit."
            : policy.dailyLimit &&
                (!USDC.test(policy.dailyLimit) ||
                  Number(policy.dailyLimit) < Number(policy.autonomousLimit))
              ? "The daily limit must be a USDC amount of at least the autonomous limit."
              : allowedActions.length === 0
                ? "Allow at least one action."
                : null;

  function toggleAction(action: ActionType) {
    setAllowedActions((current) =>
      current.includes(action)
        ? current.filter((item) => item !== action)
        : actionTypes.filter(
            (item) => item === action || current.includes(item),
          ),
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (problem) {
      return;
    }
    setPending(true);
    setError(null);
    setCreated(null);
    try {
      if (!savedUsername) {
        await setUsername(owner);
        await queryClient.invalidateQueries({ queryKey: ["me"] });
      }
      const agent = await createAgent({
        name: label,
        authAddress: authAddress.trim() || undefined,
        policy,
      });
      let { setupError } = agent;
      try {
        await registerAgentEns(agent.id);
      } catch (ensError) {
        setupError =
          ensError instanceof Error
            ? ensError.message
            : "ENS registration failed.";
      }
      setCreated({ id: agent.id, key: agent.key, ensName, setupError });
      setName("");
      setAuthAddress("");
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not register.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel title="Register an agent">
      <form className="grid gap-5" onSubmit={onSubmit}>
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">Name</legend>
          {savedUsername ? (
            <p className="text-sm text-muted">
              Your username is{" "}
              <span className="font-mono text-ink">{savedUsername}</span>. Every
              agent you register lives under it.
            </p>
          ) : (
            <label className="grid gap-1 text-sm">
              Your username (set once, shared by all your agents)
              <input
                className={inputClass}
                value={username}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="alice"
                onChange={(event) => setUsernameInput(event.target.value)}
              />
            </label>
          )}
          <label className="grid gap-1 text-sm">
            Agent name
            <input
              className={inputClass}
              value={name}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="trader"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="rounded-md border border-line p-3 font-mono text-sm">
            <p className="text-muted">{parent}</p>
            <p className="pl-4 text-muted">
              └ {owner || "username"}.{parent}
            </p>
            <p className="pl-8 break-all">└ {ensName}</p>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">Policy</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              Autonomous limit (USDC)
              <input
                className={inputClass}
                inputMode="decimal"
                value={autonomous}
                onChange={(event) => setAutonomous(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Hard limit (USDC)
              <input
                className={inputClass}
                inputMode="decimal"
                value={hard}
                onChange={(event) => setHard(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Daily limit (optional)
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="none"
                value={daily}
                onChange={(event) => setDaily(event.target.value)}
              />
            </label>
          </div>
          <p className="text-sm text-muted">
            Up to the autonomous limit runs by itself. Above it waits for you in
            World App. Above the hard limit is blocked.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {actionTypes.map((action) => (
              <label key={action} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allowedActions.includes(action)}
                  onChange={() => toggleAction(action)}
                />
                <span className="font-mono">{action}</span>
              </label>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            Allowed targets (optional, comma separated; empty allows any)
            <input
              className={inputClass}
              value={targets}
              placeholder="https://seller.example/resource, 0x…"
              onChange={(event) => setTargets(event.target.value)}
            />
          </label>
          <div className="grid gap-1 rounded-md border border-line p-3 text-sm">
            <p className="text-muted">Text records on {ensName}</p>
            {textRecords(policy).map(([key, value]) => (
              <p key={key} className="font-mono break-all">
                {key} = {value || "—"}
              </p>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">
            Signing address (optional)
          </legend>
          <label className="grid gap-1 text-sm">
            The agent's own address. It becomes the name's ETH record, and the
            agent must then sign every action with its key.
            <input
              className={inputClass}
              value={authAddress}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="0x…"
              onChange={(event) => setAuthAddress(event.target.value)}
            />
          </label>
        </fieldset>

        {problem && (label || username) ? (
          <p className="text-sm text-muted">{problem}</p>
        ) : null}
        <p className="text-sm text-muted">
          Register creates the agent, then registers {ensName} on Sepolia with
          these records. The first agent under a new username also registers the
          username.
        </p>
        <button
          type="submit"
          disabled={pending || problem !== null}
          className="w-fit rounded-md border border-ink px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Registering…" : "Register"}
        </button>
        {error ? <p className="text-sm text-block">{error}</p> : null}
      </form>
      {created ? (
        <div className="mt-4 grid gap-2 border-t border-line pt-4">
          <p className="text-sm font-medium">
            Copy this key now. It is not shown again.
          </p>
          <textarea
            readOnly
            className="rounded-md border border-line bg-card p-3 font-mono text-sm"
            rows={3}
            value={created.key}
          />
          <p className="text-sm text-muted">
            Put it in <span className="font-mono">AGENT_KEY</span> for the
            background agent and Claude. Agent id{" "}
            <span className="font-mono">{created.id}</span>.
          </p>
          {created.setupError ? (
            <p className="text-sm text-block">{created.setupError}</p>
          ) : (
            <p className="text-sm text-muted">
              <span className="font-mono">{created.ensName}</span> registered
              with its policy records.
            </p>
          )}
          <Link
            to="/agents/$agentId"
            params={{ agentId: created.id }}
            className="text-sm font-medium underline"
          >
            Open this agent
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}
