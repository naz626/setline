import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AppShell";
import { WelcomeForm } from "@/components/AuthForms";
import { getCurrentMember, requireUser } from "@/lib/auth/session";

async function Welcome() {
  await requireUser();
  if (await getCurrentMember()) redirect("/programs");
  return <WelcomeForm />;
}

export default function WelcomePage() {
  return (
    <AuthShell title="Set up your workspace" lead="This is where your team, vendors and display programs live. You can invite people next.">
      <Welcome />
    </AuthShell>
  );
}
