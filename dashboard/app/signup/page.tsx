import React from "react";
import Link from "next/link";

const Signup = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-[440px] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-10 transition-all duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Create Account</h1>
          <p className="text-slate-500 text-[15px]">Join Spendser and start managing your dashboard</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <span className="text-sm">Google</span>
          </button>
          <button className="flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-lg bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <span className="text-sm">Apple</span>
          </button>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <span className="relative px-3 bg-white text-xs font-semibold uppercase tracking-wider text-slate-400">
            or sign up with email
          </span>
        </div>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Full Name</label>
            <input
              type="text"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="John Doe"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Email Address</label>
            <input
              type="email"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="name@company.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Password</label>
            <input
              type="password"
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5 ml-0.5">Confirm Password</label>
            <input
              type="password"
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

          <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 transition-all shadow-md shadow-indigo-100 mt-2">
            Create Account
          </button>
        </form>

        <div className="text-center mt-7 text-sm text-slate-500">
          Already have an account? <Link href="/login" className="text-indigo-600 font-bold hover:underline">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
