import { getAddress, verifyMessage } from "viem";

export type WalletProof = {
  address: string;
  message: string;
  signature: string;
};

/** Checks a one-time SIWE proof from World App wallet auth. */
export async function verifyWalletProof(
  proof: WalletProof,
  expectedNonce: string,
): Promise<{ ok: true; address: string } | { ok: false; error: string }> {
  const account = siweAccount(proof.message);
  const nonce = siweField(proof.message, "Nonce");
  const expiration = siweField(proof.message, "Expiration Time");
  if (!account || !nonce) {
    return { ok: false, error: "Wallet signature is not a sign-in message." };
  }
  if (nonce !== expectedNonce) {
    return { ok: false, error: "Wallet signature does not match this link." };
  }
  if (expiration) {
    const expiresAt = new Date(expiration);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      return { ok: false, error: "Wallet signature has expired." };
    }
  }

  let address: `0x${string}`;
  let claimed: `0x${string}`;
  try {
    address = getAddress(proof.address);
    claimed = getAddress(account);
  } catch {
    return { ok: false, error: "Wallet address is not valid." };
  }
  if (address !== claimed) {
    return { ok: false, error: "Wallet address does not match the signature." };
  }
  if (!proof.signature.startsWith("0x")) {
    return { ok: false, error: "Wallet signature is not valid." };
  }

  const valid = await verifyMessage({
    address,
    message: proof.message,
    signature: proof.signature as `0x${string}`,
  });
  if (!valid) {
    return { ok: false, error: "Wallet signature is not valid." };
  }
  return { ok: true, address };
}

function siweField(message: string, name: string): string | null {
  const match = message.match(new RegExp(`^${name}: (.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function siweAccount(message: string): string | null {
  const match = message.match(
    /wants you to sign in with your Ethereum account:\n(0x[a-fA-F0-9]{40})/,
  );
  return match?.[1] ?? null;
}
