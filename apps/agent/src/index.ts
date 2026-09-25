import { packageId } from "@agentlatch/core";

console.log(`${packageId} agent runtime idle`);

if (import.meta.main) {
  await new Promise(() => {});
}
