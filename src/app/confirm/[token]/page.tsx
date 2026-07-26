import { notFound } from "next/navigation";
import { getConfirmToken } from "@/lib/dal";
import { db } from "@/lib/db";
import { ConfirmButton } from "@/components/settlements/confirm-button";

export default async function ConfirmReceivedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const settlement = await getConfirmToken(token);
  if (!settlement) notFound();

  const [fromUser, toUser] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: settlement.fromUserId } }),
    db.user.findUniqueOrThrow({ where: { id: settlement.toUserId } }),
  ]);

  const amount = Number(settlement.amount).toFixed(2);
  const alreadyConfirmed = settlement.status === "CONFIRMED";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Confirm payment received</h1>
      {alreadyConfirmed ? (
        <p className="text-sm text-muted-foreground">
          Already confirmed — thanks! You told {fromUser.displayName} you got the ${amount}.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Hi {toUser.displayName} — {fromUser.displayName} says they paid you ${amount}. Did
            you receive it?
          </p>
          <ConfirmButton token={token} />
        </>
      )}
    </div>
  );
}
