# AgentLatch --- ETHGlobal Tokyo 2026

> Original product brief. The updated architecture is [planning-v2.md](planning-v2.md). Locked deltas, open items, and the next steps are in [continuation.md](continuation.md). This file stays the original brief.

> **Status:** Project context / implementation brief\
> **Purpose:** Give the coding agent the complete product, technical,
> sponsor, architecture, and phased implementation context.\
> **Primary goal:** Build a working, polished hackathon project
> incrementally.\
> **Important:** The coding agent is responsible for scaffolding,
> implementation, integrations, tests, and setup. Direction that
> conflicts with [continuation.md](continuation.md) follows that file.

------------------------------------------------------------------------

## 1. Executive Summary

### Project name

**AgentLatch**

Working alternative names are acceptable, but the core concept should
remain recognizable as an evolution of the team's earlier AgentLatch
project.

### One-line pitch

> **AgentLatch is a permission and security layer that lets autonomous
> AI agents act on behalf of humans without giving them unlimited
> authority.**

The agent can operate in the background, call APIs, make x402 payments,
and eventually execute DeFi transactions. AgentLatch determines whether
an action is:

-   allowed automatically,
-   blocked,
-   or requires fresh human authorization.

The project combines:

-   **ENSv2** for agent identity and namespaces,
-   **World ID for Agents / IDKit** for human verification and
    exceptional authorization,
-   **Intercepta** for real-time security checks immediately before
    agent payments,
-   **x402** for machine-to-service / agent-to-agent payments,
-   a generic **executor architecture** so Uniswap/DeFi can be added
    later without changing the policy layer.

The flagship use case should be a **background autonomous
trading/financial agent**:

> A user gives an agent limited autonomous authority. The agent runs in
> the background. When it wants to perform an action outside its policy
> --- e.g. a larger trade --- AgentLatch pauses execution and requests
> human authorization. The user can approve or reject the action from a
> suitable approval surface. The same architecture also supports x402
> API/service payments.

------------------------------------------------------------------------

# 2. Why We Are Building This

AI agents are moving from generating text to taking actions:

-   calling APIs,
-   purchasing data or compute,
-   paying other agents,
-   moving stablecoins,
-   interacting with smart contracts,
-   managing treasuries,
-   executing trades,
-   delegating work to other agents.

The core problem is not merely "can an agent sign a transaction?"

The problem is:

> **How do we safely delegate authority to software that is capable of
> acting autonomously?**

An agent needs an identity, but identity alone is insufficient.

A practical system needs to answer:

1.  **Who is this agent?**
2.  **Who owns/controls it?**
3.  **What is this agent allowed to do?**
4.  **What is the maximum amount it can spend?**
5.  **Which counterparties/services may it interact with?**
6.  **Is the requested payment or destination risky?**
7.  **Does this action require a fresh human decision?**
8.  **Can the human approve that action remotely while the agent
    continues running?**
9.  **Can the authorization be constrained by amount, target, token,
    expiry, nonce, etc.?**
10. **Can the same authorization layer work for API payments today and
    DeFi transactions tomorrow?**

AgentLatch is intended to be this control plane.

------------------------------------------------------------------------

# 3. Connection to the Team's Previous AgentLatch Project

The team previously built an Algorand project called **AgentLatch**.

The earlier project described the problem as the lack of standardized
infrastructure for:

-   agent identity,
-   consent verification,
-   spending authorization,
-   regulatory/privacy controls,
-   x402 payments.

Its solution was a decentralized identity, consent, and payment
authorization layer where agents had:

-   onchain identity,
-   wallet,
-   permission registry,
-   x402 payment capability,
-   verifiable consent proofs,
-   policy-controlled access.

The earlier implementation direction used:

-   Algorand smart contracts,
-   x402 SDK,
-   OpenClaw/LangGraph,
-   onchain permission/consent state.

### How AgentLatch differs

AgentLatch should **not simply rebuild the old project**.

The evolution is:

> **AgentLatch 1.0:** "Who is this agent and what has the user consented
> to?"

> **AgentLatch:** "Can this exact agent perform this exact action,
> against this exact target, for this exact amount, right now?"

The focus moves from identity/consent as a static concept to **runtime
authorization and safe autonomous execution**.

The new project is also designed around the current agent/payment
ecosystem and ETHGlobal Tokyo sponsor requirements.

------------------------------------------------------------------------

# 4. Core Product Concept

AgentLatch is a runtime control plane between an autonomous agent and an
external action.

Conceptually:

``` text
AI Agent
   |
   | ActionRequest
   v
Policy Engine
   |
   +---- ALLOW --------------------------+
   |                                     |
   +---- BLOCK                           |
   |                                     |
   +---- HUMAN_APPROVAL                  |
                                         v
                               Approval / Authorization
                                         |
                                         v
                                     Executor
                                         |
                        +----------------+----------------+
                        |                |                |
                       x402             API           DeFi
                        |                                 |
                    payments                         Uniswap later
```

The policy engine should be independent of the execution mechanism.

That is important.

The agent should not need separate authorization logic for:

-   paying an API,
-   paying another agent,
-   swapping tokens,
-   executing a treasury transaction.

All of these should become an `ActionRequest`.

------------------------------------------------------------------------

# 5. Example User Story

A user creates:

``` text
trader.alice.eth
```

and gives it:

``` text
Autonomous trading:
  max $500 per trade

Human approval:
  $500 - $5,000

Blocked:
  > $5,000

Allowed token:
  USDC / ETH

Allowed execution venue:
  configured executor(s)
```

The agent runs in the background.

Later:

``` text
ETH falls 6%

Agent decision:
BUY $2,500 ETH
```

AgentLatch evaluates the request:

``` text
$2,500 > autonomous limit of $500

=> HUMAN_APPROVAL
```

The user receives an approval request:

