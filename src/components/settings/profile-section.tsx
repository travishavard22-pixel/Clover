"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import type { ProfileDTO } from "@/lib/settings/prefs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/switch";
import { errorMessage } from "@/lib/client/request";
import { Rows, Section } from "./section";
import { settingsApi } from "./settings-api";

export function ProfileSection({ profile: initial }: { profile: ProfileDTO }) {
  const [profile, setProfile] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== profile.name;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const { profile: next } = await settingsApi.updateProfile(name.trim());
      setProfile(next);
      setName(next.name);
      toast.success("Name updated.");
    } catch (err) {
      toast.error(errorMessage(err, "Could not update your name."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section id="profile" title="Profile" description="Who you are in Clover. Your email is your sign-in and cannot be changed here.">
      <Rows>
        <form className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end" onSubmit={save}>
          <Field label="Name" className="flex-1">
            {(p) => <Input {...p} value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Button type="submit" variant={dirty ? "primary" : "outline"} disabled={!dirty || !name.trim()} loading={saving}>
            Save name
          </Button>
        </form>
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-primary">Email</div>
            <div className="mt-0.5 truncate text-sm text-secondary">{profile.email}</div>
          </div>
          <Badge tone={profile.emailVerified ? "success" : "neutral"}>{profile.emailVerified ? "Verified" : "Not verified"}</Badge>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <div className="text-sm font-medium text-primary">Password</div>
            <div className="mt-0.5 text-sm text-secondary">At least 10 characters. Changing it signs out your other devices.</div>
          </div>
          <ChangePasswordDialog />
        </div>
      </Rows>
    </Section>
  );
}

function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setRevoke(true);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("Use at least 10 characters.");
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await settingsApi.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: revoke });
      toast.success("Password changed.");
      setOpen(false);
      reset();
    } catch (err) {
      setError(errorMessage(err, "Could not change the password."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" leadingIcon={<KeyRound className="size-4" aria-hidden />}>
          Change password
        </Button>
      </DialogTrigger>
      <DialogContent title="Change password" description="Enter your current password, then the new one twice." size="sm">
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Current password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}</Field>
          <Field label="New password" hint="At least 10 characters. A sentence works well.">
            {(p) => <Input {...p} type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />}
          </Field>
          <Field label="Repeat new password">{(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}</Field>
          <label className="flex items-start gap-3 text-sm text-primary">
            <Checkbox checked={revoke} onCheckedChange={(v) => setRevoke(v === true)} className="mt-0.5" />
            <span>
              Sign out my other devices
              <span className="block text-xs text-secondary">This browser stays signed in.</span>
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={busy}>
              Change password
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
