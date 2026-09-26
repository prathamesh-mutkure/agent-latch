# Open questions

Settled items are in `decisions.md`. Add a question here only when a choice is actually unresolved.

## Signer custody

Ankit is still deciding. The code uses one `LocalKeySigner` and an exact EIP-3009 slip. His spec uses a wallet per agent, encrypted at rest. Do not replace the signer until this is closed in `decisions.md`.

## World approval shape

Ankit owns phase 5. Approve currently executes with no World ticket, and an x402 approval settles on that path. He decides how a World result proves that one approval, including whether World also becomes the owner session. The existing decision says World is the step-up, not the login. He supersedes that decision if the proof should include login.
