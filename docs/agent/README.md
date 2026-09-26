# Agent context

Short on purpose. Coding agents load this folder, so keep it current and small.

| File | What it is | When to change it |
| --- | --- | --- |
| `planning.md` | Product brief and phase plan. Source of truth for what we are building. | Product direction changes. Not a changelog. |
| `decisions.md` | Closed technical choices. | A choice is made or reversed. Add a dated entry. Mark the old one superseded. Do not delete history. |
| `open-questions.md` | Choices we have not made. | Add a question, or delete it after it moves into `decisions.md`. |
| `current-state.md` | Todos with a testing column, plus a testing section and notes. | After every task. Update that row's state and testing column, and the testing section when you verified something. Do not append a diary. |
| `commands.md` | Commands to run the apps, the agent, and Postgres. | A run command is added or renamed. |

`AGENTS.md` at the repo root points here. Cursor and Codex load it. `CLAUDE.md` imports `AGENTS.md` for Claude Code and should not grow its own rules. Git is the sync channel: the handoff is the commit that updates `current-state.md`.

If code and a decision disagree, fix the code or add a new decision in the same change. Do not leave the contradiction for the next agent.
