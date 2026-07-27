import { requireSession } from "@/lib/dal";
import { getDictionary } from "@/lib/dictionary";
import { CreateGroupForm } from "@/components/groups/create-group-form";

export default async function NewGroupPage() {
  const session = await requireSession();
  const dict = await getDictionary(session.locale);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{dict.groupHub.newGroup}</h1>
      <CreateGroupForm dict={dict} />
    </div>
  );
}
