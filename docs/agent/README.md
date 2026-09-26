# Agent context

Short on purpose. Coding agents load this folder, so keep it current and small.

| File | What it is | When to change it |
| --- | --- | --- |
| `planning.md` | Original product brief and phase plan. | Product direction changes. Not a changelog. |
| `planning-v2.md` | Updated architecture. | The architecture changes. Where it disagrees with the repo, `continuation.md` wins. |
| `continuation.md` | Locked deltas, open items for Ankit, and the step order. | A lock, an open item, or the next step changes. |
| `decisions.md` | Closed technical choices. | A choice is made or reversed. Add a dated entry. Mark the old one superseded. Do not delete history. |
| `open-questions.md` | Choices we have not made. | Add a question, or delete it after it moves into `decisions.md`. |
| `current-state.md` | Todos with a testing column, plus a testing section and notes. | After every task. Update that row's state and testing column, and the testing section when you verified something. Do not append a diary. |
| `issues.md` | What is broken or easy to get wrong on the live demo. | A live failure is fixed or a new one shows up. |
| `commands.md` | Commands to run the apps, the agent, and Postgres. | A run command is added or renamed. |
| `deploy.md` | Hosted Postgres and the public API. | The host, the env, or the smoke check changes. |

`AGENTS.md` at the repo root points here. Cursor and Codex load it. `CLAUDE.md` imports `AGENTS.md` for Claude Code and should not grow its own rules. Git is the sync channel: the handoff is the commit that updates `current-state.md`.

If code and a decision disagree, fix the code or add a new decision in the same change. Do not leave the contradiction for the next agent.
