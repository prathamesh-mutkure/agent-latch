const ticks = [
  { note: "ETH steady", amount: "0.2" },
  { note: "ETH dropped 6.1%", amount: "0.5" },
  { note: "ETH dropped 18%", amount: "2" },
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
