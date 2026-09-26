# AgentPass — Technical Architecture

Sep 26, 2026 · @Ankit Kokane

## Overview

AgentPass lets AI agents pay for online services under rules a human sets, and pulls that human back in with a fresh World ID check whenever the stakes go up.

Today an agent that can pay is like an intern holding your credit card with no limits. AgentPass puts a finance office between the agent and the money: the agent asks, the platform checks the rules, and it pays, blocks, or asks the owner.

**What the product does**

- Gives every agent a public passport: an ENS name holding its spending rules.
- Holds each agent's wallet so the agent never touches a private key.
- Checks every payment against the rules before paying with x402 on Base Sepolia.
- Requires a fresh World ID approval for payments over the limit and for loosened rules.
- Lets the owner kill an agent instantly by unregistering its name.

### Target prize tracks

| Track | What we demonstrate |
| --- | --- |
| World ID for Agents | Owner sign-in; fresh approval before a payment or a loosened rule; deny, expire and wrong-person paths; all results validated on the server; integration debrief |
| ENSv2 (Sepolia) | Each agent is an ENS name with its own resolver; per-key permissions so the agent cannot edit its own limits; expiry; unregister as kill switch; live demo and public repo |

### Scope

| In scope | Deliberately cut |
| --- | --- |
| React app served by one Elysia server | IDKit (sign-in already recognizes each human) |
| World ID for Agents sign-in and fresh approvals | Intercepta screening (blocks come from rules instead) |
| ENSv2 agent passports with permissions | MCP server and SDK packages |
| x402 payments in test USDC on Base Sepolia | Bazaar discovery |
| Policy engine: pay, ask, or block | Seller discounts and human-backed badge |
| Built-in demo agent and bring-your-own agents | Per-human subname registries |
| Three demo sellers plus one scam seller | Owner crypto wallets |
| Postgres ledger and dashboard | Live streaming (dashboard polls instead) |

### Key terms

| Term | Meaning here |
| --- | --- |
| Agent | An AI that takes actions on its own, including paying for services |
| Gate | Our Elysia server; every agent payment passes through it |
| Front door | The one API address agents call to pay: `POST /api/v1/fetch` |
| Agent key | A secret password that identifies one agent to the front door |
| Passport | The agent's ENS name plus its rules, public on Sepolia |
| `sub` | The owner's private World ID number in our app; never put onchain |
| Fresh approval | A new World ID verification made at the moment of a risky action |
| Permission slip | A signed USDC transfer authorization for one exact amount and recipient |
| Facilitator | The x402 service that submits payments to Base Sepolia and pays fees |

## System architecture

One Elysia server on Railway serves the React app and every API at a single HTTPS address; it is the only component that decides, signs, or talks to the chains.

&#91;embedded content: system architecture · one server, six modules, six external services\]

The front door is the only way an agent can spend. Every other module supports it: identity, passports, rules, and signing.

### Deployed pieces

| Piece | Runs on | Role |
| --- | --- | --- |
| Main server | Elysia on Bun, Railway service 1 | Serves the React build, `/auth/*` and `/api/*` |
| Seller service | Hono on Bun, Railway service 2 | Three demo paid APIs plus one scam seller, all x402 |
| Database | Postgres (Railway or Supabase) | All private data |
| AI model | Model provider API | Brain of the built-in agent |

**Why one address for React and the API:** login cookies stay first-party and reliable, and World's sign-in callback lands on the same server that validates it.

### Modules inside the server

| Module | Responsibility |
| --- | --- |
| Auth + approvals | World sign-in, fresh approvals, server-side ticket checks |
| Front door + gate | Runs the payment pipeline for `POST /api/v1/fetch` |
| Policy engine | Pure function returning pay, ask, or block |
| Passport service | Creates agent names and resolvers on ENSv2; reads rules |
| Signer | Decrypts agent keys in memory and signs exact permission slips |
| Agent runner | Runs the built-in agent through the same front door |

## Tech stack and repository

Everything is TypeScript on Bun, with all real logic in framework-free packages so the routes stay thin and the policy engine stays testable.

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React + Vite, React Router | Built to static files and served by Elysia |
| Frontend data | TanStack Query + Eden Treaty | Typed calls to the Elysia API |
| Backend | Elysia on Bun | Long-running server on Railway |
| Validation | Elysia built-in schemas | Every request body checked |
| Sessions | Elysia signed cookies | http-only, secure, SameSite=Lax |
| World sign-in | openid-client v6 | Discovery, PKCE, ticket validation |
| Database | Postgres + Drizzle ORM | Railway Postgres or Supabase |
| Chain access | viem | ENSv2 on Sepolia, USDC on Base Sepolia |
| Payments | @x402/fetch + @x402/evm | Buyer side, inside the signer |
| Sellers | Hono + x402 seller middleware | Separate service |
| Agent brain | Any model API with tool calling | Two tools: list services, paid fetch |
| Key encryption | AES-256-GCM, master key in env | Agent wallet keys and console keys |

