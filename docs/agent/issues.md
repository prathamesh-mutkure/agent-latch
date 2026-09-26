# Live issues

**Updated:** 2026-09-27

Handoff for the next agent. Settled choices stay in `decisions.md`. Do not relitigate them. This file is what is broken or easy to get wrong on the running demo.

## What is actually running

- Web: `https://www.dsapprotocol.xyz` on Vercel (`apps/web`). Apex 308s to `www`. The live bundle is the old OIDC build until `apps/web` is deployed again.
- API: local `localhost:3001`, reached through the ngrok host in `apps/web/vercel.json` by the `/api` rewrite. World never calls the API. World App opens the web app, and the web app calls `/api`.
- World: one product, the mini app `app_e84b1b772fa55ee5b4e8a367f169c345` (DSAP Protocol Tokyo), URL `https://www.dsapprotocol.xyz`. The World ID for Agents sandbox client is no longer used.
- Current agent: `pilot`, id `8b6b1878-eb41-4c5d-9ec3-14bd08eeb074`, ENS `pilot.agent-latch.eth` registered. Unowned since migration 0003. Claim it from `/mini` in World App.

## Gone with the World App rewrite

- `WRONG_HUMAN`, the sandbox approving by itself, and the redirect host sector. OIDC is removed.
- The ngrok warning page. Nothing navigates to the API. Every call is a `fetch` with `ngrok-skip-browser-warning`.
- Wallet link failing from World App. The old check was ECDSA only, and World App wallets are Safes. MiniKit's verifier falls back to EIP-1271 on World Chain.
- A push on every agent tick. Only an opened approval pushes.

## Open

1. **Not run from a phone yet.** Redeploy `apps/web`, restart the API, open the mini app in World App, claim `pilot`, turn on notifications, and approve a 2500 USDC swap from the push. The API path is checked with local keys. The Safe EIP-1271 path is first exercised here.

2. **Claim or decide fails with `Signature verification failed`.** Recovery did not match and the EIP-1271 call failed. Either World Chain RPC is unreachable (set `WORLDCHAIN_RPC_URL`) or that wallet's Safe is not deployed on World Chain yet.

3. **40 pushes per 4 hours.** The portal app is unverified. Each opened approval is one push. The background agent waits on each approval, then opens another 2500 swap a few ticks later. Raise `AGENT_INTERVAL_MS` for a long session.

4. **No push arrives.** The API logs `world push sent`, `world push not sent: <reason>`, or `world push skipped: ...`. `skipped` means a missing key or an unclaimed agent. For `not sent`, check that notifications are on for this mini app in World App. `permission_disabled` or `already_requested` means the person turns it on in World App settings. The approval still shows on `/mini` either way.

5. **Approvals last 5 minutes.** The signed message expires with the approval. A late signature is refused and nothing changes. Use the newest pending approval.

6. **The ngrok host changes when the free tunnel restarts.** Update `apps/web/vercel.json` and redeploy. A fixed tunnel or a deployed API removes this.

7. **SIWE domain is not pinned.** MiniKit's verifier checks nonce, statement, request ID, and expiry, not the domain. The statement names the action, so the owner sees what they sign. Pin the domain later.

8. **Link nonces live in API memory.** A restart drops a claim in flight. Tap Claim again.

9. **Signer custody is still open.** One `EXECUTOR_PRIVATE_KEY` on the API. Do not replace `packages/signers/local`.

10. **Store review** still needs a logo, a content card, and one showcase image.

## Do not

- Do not put `WORLD_NOTIFICATION_API_KEY` in the web app or any `VITE_*` variable.
- Do not commit `.cursor/mcp.json`. It holds a Developer Portal key and is gitignored.
- Do not run `configure_world_id` or rotate World ID keys without an explicit go-ahead. Both have on-chain side effects.
- Do not `infra:reset` unless the database itself must go.
- `.env` entries `WORLD_OIDC_ISSUER`, `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`, `WORLD_REDIRECT_URI`, and `COOKIE_SECRET` are unused. Delete them.
