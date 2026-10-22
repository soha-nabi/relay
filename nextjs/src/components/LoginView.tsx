'use client';

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import RelayAnimatedPanel from '@/components/ui/relay-animated-panel';

export default function LoginView() {
  const { login, loading, error, clearError } = useAuth();

  const [email, setEmail] = useState('merchant@relay.ai');
  const [password, setPassword] = useState('merchant123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [signupModalOpen, setSignupModalOpen] = useState(false);

  // Load remember-me preference
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('relay_remember_email');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    } catch {
      // Storage access gracefully handled
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    if (rememberMe) {
      try {
        localStorage.setItem('relay_remember_email', email.trim());
      } catch {}
    } else {
      try {
        localStorage.removeItem('relay_remember_email');
      } catch {}
    }

    // Support both short usernames (merchant/admin/user) and email formats
    let loginIdentifier = email.trim();
    if (loginIdentifier.includes('@')) {
      const prefix = loginIdentifier.split('@')[0].toLowerCase();
      if (['merchant', 'admin', 'user'].includes(prefix)) {
        loginIdentifier = prefix;
      }
    }

    await login(loginIdentifier, password.trim());
  };

  const handleQuickDemo = (user: string, pass: string, emailDisplay: string) => {
    setEmail(emailDisplay);
    setPassword(pass);
    clearError();
    login(user, pass);
  };

  const handleGoogleSignIn = () => {
    setGoogleNotice(
      'Google OAuth is not configured on this environment. Please sign in with your email & password or use a Demo account.'
    );
    setTimeout(() => setGoogleNotice(null), 5000);
  };

  const handlePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetSuccess(true);
    setTimeout(() => {
      setResetSuccess(false);
      setResetModalOpen(false);
      setResetEmail('');
    }, 2500);
  };

  return (
    <div
      className="h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col lg:flex-row overflow-hidden no-scrollbar"
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {/* ── LEFT COLUMN: Sign-In Form (54% on desktop, fits full window tab without middle scrollbar) ─ */}
      <div
        className="w-full lg:w-[54%] h-full flex flex-col justify-between px-6 sm:px-10 lg:px-10 xl:px-14 py-4 sm:py-5 overflow-y-auto no-scrollbar"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        
        {/* Brand Bar Header */}
        <div className="flex items-center justify-between w-full shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#070D22] text-white flex items-center justify-center font-extrabold text-xs tracking-tight shadow-xs">
              R
            </span>
            <span className="font-bold text-[#111111] text-[17px] tracking-tight">
              Relay<span className="text-[#2563EB]">AI</span>
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-[#647084] bg-slate-50 border border-slate-200/80 px-2.5 py-0.5 rounded-full">
            <Sparkles size={11} className="text-[#2563EB]" />
            <span>Enterprise Preview</span>
          </div>
        </div>

        {/* Center Main Form */}
        <div className="w-full max-w-[420px] mx-auto my-auto py-2">
          {/* Heading */}
          <h1
            className="text-[#111111] font-bold tracking-tight leading-tight"
            style={{ fontSize: 'clamp(1.75rem, 2.8vw, 2.25rem)' }}
          >
            Welcome
          </h1>

          {/* Subtitle */}
          <p className="mt-1 text-[#647084] text-[13.5px] font-normal leading-normal">
            Access your account and continue your journey with us
          </p>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium animate-fadeInUp"
            >
              <AlertCircle size={15} className="shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          {/* Google Notice Banner */}
          {googleNotice && (
            <div
              role="status"
              className="mt-3 flex items-start gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium animate-fadeInUp"
            >
              <AlertCircle size={15} className="shrink-0 text-[#2563EB] mt-0.5" />
              <div className="flex-1 leading-snug">{googleNotice}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {/* Email Field */}
            <div>
              <label
                htmlFor="signin-email"
                className="block text-[#111111] text-[13px] font-medium mb-1 select-none"
              >
                Email Address
              </label>
              <input
                id="signin-email"
                type="text"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) clearError();
                }}
                placeholder="Enter your email address"
                className="w-full h-[44px] px-3.5 rounded-[10px] bg-[#F1F3F6] border border-[#E0E4EB] text-[#111111] text-[14px] font-normal placeholder-[#94A3B8] transition-all duration-150 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:bg-white"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="signin-password"
                className="block text-[#111111] text-[13px] font-medium mb-1 select-none"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="signin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) clearError();
                  }}
                  placeholder="Enter your password"
                  className="w-full h-[44px] pl-3.5 pr-10 rounded-[10px] bg-[#F1F3F6] border border-[#E0E4EB] text-[#111111] text-[14px] font-normal placeholder-[#94A3B8] transition-all duration-150 focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#647084] hover:text-[#111111] hover:bg-black/5 transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Reset Password Row */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="remember-me-checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer accent-[#2563EB]"
                />
                <span className="text-[12.5px] text-[#647084] font-medium leading-none">
                  Remember me
                </span>
              </label>

              <button
                type="button"
                onClick={() => setResetModalOpen(true)}
                className="text-[12.5px] font-medium text-[#155EEF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded"
              >
                Reset password
              </button>
            </div>

            {/* Primary Sign In Button */}
            <div className="pt-1">
              <button
                id="btn-signin-submit"
                type="submit"
                disabled={loading}
                className="w-full h-[46px] rounded-[10px] bg-[#070D22] text-white text-[14.5px] font-semibold tracking-wide hover:bg-[#0F172A] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-xs flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </div>

            {/* Divider */}
            <div className="relative py-0.5 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#E0E4EB]" />
              </div>
              <span className="relative z-10 bg-white px-2.5 text-[11.5px] text-[#647084] font-medium select-none">
                Or continue with
              </span>
            </div>

            {/* Google Sign In Button */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full h-[44px] rounded-[10px] bg-white border border-[#E0E4EB] text-[#111111] text-[13.5px] font-medium hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2.5 shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-black/5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Create Account Prompt */}
            <div className="pt-0.5 text-center text-[12.5px] text-[#647084]">
              <span>New to RelayAI? </span>
              <button
                type="button"
                onClick={() => setSignupModalOpen(true)}
                className="font-medium text-[#155EEF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded"
              >
                Create Account
              </button>
            </div>
          </form>

          {/* Quick Demo Test Accounts Bar */}
          <div className="mt-3.5 pt-3 border-t border-[#F1F5F9]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                One-Click Test Accounts
              </span>
              <span className="text-[9.5px] font-medium text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded-full">
                Pre-configured
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                id="quick-signin-merchant"
                onClick={() => handleQuickDemo('merchant', 'merchant123', 'merchant@relay.ai')}
                className="px-2 py-1.5 rounded-lg border border-[#E0E4EB] bg-[#F8FAFC] hover:bg-blue-50 hover:border-blue-200 text-[#111111] text-[11.5px] font-semibold transition text-center"
              >
                Merchant
              </button>
              <button
                type="button"
                id="quick-signin-admin"
                onClick={() => handleQuickDemo('admin', 'admin123', 'admin@relay.ai')}
                className="px-2 py-1.5 rounded-lg border border-[#E0E4EB] bg-[#F8FAFC] hover:bg-blue-50 hover:border-blue-200 text-[#111111] text-[11.5px] font-semibold transition text-center"
              >
                Admin
              </button>
              <button
                type="button"
                id="quick-signin-user"
                onClick={() => handleQuickDemo('user', 'user123', 'user@relay.ai')}
                className="px-2 py-1.5 rounded-lg border border-[#E0E4EB] bg-[#F8FAFC] hover:bg-blue-50 hover:border-blue-200 text-[#111111] text-[11.5px] font-semibold transition text-center"
              >
                Customer
              </button>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="w-full text-center text-[11px] text-[#94A3B8] pt-2 shrink-0">
          Protected by enterprise-grade 256-bit encryption. RelayAI © 2026.
        </div>
      </div>

      {/* ── RIGHT COLUMN: Animated RelayAI Brand Panel (46% on desktop) ─ */}
      <div className="w-full lg:w-[46%] h-full p-3 sm:p-4 lg:p-4 xl:p-5 flex items-stretch">
        <RelayAnimatedPanel />
      </div>

      {/* ── Modal: Password Reset ─────────────────────────────────────── */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeInUp">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E0E4EB] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#111111]">Reset Password</h3>
            <p className="text-xs text-[#647084] mt-1 mb-4">
              Enter your email address and we will dispatch a secure recovery link.
            </p>
            {resetSuccess ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Password reset link sent! Check your inbox.</span>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F1F3F6] border border-[#E0E4EB] text-xs text-[#111111] focus:outline-none focus:border-[#2563EB]"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#647084] hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#070D22] text-white text-xs font-semibold hover:bg-[#0F172A]"
                  >
                    Send Reset Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Create Account ──────────────────────────────────────── */}
      {signupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeInUp">
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#E0E4EB] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#111111]">Create RelayAI Account</h3>
            <p className="text-xs text-[#647084] mt-1 mb-4">
              Self-service merchant onboarding is managed through your organization administrator or pre-configured credentials.
            </p>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-[#475569] space-y-1">
              <div><strong>Default Merchant:</strong> merchant@relay.ai (pwd: merchant123)</div>
              <div><strong>Default Operator:</strong> admin@relay.ai (pwd: admin123)</div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSignupModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#070D22] text-white text-xs font-semibold hover:bg-[#0F172A]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
