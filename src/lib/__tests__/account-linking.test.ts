import { describe, it, expect } from "vitest";
import { decideAdoption } from "@/lib/account-linking";

const OLD = "user_old";
const NEW = "user_new";

describe("decideAdoption", () => {
  it("moves the account across when the email is proven", () => {
    // The same person through a second OAuth provider, or after recreating
    // their login. Their expenses and debts are on the existing row.
    expect(
      decideAdoption({
        ownerClerkId: OLD,
        incomingClerkId: NEW,
        emailVerified: true,
      }),
    ).toBe("adopt");
  });

  it("refuses an unproven email", () => {
    // The security of the whole thing. Without this, signing up with somebody
    // else's address would inherit their money and their groups.
    expect(
      decideAdoption({
        ownerClerkId: OLD,
        incomingClerkId: NEW,
        emailVerified: false,
      }),
    ).toBe("refuseUnverified");
  });

  it("reports nothing to adopt when no account holds the email", () => {
    // Then the unique-index collision was about something else, and pretending
    // otherwise would swallow a real error.
    expect(
      decideAdoption({
        ownerClerkId: null,
        incomingClerkId: NEW,
        emailVerified: true,
      }),
    ).toBe("notOurs");
  });

  it("does not strand a session that already owns the row", () => {
    // Re-pointing it is a no-op. Refusing would lock someone out of their own
    // account over a race they had no part in.
    expect(
      decideAdoption({
        ownerClerkId: NEW,
        incomingClerkId: NEW,
        emailVerified: false,
      }),
    ).toBe("adopt");
  });

  it("never adopts a stranger's row on an unproven email, whatever the ids", () => {
    for (const ownerClerkId of [OLD, "user_someone_else", ""]) {
      if (ownerClerkId === NEW) continue;
      expect(
        decideAdoption({ ownerClerkId, incomingClerkId: NEW, emailVerified: false }),
      ).not.toBe("adopt");
    }
  });
});