``` text
Agent: trader.alice.eth

Action:
BUY ETH

Amount:
$2,500

Reason:
ETH dropped 6.1%

Policy:
Autonomous limit = $500

Risk:
Medium

[Approve] [Reject]
```

If approved, a constrained authorization is issued and the executor
performs the action.

If rejected, the transaction never executes.

This is the flagship use case.

------------------------------------------------------------------------

# 6. Secondary Use Case: Agentic API Payments

The same system should support x402.

Example:

``` text
Agent
  |
  | requests API
  v
API
  |
  | 402 Payment Required
  v
AgentLatch
  |
  +-- Policy check
  |
  +-- Intercepta security check
  |
  +-- payment authorization
  |
  v
x402 payment
  |
  v
API result
```

Example policy:

``` text
Agent:
research.alice.eth

Allowed:
  USDC
  approved API providers

Limit:
  $10/day
```

A `$0.50` API payment can happen autonomously.

A `$50` payment can require human approval.

A malicious/high-risk destination can be blocked.

This makes the system useful beyond trading.

------------------------------------------------------------------------

# 7. ETHGlobal Tokyo 2026 Sponsor Landscape

The official ETHGlobal Tokyo 2026 prize page currently lists:

  Sponsor                Total listed prize pool
  -------------------- -------------------------
  World                                 \$15,000
  1inch                                  \$7,000
  ENS                                   \$10,000
  Uniswap Foundation                    \$10,000
  Sui                                    \$5,000
  Curvegrid                              \$3,000
  Intercepta                             \$2,500

Source:

-   https://ethglobal.com/events/tokyo2026/prizes

The exact sub-prize and qualification rules should be checked again
before submission because sponsor requirements can change during the
event.

------------------------------------------------------------------------

# 8. Sponsors We Intend to Target

## Primary sponsor targets

### 8.1 ENS

**Target:** Best Use of ENSv2 --- \$6,000 main track.

ENS also has a \$4,000 Continuity Track prize for integrating ENSv2 into
an existing project, but that requires Continuity Track participation
and an existing project integration.

ENS's Tokyo brief is unusually aligned with this project.

ENSv2 provides:

-   hierarchical registries,
-   subnames,
-   Permissioned Resolver,
-   Enhanced Access Control,
-   delegated permissions,
-   scoped roles.

ENS specifically suggests AI-agent use cases such as giving agents their
own namespace, identity, and permissions.

Sources:

-   https://ethglobal.com/events/tokyo2026/prizes
-   https://docs.ens.domains/ensv2/overview/
-   https://docs.ens.domains/ensv2/enhanced-access-control/
-   https://docs.ens.domains/ensv2/permissioned-registry/
-   https://docs.ens.domains/ensv2/permissioned-resolver/

### How we use ENS

A user can have:

``` text
alice.eth
```

and create:

``` text
trader.alice.eth
research.alice.eth
procurement.alice.eth
```

Each agent has an identifiable namespace.

ENS should not be a cosmetic `.eth` name.

It should be part of the authorization architecture:

-   identify the agent,
-   associate agent wallet,
-   associate agent metadata,
-   establish delegated authority,
-   use ENSv2's hierarchical permission model where appropriate.

ENSv2's Enhanced Access Control supports resource-scoped roles and
delegation. The current docs state that permissions can be scoped to
individual names or broader resources, and multiple accounts can hold
roles.

------------------------------------------------------------------------

## 8.2 World

**Target:** World ID for Agents --- \$7,500.

World also has:

-   Best Use of IDKit --- \$7,500.

For this project, **World ID for Agents** is the preferred conceptual
fit because the product is explicitly agentic.

Official requirements include:

-   integrate the official World ID for Agents development environment,
-   demonstrate the complete request → user completion → validated
    result → protected action flow,
-   demonstrate a denied/expired/cancelled/unsuccessful path,
-   securely validate identity results on the backend,
-   provide an integration debrief.

Sources:

-   https://ethglobal.com/events/tokyo2026/prizes/world
-   http://sandbox.auth.world.org/docs
-   http://sandbox.auth.world.org/

### How we use World

World should NOT be a normal login.

It should represent a genuine **human authorization boundary**.

Example:

``` text
Agent wants to buy $2,500 ETH.

Policy:
Autonomous limit = $500.

Decision:
HUMAN_APPROVAL
```

World becomes the mechanism for obtaining fresh human authorization.

The success path:

``` text
Agent action
  ->
AgentLatch approval request
  ->
World verification/authorization
  ->
backend validates result
  ->
temporary constrained authorization
  ->
action executes
```

Failure path:

``` text
Agent action
  ->
World authorization requested
  ->
user rejects / verification fails / expires
  ->
action does not execute
```

The sponsor explicitly requires an unsuccessful path, so this should be
implemented and demonstrated.

### World App / mobile approval idea

We discussed making approval work while the autonomous agent runs in the
background.

Potential future surface:

``` text
Background Agent
      |
      v
ApprovalManager
      |
      v
World / World App surface
      |
      v
Human approves
      |
      v
Agent resumes
```

World's current event materials provide an official World ID for Agents
development environment. A World Mini App / World App implementation may
be explored if technically useful and supported by the event
environment, but it is **not an MVP dependency**.

Do not block the project waiting for a perfect World App notification
flow.

------------------------------------------------------------------------

## 8.3 Intercepta

**Target:** Safe Agent-to-Agent Payments with x402.

Official Tokyo prize page lists:

-   \$2,000 prize category,
-   \$1,250 first place,
-   \$750 second place.

The overall Intercepta listing currently shows \$2,500 because of
additional prize structure/context on the page.

Official requirements include:

-   working agent payment flow, x402 preferred,
-   at least one live Intercepta API call before payment is
    signed/sent/accepted,
