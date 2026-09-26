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
