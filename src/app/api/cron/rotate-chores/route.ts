import { rotateLapsedChores } from "@/lib/rotate-group";

/**
 * Hands out any turn whose time is up, for every group, once a day.
 *
 * Rotation used to happen only when somebody pressed a button, so a household
 * that didn't open the app found yesterday's list waiting for them and nothing
 * assigned for today. A chore rota that needs winding by hand is one more
 * chore.
 *
 * Runs at 00:05 UTC. Groups ahead of UTC therefore roll over during their own
 * morning rather than at their midnight exactly, which is the best a single
 * daily schedule can do — and the rotation itself only ever assigns turns that
 * have genuinely ended, so running at the wrong moment is late, never early.
 */
export async function GET(request: Request) {
  // Vercel signs its cron requests with this. Without the check the endpoint
  // is a public button that reshuffles every household's chores.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await rotateLapsedChores();
  return Response.json(result);
}
