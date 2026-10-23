import { cookies } from "next/headers";
import { RecoveryScreen } from "@/features/auth/components/recovery-form";
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const params = await searchParams;
  const jar = await cookies();
  return (
    <main className="workspace">
      <RecoveryScreen
        updating={Boolean(jar.get("msme-recovery")) && !params.invalid}
        invalid={Boolean(params.invalid)}
      />
    </main>
  );
}
