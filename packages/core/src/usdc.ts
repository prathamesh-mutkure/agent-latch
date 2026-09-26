export const SEPOLIA_CHAIN_ID = 11155111;
export const USDC_DECIMALS = 6;
export const USDC_SEPOLIA_ADDRESS =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

/** Starting policy for a new agent, as a human USDC amount. */
export const DEFAULT_AUTONOMOUS_LIMIT = "0.2";
export const DEFAULT_HARD_LIMIT = "1";
export const DEFAULT_DAILY_LIMIT = "5";

const SCALE = 10n ** BigInt(USDC_DECIMALS);

export class UsdcAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsdcAmountError";
  }
}

/** Parse a human USDC amount ("500", "1.25") into 6-decimal base units. */
export function parseUsdc(input: string): bigint {
  const text = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) {
    throw new UsdcAmountError(
      "Amount must be a positive USDC value with at most 6 decimal places.",
    );
  }

  const parts = text.split(".");
  const whole = parts[0];
  const fraction = parts[1] ?? "";
  if (whole === undefined) {
    throw new UsdcAmountError("Amount must be a positive USDC value.");
  }

  const base =
    BigInt(whole) * SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, "0"));
  if (base <= 0n) {
    throw new UsdcAmountError("Amount must be greater than zero.");
  }
  return base;
}

/** Format base units as a human USDC amount, which displays as dollars. */
export function formatUsdc(baseUnits: string): string {
  const value = BigInt(baseUnits);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(USDC_DECIMALS, "0")
    .replace(/0+$/, "");
  const text =
    fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}
