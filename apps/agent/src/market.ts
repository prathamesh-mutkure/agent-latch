const ticks = [
  { note: "ETH steady", amount: "100" },
  { note: "ETH dropped 6.1%", amount: "2500" },
  { note: "ETH dropped 18%", amount: "10000" },
] as const;

let cursor = 0;

export function nextTick(): { note: string; amount: string } {
  const tick = ticks[cursor % ticks.length];
  cursor += 1;
  if (!tick) {
    return ticks[0];
  }
  return tick;
}
