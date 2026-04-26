"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { loginAction } from "./actions";
import { useActionState } from "react";

const Login = () => {
  const [state, formAction, isPending] = useActionState(loginAction, null)

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-10 transition-all duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-slate-500 text-[15px]">Please enter your details to sign in</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button type="button" variant="social" className="w-full">
            <Icons.Google className="w-5 h-5 pr-[2.5px]" />
            Google
          </Button>
          <Button type="button" variant="social" className="w-full">
            <Icons.Apple className="w-5 h-5 text-black" />
            Apple
          </Button>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <span className="relative px-3 bg-white text-xs font-semibold uppercase tracking-wider text-slate-400">
            or sign in with email
          </span>
        </div>

        <form action={formAction} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Email Address</label>
            <input
              type="email"
              name="email"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="name@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Password</label>
            <input
              type="password"
              name="password"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="••••••••"
              required
            />
            <div className="flex justify-end items-center mt-1.5 ml-0.5">
              <Link href="#" className="text-xs font-semibold text-indigo-600 hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>

          {state && !state.success && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {state.message}
            </p>
          )}
          {state && state.success && (
            <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
              {state.message}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2 py-3"
            disabled={isPending}
          >
            {isPending ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="text-center mt-7 text-sm text-slate-500">
          Don&apos;t have an account? <Link href="/signup" className="text-indigo-600 font-bold hover:underline">Create account</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
