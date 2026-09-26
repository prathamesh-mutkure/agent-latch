# Continuation

**Updated:** 2026-09-27

Handoff from `planning-v2.md` onto the repo that exists now. Where that spec disagrees with this file, this file wins.

## Locked

- The spending decision reads the name's text records. Postgres stores the owner's saved policy. A tighter edit is written to the name, then to Postgres. A looser edit is rejected until an owner signature in World App can publish it. A content hash of the policy, instead of plaintext records, is a post-hackathon privacy step.
- Payments stay on Ethereum Sepolia, chain id `11155111`, Circle USDC. No Base.
- Intercepta stays on `X402_PAYMENT`, after policy and before signing. A missing `INTERCEPTA_API_KEY` refuses the payment.
- Stack stays this repo: Elysia, Drizzle, and the current packages. `GET /x402/resource` on the API is the paid resource. No Hono seller app. No rename. `ActionRequest` stays the agent API. Do not replace it with `POST /api/v1/fetch`.

## Open for Ankit

Do not close these in code until he writes the choice in `decisions.md`.

**Signer custody.** The code signs with one `LocalKeySigner` (`EXECUTOR_PRIVATE_KEY`) and an exact EIP-3009 slip, then that same key broadcasts the Sepolia transaction. His spec uses a wallet per agent, encrypted at rest. Either can be the end state. Leave `packages/signers/local` and `packages/executors/x402` in place until he decides.

**World approval shape.** Closed on 2026-09-27 in `decisions.md` ("World App is the only human surface", then "World ID for Agents confirms every approve"). Past-policy actions push to the owner's World App. The owner denies with a wallet signature bound to that action, or approves with that signature plus a World ID for Agents device check the API validates.

## Step order

1. Phases 5 and 8. World App approval with a World ID for Agents check on approve, on the existing approval path. Leave the signer alone. Built and checked against Postgres and the live sandbox. The phone run is in `issues.md`.
2. Custody. No code until the open question is closed.
3. Done. An action is refused when the ENS name is missing or expired. Registration sets the resolver, the ETH address, and the policy text records. Decisions read those records.
4. Later: publishing a looser policy after an owner signature in World App. A content hash in place of the plaintext records is post-hackathon.

Multi-user, in this order:

1. Done. Owner accounts: World App sign-in on the phone and by QR on the computer, a session on owner routes, each owner sees only their own agents (`decisions.md`, "Owner accounts"). Action submits and reads stay open for `apps/mcp`.
2. Agent registration and agent keys. Registering creates the agent and its ENS name and shows an agent key once. Action submits, action reads, and the agent's approval reads require the key. The background agent and `apps/mcp` read the key from `.env`.
3. Done as a stdio server, not a route on the API. `apps/mcp` (`decisions.md`, "MCP server for x402 payments"): `list_merchants`, `quote_resource`, `pay_resource`, `get_payment`, `list_payments`. The model's `note` is already on `pay_resource`. Extra tools (`request_swap`, `wait_for_approval`, `get_policy`, `recent_activity`) and a "Connect to Claude" panel come after agent keys, on this server. No second MCP endpoint, no built-in chat, no model key on AgentLatch.
4. Test-request buttons on the agent's page.
5. Optional, not planned: a built-in chat box.