### Repository layout

```text
agentpass/
  apps/
    web/        React + Vite pages: Setup, Dashboard, AgentDetail, Approve, Console
    api/        Elysia server: plugins (session, agent key), routes, static serving
    sellers/    Hono service: FastConvert, CheapConvert, ProConvert, ScamConvert
  packages/
    policy/     pure decision function + tests
    ens/        ENSv2 bootstrap, agent setup, reads, unregister
    world/      OIDC client, ticket checks, approval binding
    pay/        quote parsing, signer, x402 client
  scripts/      one-time ENS bootstrap, demo seeding
```

**Rules for the codebase:**

- Routes in `apps/api` only parse input, call a package, and shape the answer.
- Only the signer in `packages/pay` ever sees a decrypted key.
- The built-in agent calls the front door over HTTPS with a real key; it never imports gate code.

## Identity with World ID for Agents

World ID for Agents is an OpenID Connect sign-in service on the event's sandbox; we use it twice: once to sign the owner in, and again as a fresh approval whenever an agent's action needs a human.

### Owner sign-in

1. The owner clicks Sign in with World ID; the server builds a login request from World's discovery document with PKCE, a random `state` and a `nonce`, stored in a short-lived signed cookie.
2. The owner completes World ID (proofs are mocked in the sandbox).
3. World redirects to `/auth/world/callback`; the server exchanges the code for tokens.
4. The server validates the ID token: signature against World's published keys, `iss`, `aud`, `exp`, `state`, `nonce`.
5. The server stores `(iss, sub)` in `users` and sets a signed, http-only session cookie.

`sub` is the owner's private, per-app World ID number. It lives only in our database and is never written onchain.

### Fresh approval

Two actions need one: a payment the policy engine sends to ask, and loosening an agent's rules.

