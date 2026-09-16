import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/home");
  return <AuthForm mode="sign-up" />;
}
