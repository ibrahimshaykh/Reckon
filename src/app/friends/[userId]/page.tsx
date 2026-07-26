import { getNetBalanceWithUser } from "@/lib/actions/cross-group";

export default async function FriendNetPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { otherUserName, groupBreakdown, totalNetCents } = await getNetBalanceWithUser(userId);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">You and {otherUserName}</h1>
      <p className="text-sm">
        {totalNetCents === 0
          ? "All settled up across every shared group."
          : totalNetCents > 0
            ? `${otherUserName} owes you $${(totalNetCents / 100).toFixed(2)} overall.`
            : `You owe ${otherUserName} $${(-totalNetCents / 100).toFixed(2)} overall.`}
      </p>
      <ul className="flex flex-col gap-1">
        {groupBreakdown.map((g) => (
          <li key={g.groupId} className="text-xs text-muted-foreground">
            {g.groupName}: {g.netCents === 0 ? "settled" : `$${(Math.abs(g.netCents) / 100).toFixed(2)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
