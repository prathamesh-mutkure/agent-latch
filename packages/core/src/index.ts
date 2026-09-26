export const packageId = "@agentlatch/core";

export { authorizationMatches, isExpired } from "./authorization";
export { evaluatePolicy, type PolicyDecision } from "./policy";
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
} from "./types";
export {
  formatUsdc,
  parseUsdc,
  SEPOLIA_CHAIN_ID,
  USDC_DECIMALS,
  USDC_SEPOLIA_ADDRESS,
  UsdcAmountError,
} from "./usdc";
