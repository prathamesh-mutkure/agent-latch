# Continuation

**Updated:** 2026-09-26

Handoff from `planning-v2.md` onto the repo that exists now. Where that spec disagrees with this file, this file wins.

## Locked

- The spending decision reads the name's text records. Postgres stores the owner's saved policy. A tighter edit is written to the name, then to Postgres. A looser edit is rejected until the World check can publish it. A content hash of the policy, instead of plaintext records, is a post-hackathon privacy step.
- Payments stay on Ethereum Sepolia, chain id `11155111`, Circle USDC. No Base.
- Intercepta stays on `X402_PAYMENT`, after policy and before signing. A missing `INTERCEPTA_API_KEY` refuses the payment.
- Stack stays this repo: Elysia, Drizzle, and the current packages. `GET /x402/resource` on the API is the paid resource. No Hono seller app. No rename. `ActionRequest` stays the agent API. Do not replace it with `POST /api/v1/fetch`.

## Open for Ankit

Do not close these in code until he writes the choice in `decisions.md`.

**Signer custody.** The code signs with one `LocalKeySigner` (`EXECUTOR_PRIVATE_KEY`) and an exact EIP-3009 slip, then that same key broadcasts the Sepolia transaction. His spec uses a wallet per agent, encrypted at rest. Either can be the end state. Leave `packages/signers/local` and `packages/executors/x402` in place until he decides.

**World approval shape.** Closed on 2026-09-26 in `decisions.md` ("World ID for Agents"). World is the login and the step-up.

## Step order

1. Phase 5. World check on the existing approval path. Leave the signer alone. Built; the live sandbox round trip waits on client registration.
2. Custody. No code until the open question is closed.
3. Done. An action is refused when the ENS name is missing or expired. Registration sets the resolver, the ETH address, and the policy text records. Decisions read those records.
4. Later: publishing a looser policy after the World check. A content hash in place of the plaintext records is post-hackathon.
