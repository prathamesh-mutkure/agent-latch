const QUICK_SCAN_URL =
  "https://api.web3antivirus.io/api/public/v2/extension/account";

export type InterceptaTrait = {
  risk: number;
  name: string;
  txsCount: number;
  description: string;
};

export type PaymentScreen = {
  payTo: string;
  blocked: boolean;
  toxicScore: number;
  traits: InterceptaTrait[];
  detail: string;
};

export class InterceptaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterceptaError";
  }
}

/** Quick-scan the payee. The verdict is the API response, not a local stand-in. */
export async function screenPayment(input: {
  payTo: string;
  apiKey: string;
}): Promise<PaymentScreen> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    throw new InterceptaError(
      "INTERCEPTA_API_KEY is required to screen a payment.",
    );
  }
  const payTo = input.payTo.trim();
  const response = await fetch(
    `${QUICK_SCAN_URL}/${encodeURIComponent(payTo)}/quick-scan`,
    {
      headers: { "X-API-KEY": apiKey },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status === 403) {
    throw new InterceptaError("Intercepta rejected the API key.");
  }
  if (!response.ok) {
    throw new InterceptaError(
      `Intercepta screening failed (${response.status}).`,
    );
  }

  const scan = parseScan(await response.json());
  const blocked = scan.toxicScore > 0 || scan.traits.length > 0;
  return {
    payTo,
    blocked,
    toxicScore: scan.toxicScore,
    traits: scan.traits,
    detail: detail(payTo, scan.toxicScore, scan.traits, blocked),
  };
}

function parseScan(body: unknown): {
  toxicScore: number;
  traits: InterceptaTrait[];
} {
  if (!body || typeof body !== "object") {
    throw new InterceptaError("Intercepta returned an unexpected body.");
  }
  const record = body as { toxicScore?: unknown; traits?: unknown };
  if (typeof record.toxicScore !== "number" || !Array.isArray(record.traits)) {
    throw new InterceptaError("Intercepta returned an unexpected body.");
  }
  return {
    toxicScore: record.toxicScore,
    traits: record.traits.map(parseTrait),
  };
}

function parseTrait(value: unknown): InterceptaTrait {
  if (!value || typeof value !== "object") {
    throw new InterceptaError("Intercepta returned an unexpected trait.");
  }
  const trait = value as {
    risk?: unknown;
    name?: unknown;
    txsCount?: unknown;
    description?: unknown;
  };
  if (
    typeof trait.risk !== "number" ||
    typeof trait.name !== "string" ||
    typeof trait.description !== "string"
  ) {
    throw new InterceptaError("Intercepta returned an unexpected trait.");
  }
  return {
    risk: trait.risk,
    name: trait.name,
    txsCount: typeof trait.txsCount === "number" ? trait.txsCount : 0,
    description: trait.description,
  };
}

function detail(
  payTo: string,
  toxicScore: number,
  traits: InterceptaTrait[],
  blocked: boolean,
): string {
  const score = `toxic score ${toxicScore}`;
  if (!blocked) {
    return `Intercepta ${score} for ${payTo}.`;
  }
  const findings = traits
    .map((trait) => trait.description || trait.name)
    .join(" ");
  return findings
    ? `Intercepta blocked ${payTo}. ${score}. ${findings}`
    : `Intercepta blocked ${payTo}. ${score}.`;
}
