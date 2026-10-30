"use client";

import { useActionState } from "react";

type Result = { error?: string; ok?: boolean; message?: string };

/** Form wrapper for server actions that return `{ error }` for expected failures, or a `message`. */
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
        {state.error ?? state.message ?? (state.ok && success) ?? ""}
      </p>
    </form>
  );
}
