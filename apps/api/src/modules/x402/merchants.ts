import { createPublicClient, formatGwei, http } from "viem";
import { sepolia } from "viem/chains";

/** A demo seller: one price, one thing it serves once the payment settles. */
export type Catalog = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  /** USDC base units, 6 decimals. */
  amountBaseUnits: string;
  serve: () => Promise<unknown> | unknown;
};

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

const fortunes = [
  { rank: "大吉", reading: "daikichi", meaning: "Great blessing" },
  { rank: "中吉", reading: "chūkichi", meaning: "Middle blessing" },
  { rank: "小吉", reading: "shōkichi", meaning: "Small blessing" },
  { rank: "吉", reading: "kichi", meaning: "Blessing" },
  { rank: "末吉", reading: "suekichi", meaning: "Blessing still to come" },
  {
    rank: "凶",
    reading: "kyō",
    meaning: "Curse. Tie it to the shrine branch.",
  },
] as const;

const catFacts = [
  "Cats sleep for about two thirds of their lives.",
  "A group of kittens is called a kindle.",
  "Cats have a third eyelid called a haw.",
  "A cat's nose print is as unique as a fingerprint.",
  "Cats can rotate their ears 180 degrees.",
  "Slow blinking at a cat is a way of saying you trust it.",
];

const sprites = {
  heart: [
    "..##.##.",
    ".#######",
    ".#######",
    "..#####.",
    "...###..",
    "....#...",
  ],
  ghost: [
    "..####..",
    ".######.",
    "#.##.###",
    "########",
    "########",
    "#.#.#.#.",
  ],
  star: [
    "...#....",
    "...#....",
    "#######.",
    ".#####..",
    ".##.##..",
    "#.....#.",
  ],
} as const;

async function chainSnapshot() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  const [block, gasPrice] = await Promise.all([
    client.getBlock(),
    client.getGasPrice(),
  ]);
  return {
    network: "Ethereum Sepolia",
    block: block.number.toString(),
    blockTime: new Date(Number(block.timestamp) * 1000).toISOString(),
    transactions: block.transactions.length,
    gasPriceGwei: formatGwei(gasPrice),
    baseFeeGwei: block.baseFeePerGas ? formatGwei(block.baseFeePerGas) : null,
  };
}

/** DSAP's demo sellers. Prices run from 0.1 to 0.6 USDC. */
export const catalog: Catalog[] = [
  {
    id: "omikuji",
    name: "Omikuji",
    emoji: "⛩️",
    description:
      "A paper fortune from a Shinto shrine: your luck rank in kanji, a lucky item, and a word of advice.",
    amountBaseUnits: "100000",
    serve: () => {
      const fortune = pick(fortunes);
      return {
        ...fortune,
        luckyItem: pick([
          "a red daruma",
          "matcha",
          "a paper crane",
          "a maneki-neko",
          "an umbrella",
        ]),
        advice: pick([
          "Wait for the cherry blossoms. Patience pays.",
          "Small steps up the torii path still reach the shrine.",
          "Today, trade less and drink more tea.",
          "Fall seven times, stand up eight. 七転び八起き",
        ]),
      };
    },
  },
  {
    id: "purr",
    name: "Purr",
    emoji: "🐈",
    description: "A cat fact and a small ASCII cat, delivered warm.",
    amountBaseUnits: "200000",
    serve: () => ({
      fact: pick(catFacts),
      cat: [" /\\_/\\ ", "( o.o )", " > ^ < "].join("\n"),
    }),
  },
  {
    id: "blob",
    name: "Blob",
    emoji: "🫧",
    description:
      "A one-of-a-kind kawaii blob sticker as SVG, in a random pastel color with a random mood.",
    amountBaseUnits: "300000",
    serve: () => {
      const color = pick([
        "#ffb3c7",
        "#b5e8ff",
        "#c9f7c1",
        "#fff1a8",
        "#dcc6ff",
      ]);
      const mouth = pick([
        "M88 118 Q100 130 112 118",
        "M90 122 L110 122",
        "M92 124 Q100 114 108 124",
      ]);
      return {
        color,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M40 110 C40 50 160 50 160 110 C160 160 40 160 40 110Z" fill="${color}" stroke="#333" stroke-width="4"/><circle cx="80" cy="100" r="7" fill="#333"/><circle cx="120" cy="100" r="7" fill="#333"/><circle cx="68" cy="116" r="8" fill="#ff8fab" opacity=".6"/><circle cx="132" cy="116" r="8" fill="#ff8fab" opacity=".6"/><path d="${mouth}" stroke="#333" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
      };
    },
  },
  {
    id: "pixel",
    name: "Pixel",
    emoji: "👾",
    description:
      "An 8-bit sprite as a pixel grid with its palette, ready to draw.",
    amountBaseUnits: "400000",
    serve: () => {
      const [sprite, rows] = pick(Object.entries(sprites));
      return {
        sprite,
        palette: { "#": pick(["#ff5d8f", "#7b61ff", "#ffbe0b"]), ".": null },
        rows,
      };
    },
  },
  {
    id: "lookout",
    name: "Lookout",
    emoji: "🔭",
    description:
      "A live Ethereum Sepolia snapshot: latest block, its time and size, gas price, and base fee.",
    amountBaseUnits: "500000",
    serve: chainSnapshot,
  },
  {
    id: "oracle",
    name: "Oracle",
    emoji: "🔮",
    description:
      "The premium reading: a live chain snapshot and a fortune, turned into a playful go or wait call.",
    amountBaseUnits: "600000",
    serve: async () => {
      const snapshot = await chainSnapshot();
      const fortune = pick(fortunes);
      const calm = Number(snapshot.gasPriceGwei) < 5;
      return {
        snapshot,
        fortune: `${fortune.rank} (${fortune.meaning})`,
        verdict:
          calm && fortune.reading !== "kyō"
            ? "The chain is calm and the stars agree. Go."
            : "Wait. Either gas is high or the fortune is shy.",
        disclaimer: "For fun. Not financial advice.",
      };
    },
  },
];
