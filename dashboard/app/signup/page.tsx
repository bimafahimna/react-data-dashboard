"use client";

import React, { useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { signupAction } from "./actions";
import { useActionState } from "react";

const Signup = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(signupAction, null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-10 transition-all duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Create Account</h1>
          <p className="text-slate-500 text-[15px]">Join <span className="text-indigo-400">InsightHub</span> and start managing your dashboard</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button type="button" variant="social" className="w-full">
            <Icons.Google className="w-5 h-5 pr-1" />
            Google
          </Button>
          <Button type="button" variant="social" className="w-full">
            <Icons.Apple className="w-5 h-5 text-black pr-0.5" />
            Apple
          </Button>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <span className="relative px-3 bg-white text-xs font-semibold uppercase tracking-wider text-slate-400">
            or sign up with email
          </span>
        </div>

        <form action={formAction} className="space-y-4" ref={formRef}>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Full Name</label>
            <input
              type="text"
              name="fullName"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="John Doe"
              required
            />
          </div>

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
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="py-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              By signing up, you agree to our <Link href="#" className="font-semibold text-indigo-600 hover:underline">Terms</Link> and <Link href="#" className="font-semibold text-indigo-600 hover:underline">Privacy Policy</Link>.
            </p>
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
            {isPending ? "Creating Account..." : "Create Account"}
          </Button>
        </form>

        <div className="text-center mt-7 text-sm text-slate-500">
          Already have an account? <Link href="/login" className="text-indigo-600 font-bold hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
