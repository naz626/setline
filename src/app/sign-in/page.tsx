import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AppShell";
import { SignInForm } from "@/components/AuthForms";
import { getCurrentUser } from "@/lib/auth/session";

async function SignIn() {
  if (await getCurrentUser()) redirect("/programs");
  return <SignInForm />;
}

export default function SignInPage() {
  return (
    <AuthShell title="Sign in" lead="Enter your email and we will send you a link. No password needed.">
      <SignIn />
    </AuthShell>
  );
}
