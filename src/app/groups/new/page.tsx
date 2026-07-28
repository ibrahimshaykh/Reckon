import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { CreateGroupForm } from "@/components/groups/create-group-form";

export default async function NewGroupPage() {
  const session = await requireSession();
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 md:py-14">
      <h1 className="text-xl font-semibold">{dict.groupHub.newGroup}</h1>
      <CreateGroupForm dict={dict} />
    </div>
  );
}
