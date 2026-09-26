# Open questions

Settled items are in `decisions.md`. Add a question here only when a choice is actually unresolved.

## Signer custody

Ankit is still deciding. The code uses one `LocalKeySigner` and an exact EIP-3009 slip. His spec uses a wallet per agent, encrypted at rest. Do not replace the signer until this is closed in `decisions.md`.

## World ID proof on approve

Approve and deny are a World App wallet signature. That proves the owner's wallet, not a unique human, and it does not qualify for the event's World prizes (Best Use of IDKit, Best Use of World ID for Agents). The option is an IDKit v4 proof inside the mini app on approve, with the action bound into the signal and a backend-signed RP request. It needs `configure_world_id` on the portal app (on-chain side effects, a signing key shown once) and an Orb or document credential on the demo phone. Do not add it until this is closed in `decisions.md`.
