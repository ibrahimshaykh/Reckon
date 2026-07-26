import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { nudgeSweep } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [nudgeSweep],
});
