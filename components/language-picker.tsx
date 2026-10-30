"use client";

import { setLocaleAction } from "@/app/locale-actions";

export type PickerLanguage = { code: string; label: string };

/** Submits as soon as a language is chosen; the hidden button covers no-JS use. */
export function LanguagePicker({ current, languages, label }: { current: string; languages: PickerLanguage[]; label: string }) {
  return (
    <form action={setLocaleAction}>
      <label className="sr-only" htmlFor="locale-picker">{label}</label>
      <select
        id="locale-picker"
        name="locale"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink-muted hover:bg-sunken"
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
      <button type="submit" className="sr-only">{label}</button>
    </form>
  );
}
