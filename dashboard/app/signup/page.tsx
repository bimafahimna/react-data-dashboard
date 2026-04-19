import React from "react";
import Link from "next/link";
import "@/styles/auth.css";

const Signup = () => {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Join Spendser and start managing your dashboard</p>
        </div>

        <div className="auth-social-group">
          <button className="auth-social-button">
            <span>Google</span>
          </button>
          <button className="auth-social-button">
            <span>Apple</span>
          </button>
        </div>

        <div className="auth-divider">or sign up with email</div>

        <form>
          <div className="auth-form-group">
            <label className="auth-label">Full Name</label>
            <input
              type="text"
              className="auth-input"
              placeholder="John Doe"
              required
            />
          </div>

          <div className="auth-form-group">
            <label className="auth-label">Email Address</label>
            <input
              type="email"
              className="auth-input"
              placeholder="name@company.com"
              required
            />
          </div>

          <div className="auth-form-group">
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="auth-form-group" style={{ marginBottom: '10px' }}>
            <label className="auth-label">Confirm Password</label>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              required
            />
          </div>

          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>
            By signing up, you agree to our <Link href="#" style={{ color: '#6366f1' }}>Terms</Link> and <Link href="#" style={{ color: '#6366f1' }}>Privacy Policy</Link>.
          </p>

          <button type="submit" className="auth-button">
            Create Account
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
