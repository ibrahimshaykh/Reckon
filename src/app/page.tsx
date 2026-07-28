import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";
import { Landing } from "@/components/landing/landing";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/groups");

  return <Landing />;
}
