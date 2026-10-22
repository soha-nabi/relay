'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Building2,
  Smartphone,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Shield,
  CreditCard,
} from 'lucide-react';

interface Props {
  initialSessionId?: string;
  relayBaseUrl?: string;
}

const SUPPORTED_BANKS = [
  {
    id: 'hsbc',
    name: 'HSBC Global Payment Gateway',
    shortName: 'HSBC',
    color: '#db0011',
    accent: '#ffffff',
    domain: 'acs.hsbc.com/3ds-secure/authenticate',
    cert: 'The Hongkong and Shanghai Banking Corporation Limited [GB]',
    badge: 'HSBC 3DS Verified',
  },
  {
    id: 'dbs',
    name: 'DBS Bank (IDEAL / PayLah!)',
    shortName: 'DBS',
    color: '#d9272e',
    accent: '#ffffff',
    domain: 'ideal.dbs.com/corporate/auth-challenge',
    cert: 'DBS Bank Ltd [SG] · Monetary Authority of Singapore Regulated',
    badge: 'DBS Secure Authentication',
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank SmartHub 3D-Secure',
    shortName: 'HDFC',
    color: '#004c8f',
    accent: '#ffffff',
    domain: 'netsafe.hdfcbank.com/adaptive-auth/challenge',
    cert: 'HDFC Bank Limited [IN] · Reserve Bank of India Licensed',
    badge: 'HDFC Bank SafePay',
  },
  {
    id: 'chase',
    name: 'JPMorgan Chase Paymentech 3DS',
    shortName: 'CHASE',
    color: '#1170cf',
    accent: '#ffffff',
    domain: 'secure.chase.com/acs/cardholder-verification',
    cert: 'JPMorgan Chase Bank, N.A. [US] · FDIC Insured',
    badge: 'Chase Shield Verified',
  },
];

const DEMO_PRESETS = [
  { id: 'hsbc-limit', bankId: 'hsbc', title: 'HSBC Card Limit (₹2,400)', amount: 2400, reason: 'Daily transaction limit exceeded' },
  { id: 'dbs-timeout', bankId: 'dbs', title: 'DBS Switch Timeout (₹5,500)', amount: 5500, reason: 'Issuer switch timeout (ISO-91)' },
  { id: 'hdfc-auth', bankId: 'hdfc', title: 'HDFC SafePay 3DS (₹12,000)', amount: 12000, reason: '3DS Strong Customer Authentication' },
  { id: 'chase-corp', bankId: 'chase', title: 'Chase Paymentech ($450)', amount: 37500, reason: 'Corporate procurement threshold' },
];

