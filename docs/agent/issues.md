# Live issues

**Updated:** 2026-09-27

Handoff for the next agent. Settled choices stay in `decisions.md`. Do not relitigate them. This file is what is broken or easy to get wrong on the running demo.

## What is actually running

- Web: `https://www.dsapprotocol.xyz` on Vercel (`apps/web`). Apex 308s to `www`. `/api` rewrites to the Render API.
- API: `https://dsap-protocol.onrender.com` (Render Free). A ping every 5 minutes keeps it awake. A restart still drops a sign-in in progress. `https://www.dsapprotocol.xyz/api/health` returns `database: "up"`. World never calls the API. World App opens the web app, and the web app calls `/api`.
- World App: the mini app `app_e84b1b772fa55ee5b4e8a367f169c345` (DSAP Protocol Tokyo), URL `https://www.dsapprotocol.xyz`. It handles sign-in (on the phone, and for the computer through the QR code), pushes, and the owner's signature.
- World ID for Agents: the sandbox client in `.env` (`WORLD_CLIENT_ID`, issuer `https://sandbox.auth.world.org`, `client_secret_basic`, shown on World's page as "DSAP Protocol"). The API uses only the device grant. World never calls the API. The API polls World.
- Current agent: `pilot`, id `8b6b1878-eb41-4c5d-9ec3-14bd08eeb074`, ENS `pilot.agent-latch.eth` registered. Owned by World App wallet `0xe5f5617c6996cd0f1b6afe02856f23f46296ad5c`. Only that wallet sees it after signing in. The background agent acts for it through `AGENT_ID` in `.env`.

## Gone

- `WRONG_HUMAN`, the sandbox approving by itself, and the redirect host sector. The browser OIDC flow is removed. The device grant has no callback, and the owner is matched by wallet, not by World ID `sub`.
- The ngrok tunnel. The live rewrite is the Render host. Browser fetches no longer send `ngrok-skip-browser-warning`.
- Wallet link failing from World App. The old check was ECDSA only, and World App wallets are Safes. MiniKit's verifier falls back to EIP-1271 on World Chain.
- A push on every agent tick. Only an opened approval pushes.
- The phone sign-in and the World ID approve path. Completed on the live site.

## Open

1. **World ID says `World ID returned assurance ... not https://world.org/oidc/acr/orb-v3`.** The API requires the Orb class that the sandbox advertises. If mocked proofs return another `acr`, the check fails and the approval stays pending. Read the value from the error before changing `ORB_ACR` in `packages/integrations/world/src/world-id.ts`, and record the change in `decisions.md`.

2. **Open World ID does nothing in World App.** The link is a plain `target="_blank"` anchor to `sandbox.auth.world.org`. If World App will not open it, long-press to copy it into a browser. The code on World's page must match the one in the mini app.

4. **`Request exceeds defined limit.`** The public Sepolia RPC (publicnode) is rate-limiting ENS reads. Actions get 503, and approve says the ENS name could not be read. Set `SEPOLIA_RPC_URL` to a keyed Sepolia endpoint.

5. **Approve returns `World ID: ...` 503.** World refused or rate-limited the device start. Starts return 429 with `Retry-After: 60` past the per-client limit. Wait and tap Approve again. Nothing changed on the approval.

6. **Sign-in or decide fails with `Signature verification failed`.** Recovery did not match and the EIP-1271 call failed. Either World Chain RPC is unreachable (set `WORLDCHAIN_RPC_URL`) or that wallet's Safe is not deployed on World Chain yet.

7. **40 pushes per 4 hours.** The portal app is unverified. Each opened approval is one push. The background agent waits on each approval, then opens another 0.5 swap a few ticks later. Raise `AGENT_INTERVAL_MS` for a long session.

8. **No push arrives.** The API logs `world push sent`, `world push not sent: <reason>`, or `world push skipped: ...`. `skipped` means a missing key or an agent with no owner. For `not sent`, check that notifications are on for this mini app in World App. `permission_disabled` or `already_requested` means the person turns it on in World App settings. The approval still shows on `/mini` either way.

9. **Approvals last 5 minutes.** The signed message and the World ID check both end with the approval. A late signature is refused, and a World ID approval after expiry runs nothing. Use the newest pending approval.

10. **A Render restart drops a sign-in in progress.** A ping every 5 minutes keeps the Free instance awake. Sign-in nonces and QR codes still live in that one process.

11. **SIWE domain is not pinned.** MiniKit's verifier checks nonce, statement, request ID, and expiry, not the domain. The statement names the action, so the owner sees what they sign. Pin the domain later.

12. **Sign-in nonces and QR codes live in API memory.** A restart drops a sign-in in flight. Tap Sign in again. The computer shows a new QR code when its code expires or is lost. The QR must open `/pair/<code>`. If the phone shows the agent list instead of the code, the computer will not sign in. Scan the code on the computer again.

13. **Signer custody is still open.** One `EXECUTOR_PRIVATE_KEY` on the API. Do not replace `packages/signers/local`.

14. **Store review** still needs a content card and one showcase image. The logo is `apps/web/public/logo.png`.

15. **Sessions end when `SESSION_SECRET` changes.** Without it, the API makes a random secret per process, so every restart signs everyone out. Keep one in `.env`. The web app drops a session on any 401 and shows sign-in again. Sessions last 24 hours and cannot be revoked early.

16. **The background agent and Claude need `AGENT_KEY`.** The demo does not. The key is shown once on the agent's page. Replacing it stops the old one.

17. **`GET /approvals/:id` stays open.** World App opens it from a push without the agent key. Submitting an action requires `x-agent-key`. Action, policy, and audit reads take the key or the owner's session.

## Do not

- Do not put `WORLD_NOTIFICATION_API_KEY` in the web app or any `VITE_*` variable.
- Do not commit `.cursor/mcp.json`. It holds a Developer Portal key and is gitignored.
- Do not run `configure_world_id` or rotate World ID keys without an explicit go-ahead. Both have on-chain side effects.
- Do not `infra:reset` unless the database itself must go.
- Do not put `WORLD_CLIENT_SECRET` in the web app or any `VITE_*` variable, and do not return the device code from the API.
- Do not put `SESSION_SECRET` in the web app or any `VITE_*` variable.
- Keep `WORLD_OIDC_ISSUER`, `WORLD_CLIENT_ID`, and `WORLD_CLIENT_SECRET` in `.env`. Approve needs them. `WORLD_REDIRECT_URI` and `COOKIE_SECRET` are unused.
