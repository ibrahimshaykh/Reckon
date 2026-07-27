import { getNetBalanceWithUser } from "@/lib/actions/cross-group";
import { formatMoney } from "@/lib/money";

export default async function FriendNetPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { otherUserName, groupBreakdown, totalNetCents, commonCurrency } =
    await getNetBalanceWithUser(userId);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">You and {otherUserName}</h1>
      <p className="text-sm">
        {totalNetCents === null
          ? "Shared groups use different currencies — see the breakdown below."
          : totalNetCents === 0
            ? "All settled up across every shared group."
            : totalNetCents > 0
              ? `${otherUserName} owes you ${formatMoney(totalNetCents, commonCurrency!)} overall.`
              : `You owe ${otherUserName} ${formatMoney(-totalNetCents, commonCurrency!)} overall.`}
      </p>
      <ul className="flex flex-col gap-1">
        {groupBreakdown.map((g) => (
          <li key={g.groupId} className="text-xs text-muted-foreground">
            {g.groupName}:{" "}
            {g.netCents === 0 ? "settled" : formatMoney(Math.abs(g.netCents), g.currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