-   the result must affect what happens,
-   demonstrate one payment that succeeds and one that is blocked/held,
-   public GitHub repository,
-   README pointing to the integration and including API feedback.

Sources:

-   https://ethglobal.com/events/tokyo2026/prizes
-   https://intercepta.io/ethglobal
-   https://docs.web3antivirus.io/reference/api-overview
-   https://docs.x402.org/

### How we use Intercepta

Intercepta belongs directly in the payment decision path:

``` text
Agent wants to pay
      |
      v
Policy Engine
      |
      v
Intercepta
      |
      +---- LOW RISK ------> continue
      |
      +---- HIGH RISK -----> block/hold
```

The API call must be real.

Do not mock the result.

The demo should show:

1.  legitimate payment → Intercepta allows → payment succeeds;
2.  risky payment → Intercepta blocks/holds → payment does not execute.

This is one of the cleanest sponsor integrations in the project.

------------------------------------------------------------------------

# 9. Uniswap: Deliberately Low Priority

Uniswap has a \$10,000 total prize structure:

-   \$6,000 main track,
-   \$4,000 Continuity Track.

The official rules allow:

-   Uniswap API,
-   v2/v3/v4,
-   v4 hooks,
-   extensions,
-   tooling,
-   broader ecosystem integrations.

Sources:

-   https://ethglobal.com/events/tokyo2026/prizes
-   https://developers.uniswap.org/

We discussed building an `AgentGuard` v4 hook that could enforce:

-   agent identity,
-   spending limits,
-   token restrictions,
-   slippage limits,
-   approval requirements.

However, this is **not part of the first implementation phases**.

The architecture must make it easy to add later.

### Required abstraction

All external actions should go through a generic executor interface:

``` ts
interface ActionExecutor {
  canExecute(action: ActionRequest): Promise<boolean>;
  execute(action: ActionRequest): Promise<ActionResult>;
}
```

Initial implementations:

``` text
x402 executor
API executor
```

Future:

``` text
Uniswap executor
DeFi executor
Treasury executor
```

This allows Uniswap to be added without rewriting:

-   the agent,
-   policy engine,
-   approval manager,
-   ENS integration,
-   World integration,
-   audit system.

------------------------------------------------------------------------

# 10. Why We Are Not Optimizing Only for Prize Money

Sponsor selection should prioritize:

1.  **Product compatibility**
2.  **How naturally the sponsor is part of the solution**
3.  **Whether the integration solves a real user problem**
4.  **Whether the integration is technically demonstrable**
5.  **How clearly it improves the demo**
6.  Prize amount

The intended primary trio is:

> **ENS + World + Intercepta**

because they map to three different security boundaries:

``` text
ENS
WHO IS THE AGENT?

       ↓

World
WHO CAN AUTHORIZE EXCEPTIONAL ACTIONS?

       ↓

Intercepta
IS THE PAYMENT/COUNTERPARTY SAFE?

       ↓

Executor
WHAT ACTION ACTUALLY HAPPENS?
```

Uniswap is optional later.

------------------------------------------------------------------------

# 11. Alternatives Considered

## Alternative A --- Generic AI agent

Rejected.

Examples:

-   AI trading bot,
-   ChatGPT for DeFi,
-   AI portfolio assistant.

Reason:

The interesting problem is not the LLM itself. The valuable
infrastructure is safe autonomous execution.

------------------------------------------------------------------------

## Alternative B --- Generic AI wallet

Rejected.

An AI wallet alone does not solve the delegation problem sufficiently.

AgentLatch should be an authorization/control layer, not another wallet.

------------------------------------------------------------------------

## Alternative C --- Agent API marketplace

Considered.

Agents could discover APIs/services, pay them through x402, and maintain
provider reputation.

Interesting but less focused for the hackathon.

The functionality can still appear as a secondary x402 demonstration.

------------------------------------------------------------------------

## Alternative D --- Agent transaction simulator

Considered.

Similar to a Tenderly-like dry-run system specifically for AI agents:

``` text
simulate
  ->
inspect effects
  ->
risk/policy evaluation
  ->
allow/block
```

Interesting developer tooling, but it is better treated as a possible
future capability of AgentLatch.

------------------------------------------------------------------------

## Alternative E --- GitHub Actions for money

Considered.

A YAML-style programmable financial automation system:

``` yaml
on:
  x402.payment:

checks:
  - agent_identity
  - spending_policy
  - risk_check

if:
  amount < 10:
    execute

  amount < 100:
    human_approval
```

Interesting, but AgentLatch already provides the underlying
authorization infrastructure.

------------------------------------------------------------------------

## Alternative F --- Agent treasury

Considered.

A company treasury could have:

``` text
research agent     $50/day
trading agent      $500/day
support agent      $10/day
procurement agent  $1,000/day
```

This remains a strong possible demo/use case.

------------------------------------------------------------------------

## Alternative G --- Uniswap AgentGuard Hook

Considered and retained as a future extension.

The hook would enforce AgentLatch policy at the execution layer.

Not MVP because v4 hook implementation increases hackathon risk.

------------------------------------------------------------------------

# 12. Final Product Direction

The project is therefore:

# AgentLatch

> **The control plane for autonomous agents.**

The agent gets identity and authority.

The policy engine decides whether an action is:

``` text
ALLOW
BLOCK
HUMAN_APPROVAL
```

Integrations enforce different parts:

``` text
ENS       -> identity / delegated permissions
World     -> human authorization
Intercepta -> payment/counterparty risk
x402      -> machine payments
Executor  -> actual external action
```

Future:

``` text
Uniswap -> DeFi execution
```

------------------------------------------------------------------------

# 13. Final Technology Stack

## Runtime / package manager

**Bun**

Bun provides:

-   JS/TS runtime,
-   package manager,
-   workspaces,
-   test runner,
-   bundler.

Official docs:

