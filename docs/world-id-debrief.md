# World ID for Agents: integration debrief

AgentLatch puts a human in front of an agent's out-of-policy actions. When an agent asks for more than its rules allow, for example a 2500 USDC swap over a 500 autonomous limit, the action waits. The owner gets a World App push. Nothing runs until they sign Approve and complete a fresh World ID for Agents check, and our API has validated the result.

## The journey

1. **Request.** The agent submits the action. Policy returns `HUMAN_APPROVAL`, the API opens a 5-minute approval, and World App pushes it to the owner's wallet.
2. **User completion.** In the mini app the owner signs Approve with their World App wallet. The API checks the signature, the owner, and that the action is unchanged. It then starts an RFC 8628 device authorization with our confidential client and returns the approval link and user code to that owner only. The owner opens World ID, checks the code, proves, and taps Authenticate with World ID.
3. **Validated result.** The API polls the token endpoint. The ID token counts only if its signature verifies against World's JWKS, `iss`, `aud`, `exp`, and `iat` pass, `acr` is `https://world.org/oidc/acr/orb-v3`, and `auth_time` is after the check started. The device code never leaves the backend and belongs to one approval. That is the binding, since device tokens carry no nonce.
4. **Protected action.** Under a row lock the API rechecks that the approval is pending, the owner and the action are unchanged, and the agent's ENS name is active. Then it executes the swap or settles the x402 payment. The agent cannot trigger execution itself.

Unsuccessful paths, where nothing runs:

- **Denied:** the owner taps Deny sign-in on World ID (`access_denied`), or Deny in World App.
- **Expired:** the approval times out, or World's code expires. A proof that arrives after the approval expired is discarded.
- **Failed:** a token fails validation, a different wallet signs, or the action changed after the approval opened.

The client secret, device code, and World `sub` stay on the API. Public reads show only the check's status.

## Time to first success

- **Browser authorization-code flow:** first integrated on 26 Sep at 21:14 JST. It never produced a reliable approval that matched the owner, and we dropped it on 27 Sep at 02:51 JST, about 5.5 hours later.
- **Device grant:** our client got its first device code about 2 minutes after we read the `oidc` guide (27 Sep, about 03:12 JST). The whole backend journey passed against the live sandbox about 30 minutes later: start, poll, validate, execute, deny, expire, and resume after a restart.
- **First human-completed approval on a phone:** not run at the time of writing. Record it here after the phone run.

## Friction

- **Finding the guides.** `/docs` lists only anchors. The actual integration guides (`oidc`, `step-up`) are served by the sandbox MCP tool `get_idp_guide`. It needs no login, but we only found it through the agent plugin's skill file.
- **Mocked identities break step-up matching.** Every fresh proof mints a new person with a new pairwise `sub`. The step-up guide says to require the returned `(iss, sub)` to match the linked account, which then fails every time. We hit this as repeated wrong-human failures, and now bind the owner by World App wallet instead.
- **Auto-approval in the browser flow.** When the browser that started the request opened the sandbox page, the page ran the ceremony and approval with no click. An approval could settle without a human. We had to split the initiator and the approver.
- **Callback constraints.** Callbacks must be exact HTTPS URLs, localhost is not allowed, and the sector is fixed at registration. Running a local API meant a public host, ngrok, and a Vercel rewrite. An apex-to-www redirect changed the host under us.
- **No action on World's screen.** The device page shows the client name and a user code, not "Swap 2500 USDC". Our app must show the action and rely on the person matching codes.
- **Delivering the link ourselves.** The device grant hands us a link. Getting it to the right person out of band needed a second World product (mini app notifications), its own API key, and a cap of 40 pushes per 4 hours for unverified apps.

## Missing capability or documentation

- Transaction binding on World's approval screen, such as `authorization_details` (RFC 9396) or a CIBA `binding_message`, so the person approves the exact action.
- A backchannel request (CIBA) that World delivers to a known subject's World App, instead of each app shipping links.
- A stable test identity in the sandbox, so subject matching for step-up can be tested.
- The guides as linked web pages, and the device start and poll rate limits as numbers.

## The one improvement with the greatest impact

CIBA-style backchannel approval with a binding message. The app would send `login_hint` for the owner's subject and a message like "Approve SWAP of 2500 USDC for agent pilot". World App would push it to that person, they would prove and approve on World's own screen, and the app would poll for the token. That one step would replace our push, wallet signature, and link hand-off, bind the human by `sub`, and show the exact action on a surface the app does not control.
