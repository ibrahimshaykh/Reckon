import { formatMoney } from "@/lib/money";
import { interpolate } from "@/lib/i18n";
import { joinNames } from "@/lib/expense-summary";
import { SketchPanel } from "@/components/sketch/sketch-ui";
import type { OutstandingGuest } from "@/lib/actions/guest";
import type { Dictionary } from "@/lib/dictionary";

/**
 * Guests who still owe, shown apart from the member ledger above.
 *
 * Kept separate on purpose. The ledger solves "the fewest payments that clear
 * every debt" between accounts, and a guest has none — dropping them in would
 * break the arithmetic that makes it minimal. But leaving them out entirely
 * meant a guest's share silently inflated whichever member was hosting them,
 * with nothing anywhere naming the guest or the amount. Somebody reading the
 * page could see Lola owing more and have no way to find out why.
 */
export function GuestDebts({
  guests,
  currency,
  dict,
}: {
  guests: OutstandingGuest[];
  currency: string;
  dict: Dictionary;
}) {
  if (guests.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {dict.settle.guestsHeading}
      </p>
      <p className="text-xs text-muted-foreground">{dict.settle.guestsNote}</p>

      <ul className="flex flex-col gap-2">
        {guests.map((guest, i) => (
          <SketchPanel key={guest.id} variant={i} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{guest.name}</span>
              <span className="tabular text-sm">
                {formatMoney(guest.shareCents, currency)}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {guest.expenseTitle}
              {guest.hostNames.length > 0 && (
                <>
                  {" · "}
                  {/* The line that was missing from this page entirely: until
                      the guest pays, a named member is carrying this, and that
                      is why their own figure above looks larger than their
                      share of the bill. */}
                  {interpolate(dict.settle.guestCarriedBy, {
                    hosts: joinNames(guest.hostNames, dict.common.and),
                  })}
                </>
              )}
            </p>

            {/* Only three states can reach here: a guest who declined or has
                paid is a closed question and never appears on this page. */}
            <p className="text-xs">
              {guest.status === "SENT" ? (
                <span className="text-positive">{dict.settle.guestSaysSent}</span>
              ) : guest.status === "PAYING" ? (
                <span className="text-muted-foreground">
                  {dict.settle.guestSaysPaying}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {dict.settle.guestNoAnswer}
                </span>
              )}
            </p>
          </SketchPanel>
        ))}
      </ul>
    </section>
  );
}
