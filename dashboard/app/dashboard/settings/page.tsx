"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { changePasswordAction } from "./actions";

export default function SettingsPage() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, null);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage account security and dashboard preferences.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
          <p className="mt-1 text-sm text-slate-500">Use at least 8 characters and avoid reusing old passwords.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1.5 ml-0.5 block text-sm font-semibold text-slate-800">Current Password</label>
            <input
              type="password"
              name="currentPassword"
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 ml-0.5 block text-sm font-semibold text-slate-800">New Password</label>
              <input
                type="password"
                name="newPassword"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                placeholder="Minimum 8 characters"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 ml-0.5 block text-sm font-semibold text-slate-800">Confirm New Password</label>
              <input
                type="password"
                name="confirmPassword"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                placeholder="Repeat new password"
                required
              />
            </div>
          </div>

          {state && (
            <p
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                state.success
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {state.message}
            </p>
          )}

          <Button type="submit" variant="primary" className="mt-2" disabled={isPending}>
            {isPending ? "Updating password..." : "Update password"}
          </Button>
        </form>
      </section>
    </main>
  );
}
