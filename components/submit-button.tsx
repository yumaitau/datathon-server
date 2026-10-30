"use client";

import { useFormStatus } from "react-dom";
import { type ButtonVariant, buttonClass } from "@/components/ui";

export function SubmitButton({ children, variant = "primary", size = "md", pendingLabel, ...rest }: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pendingLabel?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size)} {...rest}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}