export default function BankAcsSimulator({
  initialSessionId = '',
  relayBaseUrl = process.env.NEXT_PUBLIC_RELAY_API_URL || 'http://localhost:8000',
}: Props) {
  const relayAppUrl = process.env.NEXT_PUBLIC_RELAY_APP_URL || 'http://localhost:3000';
  const [sessionId, setSessionId] = useState<string>(initialSessionId || 'DEMO_HSBC_8821');
  const [selectedBank, setSelectedBank] = useState(SUPPORTED_BANKS[0]);
  const [amount, setAmount] = useState<number>(2400);
  const [authMode, setAuthMode] = useState<'otp' | 'netbanking' | 'upi_push'>('otp');
  const [otp, setOtp] = useState<string>('849201');
  const [timer, setTimer] = useState<number>(59);
  const [loading, setLoading] = useState<boolean>(false);
  const [authResult, setAuthResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number>(3);

  // Fetch session details from Relay backend if active session ID
  useEffect(() => {
    if (sessionId && !sessionId.startsWith('DEMO_')) {
      fetch(`${relayBaseUrl}/api/pay/${encodeURIComponent(sessionId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.amount) {
            setAmount(data.amount);
          }
        })
        .catch(() => {});
    }
  }, [sessionId, relayBaseUrl]);

  // Countdown timer for OTP
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Automatic redirect back to Relay upon bank authorization
  useEffect(() => {
    if (!authResult) return;
    if (redirectCountdown <= 0) {
      const returnUrl = sessionId && !sessionId.startsWith('DEMO_')
        ? `${relayAppUrl}/pay/${encodeURIComponent(sessionId)}?recovered=true&bank_auth=${authResult.approval_code}`
        : `${relayAppUrl}/pay?recovered=true&bank_auth=${authResult.approval_code}`;
      window.location.href = returnUrl;
      return;
    }
    const timerId = setInterval(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearInterval(timerId);
  }, [authResult, redirectCountdown, sessionId, relayAppUrl]);

  const selectPreset = (preset: typeof DEMO_PRESETS[0]) => {
    const b = SUPPORTED_BANKS.find((item) => item.id === preset.bankId) || SUPPORTED_BANKS[0];
    setSelectedBank(b);
    setAmount(preset.amount);
    setSessionId(`DEMO_${preset.bankId.toUpperCase()}_${Math.floor(1000 + Math.random() * 9000)}`);
    setErrorMessage(null);
    setAuthResult(null);
  };

  const handleAuthorize = async (simulateStatus: 'approved' | 'declined' = 'approved') => {
    setLoading(true);
    setErrorMessage(null);
    const activeSid = sessionId || 'DEMO_HSBC_8821';

    try {
      // 1. Post to Relay Bank Authorization API
      const res = await fetch(`${relayBaseUrl}/api/pay/${encodeURIComponent(activeSid)}/bank-authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_name: selectedBank.name,
          auth_method: authMode.toUpperCase(),
          payment_method: 'UPI',
          simulate_status: simulateStatus,
          decline_reason: simulateStatus === 'declined' ? 'Daily transaction limit exceeded on card' : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && (data.recovered || data.bank_status === 'APPROVED')) {
        setAuthResult(data);
      } else {
        setErrorMessage(data.message || 'Authorization was declined by issuing bank.');
      }
    } catch {
      // 2. Standalone simulation fallback
      if (simulateStatus === 'declined') {
        setErrorMessage(`Authorization Declined by ${selectedBank.shortName}: Card spending limit exceeded (ISO-8583 Code 51). No funds were debited.`);
      } else {
        setAuthResult({
          status: 'success',
          bank_status: 'APPROVED',
          approval_code: `${selectedBank.shortName}-AUTH-${Math.floor(100000 + Math.random() * 900000)}`,
          bank_name: selectedBank.name,
          recovered: true,
          amount: amount,
          network_reference: `NET_STAN_${Math.floor(10000000 + Math.random() * 90000000)}`,
          message: `${selectedBank.name} 3DS ACS verification approved. Transaction cleared directly on bank core switch.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col font-sans">
      
      {/* ── Simulated Browser Security Bar (Authentic Isolated Bank Domain) ─ */}
      <div className="bg-slate-900 text-slate-400 px-4 py-2 text-xs flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2 max-w-xl w-full">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          </div>
          <div className="bg-slate-950 px-3 py-1 rounded-md flex items-center gap-2 text-slate-200 font-mono text-[11px] flex-1 border border-slate-800">
            <Lock size={12} className="text-emerald-400" />
            <span>https://{selectedBank.domain}?session={sessionId.slice(0, 12)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <ShieldCheck size={14} /> Bank TLS 1.3 Certified
          </span>
          <span className="text-slate-600">|</span>
          <a
            href={`${relayAppUrl}/pay/${encodeURIComponent(sessionId)}`}
            className="text-slate-300 hover:text-white font-semibold transition"
          >
            Cancel & Return to Relay
          </a>
        </div>
      </div>

      {/* ── Bank Selector Bar (Multi-Bank ACS Switching) ──────────────────── */}
      <div className="bg-white border-b border-slate-300 px-4 py-2.5 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <Building2 size={16} className="text-sky-600" />
            <span>SELECT ISSUING BANK ACS GATEWAY:</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {SUPPORTED_BANKS.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setSelectedBank(b);
                  setErrorMessage(null);
                  setAuthResult(null);
                }}
                style={{
                  backgroundColor: selectedBank.id === b.id ? b.color : '#ffffff',
                  borderColor: selectedBank.id === b.id ? b.color : '#e2e8f0',
                  color: selectedBank.id === b.id ? '#ffffff' : '#334155',
                }}
                className="px-3 py-1 rounded-md text-xs font-bold border transition-all"
              >
                {b.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Demo Presets */}
        <div className="max-w-4xl mx-auto mt-2 pt-2 border-t border-dashed border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Quick Simulation Presets:</span>
          <div className="flex gap-1.5 flex-wrap">
            {DEMO_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition"
              >
                {p.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Bank Card Container ────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-300">
          
          {/* Bank Brand Header */}
          <div
            style={{ backgroundColor: selectedBank.color, color: selectedBank.accent }}
            className="p-5 sm:p-6 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center font-black text-lg tracking-tight">
                {selectedBank.shortName}
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                  {selectedBank.name}
                </h2>
                <div className="text-xs opacity-90 flex items-center gap-1.5 mt-0.5">
                  <Lock size={11} /> {selectedBank.badge} · 3-D Secure 2.2
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase font-bold opacity-80 tracking-wider">Amount to Charge</div>
              <div className="text-xl sm:text-2xl font-black">{formattedAmount}</div>
            </div>
          </div>

          {/* Certificate Banner */}
          <div className="bg-slate-50 px-6 py-2 border-b border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Shield size={12} className="text-emerald-600" />
              <span>{selectedBank.cert}</span>
            </div>
            <span className="font-semibold">Merchant: RELAY*CHECKOUT</span>
          </div>

          {/* Body */}
          <div className="p-6">
            {authResult ? (
              /* Approved State */
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4">
                  <CheckCircle2 size={40} className="text-emerald-600" />
                </div>
                <h3 className="text-xl font-extrabold text-emerald-950 mb-1">
                  Transaction Approved by {selectedBank.shortName}
                </h3>
                <p className="text-sm text-emerald-700 mb-6">
                  Issuing bank has cleared this payment. Relay recovery callback dispatched.
                </p>

                {/* Audit Details */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 max-w-sm mx-auto mb-6 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Bank Approval Code:</span>
                    <span className="font-extrabold font-mono text-slate-900">{authResult.approval_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">ISO-8583 Status:</span>
                    <span className="font-bold text-emerald-600">00 (Approved)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Network STAN:</span>
                    <span className="font-mono text-slate-700">{authResult.network_reference || 'STAN_948210'}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-slate-300 pt-2">
                    <span className="text-slate-500">Relay Status:</span>
                    <span className="font-bold text-blue-600">RECOVERED</span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 mb-4">
                  Redirecting back to Relay in <strong>{redirectCountdown}s</strong>...
                </div>

                <a
                  href={`${relayBaseUrl}/pay/${encodeURIComponent(sessionId)}?recovered=true&bank_auth=${authResult.approval_code}`}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition"
                >
                  Return to Merchant Now <ArrowRight size={14} />
                </a>
              </div>
            ) : (
              /* Challenge Form */
              <div>
                {/* Method Switcher inside Bank */}
                <div className="flex gap-2 mb-5 border-b border-slate-200 pb-3">
                  <button
                    onClick={() => setAuthMode('otp')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      authMode === 'otp' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Smartphone size={14} /> 3DS One-Time Passcode
                  </button>
                  <button
                    onClick={() => setAuthMode('netbanking')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      authMode === 'netbanking' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <KeyRound size={14} /> NetBanking Login
                  </button>
                  <button
                    onClick={() => setAuthMode('upi_push')}
                    className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                      authMode === 'upi_push' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Building2 size={14} /> App Push
                  </button>
                </div>

                {errorMessage && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs mb-5 flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Mode: OTP */}
                {authMode === 'otp' && (
                  <div>
                    <p className="text-xs text-slate-700 mb-4 leading-relaxed">
                      A secure 6-digit authentication code has been sent to your registered mobile number ending in <strong>•••• ••8921</strong>.
                    </p>

                    <div className="max-w-xs mx-auto mb-5">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                        ENTER 6-DIGIT BANK OTP
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="849201"
                        className="w-full text-center text-2xl font-black tracking-[8px] py-3 rounded-lg border-2 border-slate-300 bg-slate-50 text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                      <div className="flex justify-between items-center mt-2 text-[11px] text-slate-500">
                        <span>Expires in: <strong>{timer}s</strong></span>
                        <button
                          type="button"
                          onClick={() => setTimer(60)}
                          className="text-blue-600 font-semibold hover:underline"
                        >
                          Resend Code
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mode: NetBanking */}
                {authMode === 'netbanking' && (
                  <div className="max-w-xs mx-auto mb-5 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Corporate / Customer ID
                      </label>
                      <input
                        type="text"
                        defaultValue="CORP_HSBC_982"
                        className="w-full p-2.5 rounded-lg border border-slate-300 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        NetBanking Password / Token
                      </label>
                      <input
                        type="password"
                        defaultValue="••••••••••••"
                        className="w-full p-2.5 rounded-lg border border-slate-300 text-xs text-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* Mode: UPI Push */}
                {authMode === 'upi_push' && (
                  <div className="text-center py-3 mb-5">
                    <Smartphone size={40} style={{ color: selectedBank.color }} className="mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-800 mb-1">
                      Payment Request Pushed to {selectedBank.shortName} App
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Open your bank application and approve payment for {formattedAmount}.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2.5 mt-6">
                  <button
                    onClick={() => handleAuthorize('approved')}
                    disabled={loading}
                    style={{ backgroundColor: selectedBank.color, color: selectedBank.accent }}
                    className="w-full py-3.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition opacity-100 hover:opacity-95"
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Connecting to {selectedBank.shortName} Core Switch...
                      </>
                    ) : (
                      <>
                        Authorize & Charge Account <CheckCircle2 size={16} />
                      </>
                    )}
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAuthorize('declined')}
                      disabled={loading}
                      className="flex-1 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-600 transition"
                    >
                      Simulate Limit Decline (ISO-51)
                    </button>
                    <a
                      href={`${relayAppUrl}/pay/${encodeURIComponent(sessionId)}`}
                      className="flex-1 py-2 bg-white hover:bg-red-50 border border-red-300 rounded-lg text-[11px] font-semibold text-red-600 text-center transition"
                    >
                      Cancel & Return
                    </a>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <Lock size={12} className="text-emerald-600" />
                  <span>256-Bit TLS Bank ACS Gateway. Relay does not store account credentials.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