https://bun.sh/docs

Bun workspaces support monorepos directly.

------------------------------------------------------------------------

## Monorepo

**Bun workspaces + Turborepo**

Turborepo may be used for:

-   task orchestration,
-   caching,
-   dependency-aware builds/tests.

Do not over-engineer the monorepo.

------------------------------------------------------------------------

## Language

**TypeScript everywhere possible.**

Only Solidity should be non-TypeScript.

------------------------------------------------------------------------

## Frontend

``` text
React
Vite
TanStack Router
TanStack Query
Tailwind CSS
viem
wagmi where useful
```

No Next.js.

The frontend should be a pure React application.

------------------------------------------------------------------------

## Backend

Initial decision:

**Elysia + Bun + Eden**

Reason:

-   TypeScript-first,
-   Bun-native,
-   very small API layer,
-   end-to-end type safety,
-   Eden provides typed frontend-to-backend calls.

Official references:

-   https://elysiajs.com/
-   https://elysiajs.com/eden/overview
-   https://www.npmjs.com/package/@elysia/eden

Elysia/Eden can be used with React Query/TanStack Query, so the frontend
can call the API without hand-maintaining duplicate request/response
types.

Example conceptual pattern:

``` ts
const result = await api.agents.get({
  ...
});
```

and TanStack Query owns:

-   caching,
-   loading,
-   refetching,
-   invalidation.

### Fallback

If Elysia/Eden creates integration friction:

``` text
React
  ->
typed fetch wrapper
  ->
Elysia
```

If Elysia itself causes unexpected implementation cost, fallback to the
previously known **NestJS** architecture.

Do not let framework preference become a hackathon blocker.

------------------------------------------------------------------------

# 14. Database

**PostgreSQL + Drizzle ORM**

We explicitly prefer Drizzle over Prisma for this project because Prisma
migration/schema workflows have caused friction in previous projects.

Drizzle gives:

-   SQL-like queries,
-   lightweight ORM,
-   explicit schema,
-   generated SQL migrations,
-   good TypeScript ergonomics.

Official references:

-   https://orm.drizzle.team/
-   https://bun.sh/guides/ecosystem/drizzle

Keep the database small.

Initial tables:

``` text
users
agents
policies
capabilities
approval_requests
payments
audit_events
```

Possible later:

``` text
executions
risk_checks
agent_sessions
```

Do not introduce unnecessary relational complexity.

------------------------------------------------------------------------

# 15. Smart Contracts

**Solidity + Foundry**

Use:

-   Foundry,
-   forge,
-   viem for TypeScript interaction,
-   OpenZeppelin where useful.

Initial chain:

**Ethereum Sepolia**, because ENSv2 is currently live there for the
hackathon.

ENSv2 documentation states that its current contracts/interfaces are
beta and may change before mainnet, so isolate ENS-specific contract
addresses/ABIs/configuration.

Official ENSv2 docs:

https://docs.ens.domains/ensv2/overview/

------------------------------------------------------------------------

# 16. Agent Runtime

**Bun + TypeScript**

The agent should be a long-running background process.

Possible framework:

**LangGraph**

Alternative:

A lightweight custom state machine if LangGraph becomes unnecessary
overhead.

The agent should expose tools such as:

``` text
search_service()
call_service()
request_payment()
request_trade()
check_balance()
```

The important part is not the LLM framework.

The important part is:

``` text
Agent
  ->
ActionRequest
  ->
AgentLatch
```

Every meaningful external action must pass through AgentLatch.

------------------------------------------------------------------------

# 17. Monorepo Structure

Recommended final structure:

``` text
agentlatch/
│
├── apps/
│   ├── web/
│   │   └── React + Vite
│   │
│   ├── api/
│   │   └── Elysia + Bun
│   │
│   ├── agent/
│   │   └── autonomous agent runtime
│   │
│   └── world-miniapp/
│       └── .gitkeep
│
├── packages/
│   ├── core/
│   │   ├── types/
│   │   ├── policy/
│   │   └── authorization/
│   │
│   ├── sdk/
│   │
│   ├── api-client/
│   │
│   ├── integrations/
│   │   ├── ens/
│   │   ├── world/
│   │   ├── intercepta/
│   │   └── x402/
│   │
│   ├── executors/
│   │   ├── api/
│   │   ├── x402/
│   │   └── uniswap/
│   │       └── .gitkeep
│   │
│   └── contracts/
│
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── contracts/
│   └── .gitkeep
│
├── docs/
│   └── project-context.md
│
├── .env.example
├── package.json
├── bun.lock
├── turbo.json
├── tsconfig.json
└── README.md
```

Use `.gitkeep` for future modules rather than implementing placeholders
prematurely.

------------------------------------------------------------------------

# 18. Core Domain Model

The core abstraction is an **ActionRequest**.

Conceptually:

``` ts
type ActionRequest = {
  id: string;
  agentId: string;

  action:
    | "API_CALL"
    | "X402_PAYMENT"
    | "TOKEN_TRANSFER"
    | "SWAP"
    | "CONTRACT_CALL";

  target: string;

  token?: string;
  amount?: string;

  metadata?: Record<string, unknown>;
};
```

Policy engine:

``` ts
type PolicyDecision =
  | {
      decision: "ALLOW";
      reasons: string[];
    }
  | {
      decision: "BLOCK";
      reasons: string[];
    }
  | {
      decision: "HUMAN_APPROVAL";
      reasons: string[];
      approvalRequestId: string;
    };
```

This abstraction is critical for future Uniswap/DeFi support.

------------------------------------------------------------------------

# 19. Policy Engine

Example policy:

``` text
Agent: trader.alice.eth

Maximum autonomous trade:
$500

Maximum daily spend:
$2,000

Allowed tokens:
USDC
ETH

Allowed actions:
SWAP
X402_PAYMENT

Human approval:
$500 - $5,000

Hard block:
>$5,000
```

