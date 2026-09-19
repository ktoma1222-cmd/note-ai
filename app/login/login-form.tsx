"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground-muted">PIN</label>
        <input
          type="password"
          name="pin"
          required
          inputMode="numeric"
          pattern="\d{6,8}"
          maxLength={8}
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-accent"
          placeholder="••••••"
        />
      </div>
      {state.error && (
        <p className="text-sm text-negative">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "ログイン中..." : "ログイン"}
      </button>
    </form>
  );
}
