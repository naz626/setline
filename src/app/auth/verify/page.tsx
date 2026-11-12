import { AuthShell } from "@/components/AppShell";
import { VerifyForm } from "@/components/AuthForms";

async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return <p className="text-sm">This link is missing its code. <a href="/sign-in" className="font-semibold underline">Request a new one</a>.</p>;
  }
  // Signing in takes a button press so that email scanners opening the link cannot use it up.
  return <VerifyForm token={token} />;
}

export default function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <AuthShell title="Almost there" lead="Confirm it is you to finish signing in.">
      <Verify searchParams={searchParams} />
    </AuthShell>
  );
}