Evaluation should consider:

-   action type,
-   amount,
-   token,
-   target/counterparty,
-   daily spending,
-   expiration,
-   agent identity,
-   capability,
-   risk result,
-   existing approvals.

Do not make the policy engine sponsor-specific.

------------------------------------------------------------------------

# 20. Approval System

Approval is a first-class domain concept.

``` text
ApprovalRequest

id
agent
action
amount
target
reason
status
expiresAt
createdAt
authorization
```

States:

``` text
PENDING
APPROVED
REJECTED
EXPIRED
CANCELLED
```

The executor must never execute a `HUMAN_APPROVAL` action until a valid
approval exists.

Approval should be constrained:

``` text
agent
action
target
amount
token
expiry
nonce
```

Do not create a broad permanent approval when the user only approved one
action.

------------------------------------------------------------------------

# 21. Background Agent Architecture

The agent must be able to run independently of the user.

``` text
Agent process
     |
     | monitors condition
     v
decision
     |
     v
ActionRequest
     |
     v
AgentLatch
     |
     +--- ALLOW --> executor
     |
     +--- BLOCK --> log + stop
     |
     +--- HUMAN_APPROVAL
              |
              v
        ApprovalManager
              |
              v
        user notification
              |
              v
          approval
              |
              v
           executor
```

This is the key difference between a normal frontend workflow and
autonomous agent infrastructure.

------------------------------------------------------------------------

# 22. Notifications / Approval Surfaces

Potential surfaces:

### MVP

Web dashboard.

### Next

World ID for Agents.

### Later

World App / Mini App if practical.

### Optional fallback

Telegram notification:

``` text
AgentLatch:
Your trading agent requires approval.

BUY $2,500 ETH

[Open approval]
```

Telegram should be treated as a **notification/deep-link surface**, not
the trust primitive.

The actual authorization should be verified by AgentLatch/World/backend.

------------------------------------------------------------------------

# 23. x402 Architecture

x402 should be an executor/integration, not the entire project.

``` text
Agent
  |
  v
API returns 402
  |
  v
x402 executor
  |
  v
AgentLatch authorization
  |
  +--> policy
  |
  +--> Intercepta
  |
  +--> approval if needed
  |
  v
sign/payment
  |
  v
service
```

Intercepta must run before payment signing/acceptance to satisfy its
Tokyo qualification.

Official x402 docs:

https://docs.x402.org/

------------------------------------------------------------------------

# 24. Intercepta Integration

The integration should expose something conceptually like:

``` ts
const risk = await intercepta.screenPayment({
  payTo,
  token,
  paymentAuthorization,
});
```

Then:

``` ts
if (risk.blocked) {
  return BLOCK;
}
```

The exact API shape must follow current Intercepta documentation.

Never hard-code/mock the sponsor verdict in the final demo.

The demo needs:

``` text
safe payment -> succeeds

risky payment -> blocked/held
```

------------------------------------------------------------------------

# 25. ENS Integration

ENS package responsibilities:

``` text
create agent namespace
resolve agent identity
associate wallet
read agent records
write required records
manage relevant delegated permissions
```

ENSv2's Permissioned Registry provides hierarchical names and role-based
permission management.

Relevant concepts:

``` text
alice.eth
   |
   +-- trader.alice.eth
   |
   +-- research.alice.eth
```

The exact ENSv2 contract interactions should be implemented using
current official docs and deployed Sepolia addresses rather than
assumptions.

------------------------------------------------------------------------

# 26. World Integration

World package responsibilities:

``` text
create authorization/verification request
receive verification result
validate result server-side
return authorization result to AgentLatch
```

The API must not trust a client-side boolean such as:

``` ts
verified: true
```

The server validates the official World result.

The application must demonstrate:

``` text
SUCCESS
FAILURE / REJECTION / EXPIRY
```

as required by the sponsor.

------------------------------------------------------------------------

# 27. Future Uniswap Integration

When time permits:

``` text
Agent
  |
  v
ActionRequest(SWAP)
  |
  v
Policy
  |
  v
World approval if needed
  |
  v
UniswapExecutor
  |
  v
Uniswap API / v4 / hook
```

Potential v4 hook:

``` text
beforeSwap
   |
   +-- verify agent/capability
   +-- verify token
   +-- verify max amount
   +-- verify expiry
   +-- verify authorization
   |
   +-- ALLOW
   +-- REVERT
```

Do not start here.

The architecture is deliberately prepared for it.

------------------------------------------------------------------------

# 28. Phase-Based Implementation Plan

The coding agent should work sequentially.

Do not attempt all sponsor integrations simultaneously.

------------------------------------------------------------------------

## Phase 0 --- Repository Scaffold

Goal:

Get the monorepo compiling/running.

Create:

``` text
apps/web
apps/api
apps/agent

packages/core
packages/sdk
packages/api-client
packages/integrations/ens
packages/integrations/world
packages/integrations/intercepta
packages/integrations/x402
packages/executors/api
packages/executors/x402
packages/executors/uniswap
```

Use `.gitkeep` for unimplemented modules.

Set up:

-   Bun,
-   workspaces,
-   Turborepo,
-   TypeScript,
-   lint/formatting if useful,
-   environment configuration,
-   basic CI if fast.

Do not build product functionality yet.

------------------------------------------------------------------------

# Phase 1 --- Basic AgentLatch Core

Goal:

Prove the central authorization model without sponsors.

Implement:

``` text
Agent
Policy
ActionRequest
PolicyDecision
Executor
ApprovalRequest
```

Create an in-memory or simple DB implementation.

Demo:

``` text
Agent requests $100
Policy limit $500
=> ALLOW

Agent requests $600
Policy limit $500
=> HUMAN_APPROVAL

Agent requests $10,000
hard limit $5,000
=> BLOCK
```

