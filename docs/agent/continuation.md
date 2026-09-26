# Continuation

**Updated:** 2026-09-26

Handoff from `planning-v2.md` onto the repo that exists now. Where that spec disagrees with this file, this file wins.

## Locked

- Rules stay in Postgres. `evaluatePolicy` reads the `policies` table. ENS stays identity. Copying rules onto ENS text records is last, after the Postgres policy path is finished.
- Payments stay on Ethereum Sepolia, chain id `11155111`, Circle USDC. No Base.
- Intercepta stays on `X402_PAYMENT`, after policy and before signing. A missing `INTERCEPTA_API_KEY` refuses the payment.
- Stack stays this repo: Elysia, Drizzle, and the current packages. `GET /x402/resource` on the API is the paid resource. No Hono seller app. No rename. `ActionRequest` stays the agent API. Do not replace it with `POST /api/v1/fetch`.

## Open for Ankit

Do not close these in code until he writes the choice in `decisions.md`.

**Signer custody.** The code signs with one `LocalKeySigner` (`EXECUTOR_PRIVATE_KEY`) and an exact EIP-3009 slip, then that same key broadcasts the Sepolia transaction. His spec uses a wallet per agent, encrypted at rest. Either can be the end state. Leave `packages/signers/local` and `packages/executors/x402` in place until he decides.

**World approval shape.** `POST /approvals/:id/approve` executes with no World ticket. For an `X402_PAYMENT`, that path settles USDC in `apps/api/src/modules/approvals/service.ts`. Phase 5 is his, in `packages/integrations/world` (still empty). He decides how a World result proves that one approval, including whether World also becomes the owner session. The existing decision says World is the step-up, not the login. He supersedes that decision if the proof should include login.

## Step order

1. Phase 5. World check on the existing approval path. Leave the signer alone.
2. Custody. No code until the open question is closed.
3. Done. An action is refused when the ENS name is missing or expired. Registration sets the resolver and the ETH address. Policy rows stay in Postgres.
4. Last: publish policy onto ENS records. A looser policy edit needs a fresh approval. Tighter edits can keep writing immediately.
