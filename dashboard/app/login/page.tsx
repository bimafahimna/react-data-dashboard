"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/Icons";
import { loginUser } from "@/app/actions/auth";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const result = await loginUser({ email, password });

    setIsLoading(false);

    if (result.success) {
      setSuccess(result.message);
      // Redirect or show dashboard 
      // window.location.href = "/dashboard";
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-10 transition-all duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h1>
          <p className="text-slate-500 text-[15px]">Please enter your details to sign in</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Button type="button" variant="social" className="w-full">
            <Icons.Google className="w-5 h-5" />
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

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="name@company.com"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5 ml-0.5">
              <label className="text-sm font-semibold text-slate-800">Password</label>
              <Link href="#" className="text-xs font-semibold text-indigo-600 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Feedback Messages */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
              {success}
            </p>
          )}

          <Button 
            type="submit" 
            variant="primary" 
            className="w-full mt-2 py-3"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign In"}
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
