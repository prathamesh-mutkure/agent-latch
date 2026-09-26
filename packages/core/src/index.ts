export const packageId = "@agentlatch/core";

export {
  AGENT_ID_HEADER,
  AGENT_NONCE_HEADER,
  AGENT_REQUEST_WINDOW_SECONDS,
  AGENT_SIGNATURE_HEADER,
  AGENT_TIMESTAMP_HEADER,
  agentRequestMessage,
  isEnsLabel,
  sha256Hex,
} from "./agent-auth";
export { authorizationMatches, isExpired } from "./authorization";
export { evaluatePolicy, type PolicyDecision } from "./policy";
export type {
  Address,
  AgentSigner,
  Hex,
  TransferAuthorization,
} from "./signer";
export {
  type ActionRequest,
  type ActionStatus,
  type ActionType,
  type Agent,
  type ApprovalRequest,
  type ApprovalStatus,
  actionTypes,
  type Decision,
  type Policy,
  type ScopedAuthorization,
  type SimulatedExecution,
  type WorldIdCheckStatus,
} from "./types";
export {
  formatUsdc,
  parseUsdc,
  SEPOLIA_CHAIN_ID,
  USDC_DECIMALS,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "./usdc";
