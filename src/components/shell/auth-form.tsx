"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { signIn, signUp } from "@/lib/auth-client";
import { useHydrated } from "@/hooks/use-hydrated";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Marks the form as interactive once React has hydrated; tests and progressive-enhancement checks read it.
  const hydrated = useHydrated();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res =
      mode === "sign-up"
        ? await signUp.email({ name: name.trim() || email.split("@")[0]!, email: email.trim(), password })
        : await signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong. Please try again.");
      return;
    }
    router.push(mode === "sign-up" ? "/onboarding" : "/home");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate data-hydrated={hydrated ? "true" : "false"}>
      <div>
        <h1 className="display text-3xl">{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-2 text-sm text-secondary">{mode === "sign-up" ? "Your first listing is about a minute away." : "Sign in to keep selling."}</p>
      </div>
      {mode === "sign-up" && (
        <Field label="Name">{(p) => <Input {...p} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      )}
      <Field label="Email">{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password" hint={mode === "sign-up" ? "At least 10 characters." : undefined} error={error}>
        {(p) => <Input {...p} type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-secondary">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link className="font-medium text-accent-text underline underline-offset-4" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Clover?{" "}
            <Link className="font-medium text-accent-text underline underline-offset-4" href="/sign-up">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
