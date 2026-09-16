import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/home");
  return <AuthForm mode="sign-in" />;
}
