import { CreateGroupForm } from "@/components/groups/create-group-form";

export default function NewGroupPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">New group</h1>
      <CreateGroupForm />
    </div>
  );
}