This phase establishes the product's core.

------------------------------------------------------------------------

# Phase 2 --- Database

Add:

**PostgreSQL + Drizzle**

Tables:

``` text
users
agents
policies
capabilities
approval_requests
payments
audit_events
```

Persist:

-   agents,
-   policies,
-   action requests,
-   decisions,
-   approvals,
-   audit events.

The audit log is important for the product story:

``` text
09:31
trader.alice.eth
BUY $200 ETH
ALLOW

09:34
trader.alice.eth
BUY $2,500 ETH
HUMAN_APPROVAL

09:35
user
REJECT

09:40
trader.alice.eth
PAY $2
BLOCK
```

------------------------------------------------------------------------

# Phase 3 --- Real Autonomous Agent

Create the background agent.

It should periodically:

-   observe a mocked/simple market condition,
-   decide an action,
-   submit an ActionRequest.

Initially, the actual "trade" can be mocked or sent to a safe test
executor.

The important thing is that the agent runs without a frontend
interaction.

------------------------------------------------------------------------

# Phase 4 --- ENSv2

Integrate ENSv2 on Sepolia.

Goal:

Turn:

``` text
agent-123
```

into:

``` text
trader.alice.eth
```

Use ENSv2 centrally.

The dashboard should display:

``` text
Agent
trader.alice.eth

Wallet
0x...

Permissions
...
```

Do not hard-code ENS data.

This phase should be enough to demonstrate a meaningful ENS integration.

------------------------------------------------------------------------

# Phase 5 --- World ID for Agents

Integrate World.

Goal:

When:

``` text
Action > autonomous limit
```

the agent pauses and creates:

``` text
ApprovalRequest
```

World verification/authorization is used to approve the exceptional
action.

Implement:

``` text
approve
reject/fail
expire
```

at least one successful and one unsuccessful path.

Server-side validation is mandatory.

------------------------------------------------------------------------

# Phase 6 --- Intercepta + x402

Implement real x402 payment flow.

Example:

``` text
Agent calls paid API
      |
      v
402
      |
      v
x402 executor
      |
      v
AgentLatch policy
      |
      v
Intercepta
      |
      +--> safe -> payment
      |
      +--> risky -> block
```

Show:

1.  successful payment,
2.  blocked/held payment.

The Intercepta API call must be live.

------------------------------------------------------------------------

# Phase 7 --- Unified Dashboard

Create the polished demo UI.

Pages/components:

``` text
Overview
Agents
Agent Details
Policies
Activity
Pending Approvals
Payments
```

Agent page:

``` text
trader.alice.eth

Status: RUNNING

Autonomous limit:
$500 / action

Today's spend:
$1,240 / $2,000

Pending approval:
BUY $2,500 ETH

Risk:
Medium
```

Activity timeline:

``` text
ALLOW
BLOCK
APPROVAL_REQUEST
APPROVED
REJECTED
PAYMENT
```

------------------------------------------------------------------------

# Phase 8 --- Optional World App / Notification Surface

Only if core system is stable.

Explore:

-   World Mini App,
-   World approval surface,
-   Telegram notification/deep-link,
-   mobile approval experience.

Do not compromise the core demo for this phase.

------------------------------------------------------------------------

# Phase 9 --- Optional Uniswap / DeFi

Only after:

-   ENS works,
-   World works,
-   Intercepta works,
-   x402 works,
-   dashboard works,
-   demo is reliable.

Then implement:

``` text
UniswapExecutor
```

and potentially:

``` text
AgentGuard v4 Hook
```

The goal is to demonstrate:

``` text
background agent
  ->
large trade
  ->
policy
  ->
World approval
  ->
Uniswap
  ->
execution
```

If the hook becomes risky, use a simpler Uniswap integration rather than
destabilizing the project.

------------------------------------------------------------------------

# Phase 10 --- Hackathon Polish

Final priorities:

1.  Reliable demo
2.  Clear UI
3.  Sponsor integrations visible
4.  Open-source code
5.  README
6.  Architecture diagram
7.  Demo script
8.  Sponsor feedback requirements
9.  Security boundaries
10. Deployment

Do not add random features.

------------------------------------------------------------------------

# 29. Demo Narrative

The final demo should ideally tell one story.

### Scene 1 --- Create agent

``` text
alice.eth
   ->
trader.alice.eth
```

Show ENSv2 identity.

### Scene 2 --- Set policy

``` text
Autonomous:
$500

Human approval:
>$500

Hard block:
>$5,000
```

### Scene 3 --- Agent runs in background

User does not interact.

### Scene 4 --- Small action

``` text
BUY $250 ETH
```

Policy:

``` text
ALLOW
```

### Scene 5 --- Large action

``` text
BUY $2,500 ETH
```

Policy:

``` text
HUMAN_APPROVAL
```

World verification/authorization.

### Scene 6 --- User rejects

Transaction does not execute.

### Scene 7 --- User approves another action

World approval succeeds.

### Scene 8 --- Optional x402 payment

Agent pays for a service.

Intercepta:

``` text
LOW RISK
```

Payment succeeds.

### Scene 9 --- Malicious/risky payment

Intercepta:

``` text
HIGH RISK
```

AgentLatch blocks it.

### Scene 10 --- Optional Uniswap

If implemented:

``` text
approved trade
   ->
Uniswap
   ->
execution
```

This gives the judges a clear progression:

> **identity → policy → autonomous execution → human authorization →
> security screening → real payment/DeFi execution**

------------------------------------------------------------------------

# 30. Design Principles

### Principle 1 --- AgentLatch is not a wallet

Wallets sign.

AgentLatch controls whether signing should be permitted.

------------------------------------------------------------------------

### Principle 2 --- Policy is execution-independent

