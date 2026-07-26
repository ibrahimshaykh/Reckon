import { Prisma } from "@/generated/prisma/client";

export function toCents(amount: Prisma.Decimal | number): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  return Math.round(value * 100);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}
