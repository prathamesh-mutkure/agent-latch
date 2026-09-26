import { createEnsPublicClient } from "@ensdomains/ensjs";
import { type Address, http, isAddress, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { sepoliaEns } from "./config";

export type ResolvedName = {
  owner: Address | null;
  address: Address | null;
};

export async function resolveNameWithSdk(
  name: string,
  rpcUrl: string = sepoliaEns.defaultRpcUrl,
): Promise<ResolvedName> {
  const client = createEnsPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const [ownerResult, addressResult] = await Promise.all([
    client.getOwner({ name }),
    client.getAddressRecord({ name, coin: "ETH" }),
  ]);
  const ownerCandidate = ownerResult?.owner ?? ownerResult?.registrant ?? null;
  const owner =
    ownerCandidate &&
    isAddress(ownerCandidate) &&
    ownerCandidate !== zeroAddress
      ? ownerCandidate
      : null;
  const addressCandidate = addressResult?.value ?? null;
  const address =
    addressCandidate && isAddress(addressCandidate) ? addressCandidate : null;
  return { owner, address };
}

export const policyTextKeys = [
  "policy.autonomousLimit",
  "policy.hardLimit",
  "policy.dailyLimit",
  "policy.actions",
  "policy.tokens",
  "policy.targets",
] as const;

export async function readPolicyTexts(
  name: string,
  rpcUrl: string = sepoliaEns.defaultRpcUrl,
): Promise<Record<(typeof policyTextKeys)[number], string | null>> {
  const client = createEnsPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });
  const entries = await Promise.all(
    policyTextKeys.map(async (key) => {
      const value = await client.getTextRecord({ name, key });
      return [key, value && value.length > 0 ? value : null] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    (typeof policyTextKeys)[number],
    string | null
  >;
}
