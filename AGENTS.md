# AgentLatch agents

Read these before changing architecture or starting a phase:

1. [`docs/agent/current-state.md`](docs/agent/current-state.md) — what is true in the repo right now
2. [`docs/agent/decisions.md`](docs/agent/decisions.md) — settled choices; do not relitigate them
3. [`docs/agent/open-questions.md`](docs/agent/open-questions.md) — unresolved; do not silently pick an answer
4. [`docs/agent/continuation.md`](docs/agent/continuation.md) — locked deltas, what Ankit still closes, and the step order
5. [`docs/agent/planning-v2.md`](docs/agent/planning-v2.md) — updated architecture
6. [`docs/agent/planning.md`](docs/agent/planning.md) — original product brief

## Working rules

- Build the current phase only. Leave later modules as `.gitkeep`.
- Policy, executors, and signers stay independent of each other. Sponsors stay out of policy.
- After a task, update `docs/agent/current-state.md` in the same change. Set that row's state and testing column, and update the testing section when you verified something. Do not append a diary.
- If you settle or reverse a choice, add a dated entry to `docs/agent/decisions.md`.
- `docs/agent/planning.md` stays the original product brief. Do not turn it into a changelog.
- `docs/agent/planning-v2.md` is the updated architecture. `docs/agent/continuation.md` wins where they disagree.

Sync rules for this folder are in [`docs/agent/README.md`](docs/agent/README.md).

Cursor and Codex load this file. Claude Code loads [`CLAUDE.md`](CLAUDE.md), which only points here. Do not copy these rules into another file.
