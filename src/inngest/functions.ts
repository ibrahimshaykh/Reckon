import { inngest } from "@/lib/inngest";
import { runNudgeSweep } from "@/lib/nudges";

export const nudgeSweep = inngest.createFunction(
  { id: "nudge-sweep", triggers: [{ cron: "0 9 * * *" }] },
  async () => {
    return runNudgeSweep();
  },
);
