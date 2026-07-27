import { getNetBalanceWithUser } from "@/lib/actions/cross-group";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";

export default async function FriendNetPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [session, { otherUserName, groupBreakdown, totalNetCents, commonCurrency }] =
    await Promise.all([requireSession(), getNetBalanceWithUser(userId)]);
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">
        {interpolate(dict.friends.youAnd, { name: otherUserName })}
      </h1>
      <p className="text-sm">
        {totalNetCents === null
          ? dict.friends.mixedCurrencies
          : totalNetCents === 0
            ? dict.friends.allSettled
            : totalNetCents > 0
              ? interpolate(dict.friends.owesYouOverall, {
                  name: otherUserName,
                  amount: formatMoney(totalNetCents, commonCurrency!),
                })
              : interpolate(dict.friends.youOweOverall, {
                  name: otherUserName,
                  amount: formatMoney(-totalNetCents, commonCurrency!),
                })}
      </p>
      <ul className="flex flex-col gap-1">
        {groupBreakdown.map((g) => (
          <li key={g.groupId} className="text-xs text-muted-foreground">
            {g.groupName}:{" "}
            {g.netCents === 0 ? dict.friends.settled : formatMoney(Math.abs(g.netCents), g.currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}