The policy engine should not know whether the action is:

-   API call,
-   x402 payment,
-   Uniswap swap,
-   treasury transfer.

------------------------------------------------------------------------

### Principle 3 --- Sponsor integrations must be meaningful

Do not add:

``` text
ENS login
World login
Intercepta dashboard
```

just for prize eligibility.

Instead:

``` text
ENS -> identity
World -> human authorization
Intercepta -> payment security
```

------------------------------------------------------------------------

### Principle 4 --- Background agents are first-class

The user should not have to keep the dashboard open.

The agent can run independently.

------------------------------------------------------------------------

### Principle 5 --- Human approval is scoped

Never turn:

``` text
Approve $2,500 ETH
```

into:

``` text
Agent can do anything forever.
```

Approval should be constrained by:

-   action,
-   amount,
-   target,
-   token,
-   expiry,
-   nonce.

------------------------------------------------------------------------

### Principle 6 --- Security failures must stop execution

A failed:

-   policy check,
-   Intercepta check,
-   World verification,
-   approval,
-   capability check

must not silently fall through to execution.

------------------------------------------------------------------------

# 31. Important Sponsor Qualification Checklist

## ENS

-   [ ] ENSv2 on Sepolia
-   [ ] ENSv2 is central
-   [ ] Functional, not hard-coded
-   [ ] Agent identity/subname is meaningful
-   [ ] Use relevant ENSv2 permissions/registry features
-   [ ] Open-source repository
-   [ ] Live demo

------------------------------------------------------------------------

## World

-   [ ] Official World ID for Agents development environment
-   [ ] Complete verification journey
-   [ ] Server-side validation
-   [ ] Protected agent action
-   [ ] Successful path
-   [ ] Rejected/expired/cancelled path
-   [ ] Integration debrief
-   [ ] No client-side authorization trust

------------------------------------------------------------------------

## Intercepta

-   [ ] Real x402/payment flow
-   [ ] Live Intercepta API call
-   [ ] Call before payment is signed/sent/accepted
-   [ ] Result changes execution
-   [ ] Successful payment
-   [ ] Blocked/held payment
-   [ ] Visible reason
-   [ ] Public GitHub
-   [ ] README points to integration
-   [ ] 3--5 lines API feedback

------------------------------------------------------------------------

## Uniswap --- optional

-   [ ] Public GitHub
-   [ ] `FEEDBACK.md`
-   [ ] Uniswap Developer Feedback Form
-   [ ] README identifies relevant integration/code
-   [ ] Actual Uniswap stack usage
-   [ ] Only implement if core project is stable

------------------------------------------------------------------------

# 32. Relevant Official References

## ETHGlobal

ETHGlobal Tokyo 2026 prizes:

https://ethglobal.com/events/tokyo2026/prizes

World prize:

https://ethglobal.com/events/tokyo2026/prizes/world

------------------------------------------------------------------------

## ENS

ENSv2 overview:

https://docs.ens.domains/ensv2/overview/

Enhanced Access Control:

https://docs.ens.domains/ensv2/enhanced-access-control/

Permissioned Registry:

https://docs.ens.domains/ensv2/permissioned-registry/

Permissioned Resolver:

https://docs.ens.domains/ensv2/permissioned-resolver/

Universal Resolver V2:

https://docs.ens.domains/ensv2/universal-resolver-v2/

ENS AI / agent resources:

https://docs.ens.domains/building-with-ai/

------------------------------------------------------------------------

## World

World developer docs:

https://docs.world.org/

World ID for Agents:

http://sandbox.auth.world.org/docs

World ID for Agents portal:

http://sandbox.auth.world.org/

IDKit:

https://docs.world.org/world-id/idkit/integrate

------------------------------------------------------------------------

## Intercepta

Hackathon key:

https://intercepta.io/ethglobal

API reference:

https://docs.web3antivirus.io/reference/api-overview

Quick Scan:

https://docs.web3antivirus.io/reference/quick-scan-address

Scan Message:

https://docs.web3antivirus.io/reference/scan-message

------------------------------------------------------------------------

## x402

https://docs.x402.org/

A2A x402 extension:

https://github.com/google-agentic-commerce/a2a-x402

------------------------------------------------------------------------

## Uniswap

Developer docs:

https://developers.uniswap.org/

Tokyo prize:

https://ethglobal.com/events/tokyo2026/prizes

Feedback form:

https://developers.uniswap.org/hackathon-feedback

------------------------------------------------------------------------

## Elysia / Eden

Elysia:

https://elysiajs.com/

Eden:

https://elysiajs.com/eden/overview

Eden package:

https://www.npmjs.com/package/@elysia/eden

------------------------------------------------------------------------

## Bun

https://bun.sh/docs

Bun workspaces:

https://bun.sh/docs/pm/workspaces

Bun + Drizzle:

https://bun.sh/guides/ecosystem/drizzle

------------------------------------------------------------------------

## Drizzle

https://orm.drizzle.team/

------------------------------------------------------------------------

# 33. External 2026 Hackathon Signals Discussed

Recent 2026 hackathon winners were used as directional evidence, not as
requirements.

The team reviewed recent winner patterns from:

-   Solana Frontier / Colosseum
-   Sui Overflow
-   Arbitrum Open House / Founder House
-   Algorand agent/x402 hackathon

Common themes observed:

-   agent infrastructure,
-   autonomous payments,
-   transaction security,
-   trust/reputation,
-   programmable permissions,
-   machine-readable protocols,
-   financial automation,
-   agent-to-agent commerce,
-   policy-aware execution.

Examples discussed included Sui projects around agent wallets,
machine-readable interfaces and transaction security; Solana projects
around agent payments/security and financial infrastructure; Algorand
projects around trust, routing, reputation and x402; and Arbitrum
projects around programmable escrow and autonomous financial
infrastructure.

