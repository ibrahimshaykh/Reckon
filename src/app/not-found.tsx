import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 p-12 text-center">
      <h1 className="text-lg font-semibold">Can&apos;t find that.</h1>
      <p className="text-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Button render={<Link href="/groups" />} nativeButton={false}>
        Back to your groups
      </Button>
    </div>
  );
}
