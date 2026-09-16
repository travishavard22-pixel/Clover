"use client";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { PreferencesDTO, PreferencesPatch } from "@/lib/settings/schema";
import { errorMessage } from "@/lib/client/request";
import { settingsApi } from "./settings-api";

/** Optimistic preference updates: apply locally, save, revert with the server's reason if it fails. */
export function usePreferences(initial: PreferencesDTO) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const update = useCallback(
    async (patch: PreferencesPatch, opts: { successMessage?: string } = {}) => {
      const keys = Object.keys(patch);
      let previous: PreferencesDTO | null = null;
      setPrefs((p) => {
        previous = p;
        return { ...p, ...(patch as Partial<PreferencesDTO>) };
      });
      setPending((s) => new Set([...s, ...keys]));
      try {
        const { preferences } = await settingsApi.updatePreferences(patch);
        setPrefs(preferences);
        if (opts.successMessage) toast.success(opts.successMessage);
        return true;
      } catch (err) {
        if (previous) setPrefs(previous);
        toast.error(errorMessage(err, "Could not save that setting."));
        return false;
      } finally {
        setPending((s) => {
          const next = new Set(s);
          for (const k of keys) next.delete(k);
          return next;
        });
      }
    },
    [],
  );

  return { prefs, update, pending };
}