The strategic takeaway:

> Avoid building merely "an AI agent with blockchain."

Build infrastructure that makes autonomous software **safe, constrained,
accountable and useful when money or privileged actions are involved**.

------------------------------------------------------------------------

# 34. What Not to Build

Avoid turning the project into:

-   generic AI trading bot,
-   generic AI wallet,
-   ChatGPT-for-DeFi,
-   generic portfolio dashboard,
-   simple x402 checkout,
-   generic ENS profile,
-   World login screen,
-   generic prediction market,
-   three unrelated sponsor integrations.

The core differentiation is **controlled autonomy**.

------------------------------------------------------------------------

# 35. Current MVP Definition

The minimum convincing product is:

``` text
1. Create agent
2. Give agent policy
3. Agent runs autonomously
4. Agent requests an action
5. Policy evaluates action
6. Small action executes automatically
7. Large action requires human approval
8. User approves/rejects
9. Agent resumes or stops
10. Audit trail records everything
```

Then add:

``` text
ENS
World
Intercepta
x402
```

one at a time.

Uniswap is optional.

------------------------------------------------------------------------

# 36. Final Architecture

``` text
                              USER
                               |
                  +------------+------------+
                  |                         |
                WEB                   Approval Surface
             React/Vite              World / later
                  |                         |
                  +------------+------------+
                               |
                         API / Control Plane
                               |
                         Elysia + Bun
                               |
        +----------------------+----------------------+
        |                      |                      |
   Agent Manager          Policy Engine        Approval Manager
        |                      |                      |
        |                +-----+-----+                |
        |                |           |                |
        |              ENS       Intercepta         World
        |             identity      risk           human
        |                |           |             auth
        |                +-----+-----+                |
        |                      |                      |
        +----------------------+----------------------+
                               |
                         ActionRequest
                               |
                         Executor Layer
                               |
              +----------------+----------------+
              |                |                |
             API              x402           Uniswap*
              |                |                |
              +----------------+----------------+
                               |
                         External Action

* optional future implementation
```

------------------------------------------------------------------------

# 37. The Core Product Sentence

If a judge asks:

> "What is AgentLatch?"

Answer:

> **AgentLatch is the control plane for autonomous agents: it gives
> agents verifiable identity and bounded capabilities, evaluates every
> privileged action against policy and risk, and requests fresh human
> authorization when the agent exceeds its autonomous authority.**

If they ask:

> "Why does blockchain matter?"

Answer:

> **Identity, permissions, payment authorization and execution can
> become verifiable, composable primitives rather than opaque
> application state.**

If they ask:

> "Why World?"

> **When an autonomous agent reaches a decision that exceeds its
> delegated authority, we need a fresh human authorization boundary.**

If they ask:

> "Why ENS?"

> **Agents need persistent, discoverable identities and scoped
> delegation rather than anonymous wallet addresses.**

If they ask:

> "Why Intercepta?"

> **Autonomous payment is only useful if the agent can evaluate who or
> what it is paying before money moves.**

------------------------------------------------------------------------

# 38. Implementation Instruction to the Coding Agent

Work incrementally.

**Do not implement all integrations at once.**

Start with Phase 0 and Phase 1.

After each phase:

1.  make the code compile,
2.  run tests,
3.  verify the local app,
4.  document what changed,
5.  keep interfaces stable,
6.  avoid premature abstraction,
7.  do not implement future modules until their phase arrives.

Use `.gitkeep` for modules that are intentionally not implemented yet.

Prioritize a reliable end-to-end path over breadth.

The desired final system is:

``` text
Background Agent
      |
      v
ActionRequest
      |
      v
AgentLatch Policy
      |
      +---- ALLOW -----> Executor
      |
      +---- BLOCK -----> Audit
      |
      +---- APPROVAL --> World
                            |
                     approve / reject
                            |
                            v
                         Executor
                            |
                +-----------+-----------+
                |                       |
               x402                  Uniswap*
                |                       |
             payment                  trade

ENS = agent identity
Intercepta = payment/counterparty security
World = human authorization

* optional
```

**Build the control plane first. Everything else plugs into it.**

## 39. Current-source note

This document was refreshed against the live ETHGlobal Tokyo 2026 prize
page and current ENSv2 documentation on 26 September 2026.

Important current facts:

-   ETHGlobal Tokyo currently lists seven sponsor prize pools: World
    \$15,000; 1inch \$7,000; ENS \$10,000; Uniswap Foundation \$10,000;
    Sui \$5,000; Curvegrid \$3,000; Intercepta \$2,500.
-   World currently describes a \$7,500 Best Use of World ID for Agents
    track and a separate \$7,500 Best Use of IDKit track. The World ID
    for Agents qualification explicitly requires a complete request →
    user completion → validated result → protected action flow, an
    unsuccessful path, and secure backend validation.
-   ENSv2 currently documents hierarchical registries, Permissioned
    Registry/Resolver, and Enhanced Access Control. ENS's EAC is
    resource-scoped and supports role-based delegation.
-   ENSv2 documentation currently says its contracts/interfaces are beta
    and may change before mainnet. The implementation must therefore
    isolate ENS-specific addresses/ABIs/configuration and use the
    current canonical Sepolia deployment information.
-   Intercepta's Tokyo qualification requires a real payment flow, a
    live Intercepta API call before payment signing/acceptance, a
    decision that changes execution, and both successful and
    blocked/held payment paths.

Official sources: - https://ethglobal.com/events/tokyo2026/prizes -
https://ethglobal.com/events/tokyo2026/prizes/world -
https://docs.ens.domains/ensv2/overview/ -
https://docs.ens.domains/ensv2/enhanced-access-control/ -
https://docs.ens.domains/ensv2/permissioned-registry/ -
https://docs.x402.org/ - https://intercepta.io/ethglobal
