import React from "react";
import Link from "next/link";
import "@/styles/auth.css";

const Login = () => {
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Welcome Back</h1>
          <p>Please enter your details to sign in</p>
        </div>

        <div className="auth-social-group">
          <button className="auth-social-button">
            <span>Google</span>
          </button>
          <button className="auth-social-button">
            <span>Apple</span>
          </button>
        </div>

        <div className="auth-divider">or sign in with email</div>

        <form>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="auth-label">Password</label>
              <Link href="#" className="forgot-password">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="auth-button">
            Sign In
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account? <Link href="/signup">Create account</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
