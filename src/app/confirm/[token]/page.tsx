import { notFound } from "next/navigation";
import { getConfirmToken } from "@/lib/dal";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getDictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
import { ConfirmButton } from "@/components/settlements/confirm-button";

export default async function ConfirmReceivedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const settlement = await getConfirmToken(token);
  if (!settlement) notFound();

  const dict = await getDictionary("en");
  const [fromUser, toUser, group] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: settlement.fromUserId } }),
    db.user.findUniqueOrThrow({ where: { id: settlement.toUserId } }),
    db.group.findUniqueOrThrow({ where: { id: settlement.groupId } }),
  ]);

  const amount = formatMoney(Math.round(Number(settlement.amount) * 100), group.currency);
  const alreadyConfirmed = settlement.status === "CONFIRMED";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <h1 className="text-xl font-semibold">{dict.confirm.title}</h1>
      {alreadyConfirmed ? (
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.confirm.alreadyConfirmed, { name: fromUser.displayName, amount })}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {interpolate(dict.confirm.askConfirm, {
              toName: toUser.displayName,
              fromName: fromUser.displayName,
              amount,
            })}
          </p>
          <ConfirmButton token={token} dict={dict} />
        </>
      )}
    </div>
  );
}
