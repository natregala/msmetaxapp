import { Workspace } from "@/features/transactions/components/workspace";
import { isConfigured } from "@/lib/supabase/server";
export default function Home() {
  return (
    <Workspace
      configured={
        process.env.NEXT_PUBLIC_DEMO_MODE === "true" || isConfigured()
      }
    />
  );
}
