"use client";

import { useActionState } from "react";

type Result = { error?: string; ok?: boolean };

/** Form wrapper for server actions that return `{ error }` for expected failures. */
export function ActionForm({ action, children, className, success }: {
  action: (prev: Result, form: FormData) => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  success?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <p aria-live="polite" className={`text-sm ${state.error ? "text-danger" : "text-accent-strong"}`}>
        {state.error ?? (state.ok && success) ?? ""}
      </p>
    </form>
  );
}