1. The gate creates an `approvals` row with a 5-minute expiry and `binding_hash = sha256(approval_id | agent | amount | token | payTo | expires_at)`; for a rule change the hash covers the proposed rules.
2. The dashboard shows it; the owner opens `/approve/:id` with the details and Approve or Deny.
3. Approve sends the browser to `/auth/world/step-up?approval=:id`, which starts a new sign-in with `nonce = binding_hash`, the approval id in the cookie, and forced freshness (`max_age=0` or `prompt=login`, whichever World's discovery document supports).
4. The callback validates the ticket, then runs the approval checks below.
5. If all pass, the server marks the approval approved and immediately executes the payment or writes the rules. The agent never triggers execution.

**Approval checks on the server:**

- Ticket signature, `iss`, `aud`, `exp` are valid.
- `nonce` equals the stored `binding_hash`, so the ticket fits this one action.
- `auth_time` is after the approval was created, so the human is present now.
- `sub` equals the agent owner's `sub`.
- The approval is still pending and not expired.

### Approval outcomes

| Status | Trigger | Money moves? |
| --- | --- | --- |
| paid / applied | All checks passed and execution succeeded | Yes |
| denied | Owner pressed Deny | No |
| expired | 5 minutes passed; checked whenever the approval is read | No |
| cancelled | Owner abandoned the World screen and cancelled | No |
| failed: WRONG\_HUMAN | `sub` did not match the owner | No |
| failed: STALE\_VERIFICATION | `auth_time` older than the approval | No |
| failed: QUOTE\_CHANGED | Seller price or recipient changed before paying | No |
| failed: PAYMENT\_FAILED | Settlement rejected | No |

Every non-paid outcome releases the reserved amount and is written to the ledger.

### Setup notes

- Register the app in the [World ID for Agents sandbox portal](http://sandbox.auth.world.org/portal) or with the [official agent plugin](https://github.com/worldcoin/world-id-agent-plugin); approve the portal link within 20 minutes.
- The callback must be HTTPS; the sandbox rejects plain-HTTP localhost, so use the Railway address or a named tunnel.
- Check the discovery document for the client authentication method (secret or `private_key_jwt`) and supported freshness options.
- Keep a friction log from the first attempt for the required integration debrief.

## ENSv2 agent passports

Every agent is an ENSv2 name on Sepolia with its own resolver holding its rules, and per-key permissions mean the agent cannot change its own limits even if it tries.

Names look like `researcher-alice.agentpass.eth`. The owner has no wallet: the gate's ENS key writes on the owner's behalf, only after a signed-in request, and loosening needs a fresh World approval first. ENSv2 contracts are beta, so all addresses come from ENS's Sepolia ENSv2 deployments table and live in one config file.

### One-time bootstrap

1. Register `agentpass.eth` through the ENSv2 ETH Registrar on Sepolia.
2. Deploy a UserRegistry for it through the Verifiable Factory and point `agentpass.eth` at it with `setSubregistry`.
3. Give the gate's ENS key `ROLE_REGISTRAR` on that registry.

### Per-agent setup

1. Generate the agent's wallet (see Wallets, keys and payments).
2. Deploy a Permissioned Resolver for this agent through the Verifiable Factory; its `initialize` writes the starting records in the same transaction.
3. Grant the agent's wallet `setText` rights on `description` only, using `grantSetterRoles`.
4. Register the label in the agentpass registry: owner = the gate, resolver = this resolver, expiry = now + 7 days, and a role bitmap without transfer or resolver-change rights.

**Why one resolver per agent:** a key-scoped permission applies to every name on the same resolver, so a shared resolver would let one agent edit another agent's description.

### Records on each name

| Key | Example | Written by |
| --- | --- | --- |
| `policy.dailyLimit` | `10` (USDC) | Gate, for the owner |
| `policy.perTxLimit` | `2` | Gate, for the owner |
| `policy.approveAbove` | `2` | Gate, for the owner |
| `policy.tokens` | `USDC` | Gate, for the owner |
| `policy.allowlist` | `fastconvert.example,proconvert.example` | Gate, for the owner |
| `policy.payees` | pinned receiving address per allowed seller | Gate, for the owner |
| `description` | free text | Agent or gate |
| `addr` | agent wallet address | Gate only |

### Permissions

| Action | Gate | Agent wallet | Anyone else |
| --- | --- | --- | --- |
| Edit `policy.*` records | Yes | No: reverts with `EACUnauthorizedAccountRoles` | No |
| Edit `description` | Yes | Yes | No |
| Edit `addr` | Yes | No | No |
| Renew or unregister the name | Yes | No | No |
| Transfer the name | No | No | No |
| Change the name's resolver | No | No | No |

### Reading a passport on every request

1. Call `getState` on the agentpass registry: the name must be `REGISTERED` and unexpired.
2. Read the records through the Universal Resolver (viem configured with the ENSv2 Sepolia address).
3. Cache for about 10 seconds so rule edits show up almost immediately.

### Lifecycle on ENS

| Event | ENS action |
| --- | --- |
| Agent created | Resolver deployed, name registered for 7 days |
| Rules tightened | Gate writes `policy.*` immediately |
| Rules loosened | Gate writes `policy.*` only after a fresh World approval |
| Renewed | `renew` extends expiry |
| Deleted | `unregister`: the name is available again and every request is blocked |
| Expired | No action needed; `getState` reports it and every request is blocked |

ENS writes go through a queue, one transaction at a time, so the gate key's transaction sequence numbers never collide.

Reference: [Permissioned Registry](https://docs.ens.domains/ensv2/permissioned-registry), [Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/), [Enhanced Access Control](https://docs.ens.domains/ensv2/enhanced-access-control/).

## Agents

Agents connect in two ways, the built-in agent we host and any developer's own agent, and both use the same front door with an agent key, so the demo shows the real security.

### Option 1: built-in agent

| Part | What it is | Runs in |
| --- | --- | --- |
| Agent Console page | Owner types a task and watches progress | React app |
| Agent runner | Loop that calls the AI model and executes tools | Elysia server |
| AI model | Decides each step | Model provider API |
| Tool: list services | Returns the seller catalog: name, address, price, purpose | Server config |
| Tool: paid fetch | Sends `POST /api/v1/fetch` over HTTPS | Server, calling our public address |

**Console key.** Agent keys are stored only as hashes, so the runner cannot recover one. At agent creation the platform issues a second key marked console-only and stores it encrypted like wallet keys; the runner decrypts it per run and uses it exactly like an outside agent.

**A run, step by step:**

1. The owner picks an agent, types a task, and presses Run; the server creates a `runs` row.
2. The runner sends the model standing instructions, the task, and the two tool definitions. Instructions: use the cheapest suitable service, pay only through paid fetch, read block reasons and try alternatives, wait on approvals, never work around a block.
3. The model returns either a final answer or a tool call.
4. List services returns the catalog. Paid fetch calls the front door with the console key, a fresh idempotency key, the URL, the data, and the model's purpose.
5. The runner passes each result back to the model and repeats.
6. On a pending answer the runner, not the model, polls the approval and shows "waiting for owner approval"; it passes the final outcome to the model.
7. The model returns a summary, for example: "Converted with FastConvert for $0.50; CheapConvert was blocked because it is not on your allowlist."

Every step is saved to `run_events`; the console polls every 1 to 2 seconds and shows short readable lines.

**Limits:** at most 10 tool calls per run, a few minutes per run, one run per agent at a time, and a Stop button. The model never sees a key or wallet. Seller responses are treated as data, never instructions.

### Option 2: bring your own agent

1. The developer signs in, creates an agent, and copies its key, which is shown once.
2. They store the key as a server-side setting in their own environment, never in a browser app or a public repo.
3. The Connect your agent panel shows the front door address, the answers, the reason codes, and the test sellers.
4. They add one tool to their agent that sends paid requests to the front door instead of the seller.
5. They handle the answers: result, blocked with a reason, or pending with an approval id to poll.
6. They test against the demo sellers while watching the dashboard.

The front door acts as a paying middleman: it returns exactly what the seller returned. Developers need no wallet, no crypto, and no x402 knowledge. Services that do not ask for payment pass through as free, still subject to the allowlist.

### Side by side

|  | Built-in agent | Bring your own |
| --- | --- | --- |
| For | Any owner | Developers |
| Runs on | Our server | Their machine |
| Key used | Console key, stored encrypted | Key shown once to the developer |
| Front door, rules, approvals | Same | Same |
| In the demo | Main show | Optional 20-second clip |

## API contract

Agents use exactly two endpoints, pay and check an approval; everything else is for the owner's browser behind a session cookie.

### All endpoints

| Method and path | Caller | Auth | Purpose |
| --- | --- | --- | --- |
| GET `/auth/world/login` | Browser | none | Start World sign-in |
| GET `/auth/world/callback` | World redirect | state cookie | Finish sign-in or step-up |
| GET `/auth/world/step-up?approval=:id` | Browser | session | Start a fresh approval |
| POST `/api/agents` | Browser | session | Create agent: wallet, keys, ENS name |
| GET `/api/agents` and `/api/agents/:id` | Browser | session | Agents, balances, today's spend |
| POST `/api/agents/:id/rules` | Browser | session | Tighten now, or open a policy approval to loosen |
| POST `/api/agents/:id/renew` | Browser | session | Extend expiry |
| DELETE `/api/agents/:id` | Browser | session | Sweep funds, unregister name, destroy keys |
| POST `/api/agents/:id/fund` | Browser | session | Send capped test USDC from the treasury |
| POST `/api/agents/:id/rotate-key` | Browser | session | Replace the agent key |
| GET `/api/feed` | Browser | session | Recent decisions and approvals, polled |
| POST `/api/approvals/:id/deny` | Browser | session (owner) | Deny |
| POST `/api/runs` and GET `/api/runs/:id/events` | Browser | session | Built-in agent runs |
| POST `/api/v1/fetch` | Agent | agent key | Pay for a service |
| GET `/api/v1/approvals/:id` | Agent | agent key | Check a pending approval |

### Pay request: POST /api/v1/fetch

| Part | Field | Required | Meaning |
| --- | --- | --- | --- |
| Header | `Authorization` | Yes | `Bearer <agent key>` |
| Header | `Idempotency-Key` | Recommended | Unique per payment attempt; reuse only when retrying it |
| Body | `url` | Yes | Seller address, HTTPS only |
| Body | `method` | No | GET (default) or POST |
| Body | `body` | No | Data for the seller, up to about 1 MB |
| Body | `purpose` | Yes | Up to 200 characters; shown to the owner |
| Body | `maxAmount` | No | Agent's own cap for this call |

Agents should allow 30 seconds for a paid request; a paid call usually takes 3 to 8 seconds.

### Pay responses

| HTTP | `status` | When | Returns |
| --- | --- | --- | --- |
| 200 | `paid` | Payment settled | Seller data and content type; amount, token, network, recipient, transaction id; budget left today; decision id |
| 200 | `free` | Seller asked for no payment | Seller data |
| 202 | `pending` | Owner approval needed | Approval id, expiry, seconds before polling, reason |
| 403 | `blocked` | Rules said no | Reason code, message, decision id |
| 401 | `unauthorized` | Bad or rotated key | Nothing else |
| 400 | `invalid_request` | Bad input | What was wrong |
| 409 | `in_progress` | Same idempotency key still running | Retry shortly |
| 429 | `rate_limited` | Over 30 requests per minute | When to retry |
| 502 | `seller_error` | Seller failed or timed out | Whether money moved (usually not) |

### Reason codes

| Code | Meaning |
| --- | --- |
| `PASSPORT_INACTIVE` | Name deleted or expired |
| `SERVICE_NOT_ALLOWED` | Seller host not on the allowlist |
| `PAYEE_MISMATCH` | Seller asked to be paid to an address other than the pinned one |
| `TOKEN_NOT_ALLOWED` | No acceptable token or network offered |
| `OVER_PER_PAYMENT_LIMIT` | Price above the per-payment limit |
| `OVER_DAILY_LIMIT` | Would exceed today's limit |
| `OVER_AGENT_MAX` | Price above the agent's own `maxAmount` |
| `INSUFFICIENT_FUNDS` | Wallet balance too low |
| `QUOTE_CHANGED` | Price or recipient changed before paying |

### Approval check: GET /api/v1/approvals/:id

Same agent key; an agent sees only its own approvals. Status is `pending`, `paid` (with the same fields as a paid answer), `denied`, `expired`, or `failed` with a reason. After approval the server pays immediately and keeps the seller's response for about an hour, up to about 1 MB.

## Gate pipeline and policy engine

Every pay request runs the same ordered checks, and any check can end the request early; money moves only after all of them pass.

### Pipeline for POST /api/v1/fetch

| # | Step | What happens | Early exit |
| --- | --- | --- | --- |
| 1 | Idempotency | Same key seen for this agent in 24 hours? | Saved outcome, or 409 if still running |
| 2 | Rate limit | 30 requests per minute per agent | 429 |
| 3 | Agent key | Hash the key, find the agent | 401 |
| 4 | Input | HTTPS, public IP only, no redirects to other hosts, size caps | 400 |
| 5 | Passport | ENS name registered and unexpired; rules loaded (10 s cache) | 403 `PASSPORT_INACTIVE` |
| 6 | Allowlist | Seller host on `policy.allowlist` | 403 `SERVICE_NOT_ALLOWED` |
| 7 | Price probe | Call the seller with no payment, 10 s timeout | Not 402: 200 `free` or 502 |
| 8 | Payment option | Pick USDC on Base Sepolia from the seller's options | 403 `TOKEN_NOT_ALLOWED` |
| 9 | Payee pin | Recipient equals the pinned address for this seller | 403 `PAYEE_MISMATCH` |
| 10 | Lock and limits | Lock the agent row; count reserved plus confirmed spend | 403 over-limit codes |
| 11 | Approval needed | Amount above `policy.approveAbove` | 202 `pending`, amount reserved |
| 12 | Reserve | Mark the amount as spent but unconfirmed | none |
| 13 | Balance | On-chain USDC balance covers the amount | 403 `INSUFFICIENT_FUNDS`, released |
| 14 | Re-probe | Seller still quotes the same recipient and amount | 403 `QUOTE_CHANGED`, released |
| 15 | Sign and settle | Signer signs the exact slip; seller settles via facilitator | 502, released |
| 16 | Respond | Confirm payment, record transaction id, return data | 200 `paid` |

Approved payments resume at step 12 on the server the moment the owner's approval passes its checks.

### Policy engine

The engine is a pure function with no network calls: it takes the passport, the quote, and today's spend, and returns pay, ask, or block with a reason.

**Order of rules:**

1. Passport inactive: block.
2. Seller not allowed, or recipient not the pinned payee: block.
3. Token or network not allowed: block.
4. Price above `policy.perTxLimit` or the agent's `maxAmount`: block.
5. Today's reserved plus confirmed spend plus this price above `policy.dailyLimit`: block.
6. Price above `policy.approveAbove`: ask.
7. Otherwise: pay.

### Rule changes

| Change | Examples | Effect |
| --- | --- | --- |
| Stricter | Lower a limit, remove a seller or token | Gate writes to ENS immediately |
| Looser | Raise a limit, add a seller or token | Policy approval created; written to ENS only after a fresh World approval |
| By the agent | Agent wallet calls `setText` on a policy key | Reverts on chain with `EACUnauthorizedAccountRoles` |

A change counts as looser if any single field loosens, so mixed edits always need approval.

## Wallets, keys and payments

The gate holds every wallet key encrypted and signs one exact, one-time permission slip per payment; agents never hold a key and never need gas.

### Wallets

| Wallet | Network | Holds | Controlled by | Job |
| --- | --- | --- | --- | --- |
| Agent wallet, one per agent | Base Sepolia | Test USDC only | Gate, key encrypted in the database | Pays sellers |
| Team treasury | Base Sepolia | Test USDC and a little ETH | Gate, key in server settings | Funds agents, sweeps them back |
| Gate ENS wallet | Ethereum Sepolia | Test ETH | Gate, key in server settings | Pays gas for ENS writes |
| Seller wallets, one per seller | Base Sepolia | Received USDC | Team, as the seller | Receives payments |
| Facilitator | Base Sepolia | Its own ETH | External x402 service | Submits payments, pays fees |

### Secrets

| Secret | Stored in |
| --- | --- |
| Master encryption key (32 random bytes) | Railway secret settings only |
| Agent wallet keys and console keys | Database, encrypted with the master key |
| Treasury key, gate ENS key, World client secret | Railway secret settings |
| Agent keys | Database as SHA-256 hashes only |

No secret ever goes in code, the React build, or any `VITE_` setting. The repo is public for the ENS prize, so `.env` is git-ignored and GitHub secret-scanning push protection is on before the first commit.

### Storing an agent key

1. Generate the key with a secure random generator (viem) and derive its address.
2. Encrypt with AES-256-GCM: master key, fresh random 12-byte IV, and the agent id plus address as additional authenticated data, so a ciphertext copied to another row fails to decrypt.
3. Store ciphertext, IV, auth tag, and a key version for later master-key rotation.
4. Discard the plain key; it is never logged or returned.

### The signer

The signer in `packages/pay` is the only code that sees a decrypted key. It takes an agent id plus the approved payment and returns a signed slip, never the key.

1. Load and decrypt the agent key; the authenticated-data check must pass.
2. Receive the slip the x402 library wants signed, through a custom signer wrapper.
3. Compare it field by field with the approved payment: recipient, amount, USDC contract address, Base Sepolia chain id, expiry within minutes. Any mismatch: refuse.
4. Sign, then overwrite the key buffer.
5. Log agent, recipient, amount, slip number and decision id, never the key.

### The permission slip

x402's exact scheme for USDC uses a transfer-with-authorization message signed in EIP-712 form, bound to the USDC contract on Base Sepolia.

| Field | Value |
| --- | --- |
| From | Agent wallet |
| To | Approved, pinned seller address |
| Value | Approved amount in 6-decimal units ($4.50 = 4,500,000) |
| Valid after | Now, slightly backdated for clock drift |
| Valid before | Now plus the seller's time limit |
| Nonce | 32 random bytes; USDC rejects any nonce used before |

### How money moves

1. The gate signs the slip and retries the seller request with it in the x402 payment header.
2. The seller forwards it to the facilitator, which verifies the signature and balance.
3. The facilitator submits it to the USDC contract and pays the fee.
4. USDC moves exactly the amount to exactly the recipient and burns the nonce.
5. The seller returns its data plus a receipt with the transaction id, in about 2 to 3 seconds.
6. The gate records the transaction id and nonce and returns the data.

### Other wallet operations

- **Funding:** the treasury sends normal USDC transfers, capped at $5 per agent and 3 fundings per owner.
- **ENS writes:** one transaction at a time through a queue; stuck transactions are resent with a higher fee.
- **Deleting or compromising an agent:** the gate signs a slip moving the remaining USDC to the treasury, the treasury submits it and pays gas, then the ciphertext is deleted and the name unregistered.
- **Master key rotation:** decrypt with the old key, re-encrypt with the new, bump the key version, retire the old key when no row uses it.

### Why a rogue agent cannot send money anywhere

- It has no wallet key and there is no transfer endpoint, only "pay for this service".
- Sellers must be on the allowlist, and the recipient must match the pinned payee.
- Limits cap any damage; larger amounts need the owner's World ID.
- The slip pays one exact amount to one exact address, once, within minutes.

## Data model

Postgres holds everything private; ENS holds only the agent's public name, rules, description and wallet address.

| Table | Key columns | Purpose |
| --- | --- | --- |
| `users` | id, world\_iss, world\_sub (unique together), created\_at | One row per owner |
| `agents` | id, user\_id, ens\_name (unique), resolver\_addr, wallet\_addr, key\_ciphertext, key\_iv, key\_tag, key\_version, console\_key\_ciphertext, api\_key\_hash, status, expires\_at | Agent identity, wallet and keys |
| `decisions` | id, agent\_id, url, purpose, quote (json), rules\_snapshot (json), verdict, reason, created\_at | Every pay request and its outcome |
| `approvals` | id, kind (payment or policy), decision\_id, agent\_id, proposed\_rules (json), binding\_hash, status, reason, expires\_at, world\_auth\_time, resolved\_at, result (json, capped) | Fresh approval lifecycle |
| `payments` | decision\_id, amount, token, network, pay\_to, nonce, tx\_hash, status (reserved, confirmed, released), created\_at, settled\_at | Reservations and settled payments |
| `idempotency_keys` | agent\_id, key, decision\_id, response (json), created\_at | Retry protection, 24 hours |
| `fundings` | id, agent\_id, user\_id, amount, tx\_hash, created\_at | Treasury top-ups, for caps |
| `runs` | id, agent\_id, task, status, started\_at, ended\_at | Built-in agent runs |
| `run_events` | id, run\_id, kind, text, created\_at | Console lines |

**Spend today** = sum of `payments` for the agent where status is reserved or confirmed and created today (UTC).

**Indexes:** `agents.api_key_hash`, `decisions(agent_id, created_at)`, `payments(decision_id)`, `approvals(agent_id, status)`, `idempotency_keys(agent_id, key)` unique.

## Security model

The agent is untrusted, the seller is untrusted, and the gate is the one trusted component; every threat below is stopped by a check the agent cannot influence.

| Threat | Protection |
| --- | --- |
| Agent sends money to a random wallet | No wallet key and no transfer endpoint; allowlist; pinned payee; limits |
| Agent raises its own limit | ENS rejects its write; loosening needs the owner's fresh World approval |
| Agent approves its own payment | Only a World ticket with the owner's `sub`, fresh `auth_time` and matching `nonce` approves |
| Approval replayed for another payment | `nonce = binding_hash` ties each ticket to one exact action |
| Stale login reused as approval | `auth_time` must be after the approval was created |
| Seller changes price or address after approval | Re-probe before signing; slip signed only for approved values |
| Seller asks for more than approved | Signer compares every slip field and refuses mismatches |
| Slip replayed | USDC burns each random nonce; slips expire within minutes |
| Retry causes double payment | Idempotency keys stored for 24 hours |
| Parallel requests beat the daily limit | Per-agent row lock; reserved plus confirmed spend counted |
| Agent points the gate at internal addresses | HTTPS only, public IPs only, no cross-host redirects |
| Agent key stolen | Same rules and approvals apply; owner rotates the key or deletes the agent |
| Prompt injection in seller responses | Treated as data; the gate enforces rules whatever the model decides |
| Database leak | Agent keys stored as hashes; wallet keys encrypted with a key that is not in the database |
| Owner identity exposed | `sub` never written onchain; ENS holds only public agent data |
| Treasury drained through funding | $5 per agent, 3 fundings per owner |
| Gate server compromised | Remaining trust assumption; mitigations listed under Limitations |

**Checklist before the demo:**

- [ ] Every World result validated on the server; client secret only in server settings.
- [ ] Signer is the only code that decrypts keys; nothing logs keys, tickets or cookies.
- [ ] Allowlists in the demo name specific sellers; no wildcard.
- [ ] Secret scanning on; `.env` git-ignored; no `VITE_` secrets.

## End-to-end flows

Six flows cover the whole product; the approved payment below is the one that carries the World ID for Agents story.

&#91;embedded content: approved payment · agent, gate, owner, seller\]

Solid arrows are requests, dashed arrows are replies. A deny, an expiry, or a failed check at the gate stops the flow before the retry, and the agent's poll returns that outcome.

### 1. Sign in

1. Owner signs in with World ID; the server validates the ticket.
2. Server stores `(iss, sub)` and sets the session cookie; the dashboard opens.

### 2. Create an agent

1. Owner enters a name and limits, including the allowlist of sellers.
2. Gate generates the wallet key and console key, encrypts both, and stores the hashed agent key.
3. Gate deploys the agent's resolver with starting records and registers the name for 7 days.
4. Owner clicks Fund; the treasury sends up to $5 test USDC.
5. The agent key is shown once.

### 3. Automatic payment

1. Agent calls the front door; checks pass; price is within limits.
2. Gate reserves the amount, re-probes, signs, and the seller settles.
3. Agent receives 200 `paid` with the data; the dashboard shows it.

### 4. Payment needing approval

As in the diagram. Outcomes other than paid release the reservation and are logged.

### 5. Change rules

1. Owner edits rules on the agent page.
2. Stricter: the gate writes them to ENS at once.
3. Looser: a policy approval opens; after a fresh World approval the gate writes them.
4. If the agent tries to write its own rules, ENS reverts the transaction.

### 6. Delete or expire

1. Delete: gate sweeps remaining USDC to the treasury, unregisters the name, destroys the keys.
2. Expire: after 7 days without renewal the name stops resolving as registered.
3. Either way, the next request gets 403 `PASSPORT_INACTIVE`.

## Deployment and setup

Two Railway services and one Postgres database; deploy the empty skeleton first so the permanent HTTPS address exists before World registration.

### Services

| Service | Build | Start | Address |
| --- | --- | --- | --- |
| api | Install, then build `apps/web` into static files | Run the Elysia server | Railway HTTPS domain; World callback at `/auth/world/callback` |
| sellers | Install | Run the Hono seller service | Its own Railway domain |
| Postgres | n/a | Managed | Private connection string |

**Local development:** Elysia on port 3000, Vite on 5173 with `/api` and `/auth` proxied to 3000. World sign-in needs HTTPS, so test it on the deployed service or through a named tunnel registered as a second callback.

**Constraints:** one api instance only (polling and in-memory state assume it); the `*` fallback to the React app is registered after all API routes; the OIDC cookie uses `SameSite=Lax` so it survives World's redirect back.

### Environment variables

| Variable | Service | Secret |
| --- | --- | --- |
| `WORLD_OIDC_ISSUER`, `WORLD_CLIENT_ID`, `WORLD_REDIRECT_URI` | api | No |
| `WORLD_CLIENT_SECRET` (or `WORLD_CLIENT_PRIVATE_KEY`) | api | Yes |
| `COOKIE_SECRET`, `AGENT_KEY_MASTER` | api | Yes |
| `DATABASE_URL` | api | Yes |
| `SEPOLIA_RPC_URL`, `ENS_UNIVERSAL_RESOLVER`, `ENS_FACTORY`, `AGENTPASS_REGISTRY` | api | No |
| `ENS_GATE_PRIVATE_KEY` | api | Yes |
| `BASE_SEPOLIA_RPC_URL`, `USDC_ADDRESS` | api, sellers | No |
| `TREASURY_PRIVATE_KEY` | api | Yes |
| `MODEL_API_KEY` | api | Yes |
| `X402_FACILITATOR_URL`, `SELLER_PAYTO_FAST`, `SELLER_PAYTO_CHEAP`, `SELLER_PAYTO_PRO`, `SELLER_PAYTO_SCAM` | sellers | No |
| `VITE_*` (public values only, if any) | web build | Never |

### Setup checklist

- [ ] Deploy the api skeleton and get its HTTPS domain.
- [ ] Register the app with the World ID for Agents sandbox; set the callback URL; store the credential in Railway.
- [ ] Run the ENS bootstrap script: register `agentpass.eth`, deploy its registry, grant the gate `ROLE_REGISTRAR`.
- [ ] Create the treasury, gate ENS and four seller wallets.
- [ ] Fund the treasury with Base Sepolia ETH and test USDC from Circle's faucet; fund the gate ENS wallet with Sepolia ETH.
- [ ] Deploy the seller service with the public x402 testnet facilitator.
- [ ] Run one full payment end to end.
- [ ] Seed one owner and one funded agent as a demo safety net.
- [ ] Record the backup demo video.
- [ ] Write the World ID for Agents debrief from the friction log.

## Demo, build plan and limits

The 4-minute demo shows every outcome live, and the build order gives a complete submission for both tracks after step 4.

### Demo script

| Minute | What judges see | What it proves |
| --- | --- | --- |
| 0:00 | Sign in with World ID; create an agent; show the Sepolia transaction | Real ENSv2 passport, nothing hard-coded |
| 0:45 | Console task: agent pays FastConvert automatically | Autonomous payment within rules |
| 1:15 | Agent tries CheapConvert or ScamConvert: blocked | Allowlist and pinned payee |
| 1:45 | Premium job via ProConvert: pending; owner denies | Unsuccessful path, no money moves |
| 2:15 | Retry; owner approves with fresh World ID; paid | Complete World ID for Agents journey |
| 3:00 | Agent tries to raise its own limit: ENS reverts | ENSv2 per-key permissions |
| 3:30 | Owner deletes the agent; next request blocked | Kill switch |

**Pitch line:** ENS holds the agent's public rules; World proves a real human is present whenever the stakes go up.

### Build order

| Step | Deliverable | Done when |
| --- | --- | --- |
| 1 | Elysia + React skeleton on Railway; World sign-in | Owner signs in on the live HTTPS address |
| 2 | Front door with hard-coded rules; seller service | Agent pays FastConvert end to end |
| 3 | Fresh approval with deny, expire, wrong-person paths | All outcomes visible on the dashboard |
| 4 | ENS passports replace hard-coded rules | Agent created live; rules read from ENS |
| 5 | Loosening needs approval; kill switch; agent-cannot-edit demo | Revert shown on screen |
| 6 | Built-in agent console; scam seller; polish | Full demo runs twice without help |
| 7 | Backup video; README; World debrief | Submitted |

### Team split

| Person | Owns |
| --- | --- |
| 1 | Front door pipeline, policy engine, signer, sellers |
| 2 | World sign-in, fresh approvals, debrief |
| 3 | ENSv2 bootstrap, passport service, permissions |
| 4 | React pages, agent console, demo script |

### Known limitations

- The gate holds all keys; a compromised server is the remaining trust assumption.
- Owners trust the gate to write their rules to ENS as requested.
- x402 has no built-in refunds if a seller takes payment and fails to deliver; the transaction id is kept as proof.
- Only x402 sellers can be paid; one api instance; test networks only.

### Future work

- Keys in a KMS or a managed wallet provider; signer as a separate private service.
- Smart-contract wallets that enforce limits on chain beneath the gate.
- Owner-held wallets for self-custodied rule edits.
- MCP server so Claude or Cursor can connect with a pasted key.
- Real USDC on Base mainnet; owner-funded agents; seller-side human-backed discounts.

### References

- [World ID for Agents sandbox docs](http://sandbox.auth.world.org/docs)
- [World ID agent plugin](https://github.com/worldcoin/world-id-agent-plugin)
- [ENSv2 Enhanced Access Control](https://docs.ens.domains/ensv2/enhanced-access-control/)
- [ENSv2 Permissioned Registry](https://docs.ens.domains/ensv2/permissioned-registry)
- [ENSv2 Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/)
- [x402](https://www.x402.org/ecosystem?category=facilitators)
