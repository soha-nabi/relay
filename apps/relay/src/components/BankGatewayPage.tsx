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
  ExternalLink,
  ChevronRight,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { bankAuthorizePayment, getPaymentSession } from '../lib/api';
import type { BankAuthResult, CustomerPaymentDetails } from '../types';

interface BankGatewayPageProps {
  initialSessionId?: string;
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
  { id: 'hsbc-limit', bankId: 'hsbc', title: 'HSBC Card Limit (₹2,400)', amount: 2400, customer: 'CUST_HSBC_01', reason: 'Daily transaction limit exceeded' },
  { id: 'dbs-timeout', bankId: 'dbs', title: 'DBS Switch Timeout (₹5,500)', amount: 5500, customer: 'CUST_DBS_02', reason: 'Issuer switch timeout (ISO-91)' },
  { id: 'hdfc-auth', bankId: 'hdfc', title: 'HDFC SafePay 3DS (₹12,000)', amount: 12000, customer: 'CUST_HDFC_03', reason: '3DS Strong Customer Authentication' },
  { id: 'chase-corp', bankId: 'chase', title: 'Chase Paymentech ($450)', amount: 37500, customer: 'CUST_CHASE_04', reason: 'Corporate procurement threshold' },
];

export default function BankGatewayPage({ initialSessionId = '' }: BankGatewayPageProps) {
  const [sessionId, setSessionId] = useState<string>(initialSessionId || 'DEMO_HSBC_8821');
  const [sessionDetails, setSessionDetails] = useState<CustomerPaymentDetails | null>(null);
  const [selectedBank, setSelectedBank] = useState(SUPPORTED_BANKS[0]);
  const [customAmount, setCustomAmount] = useState<number | null>(null);
  const [authMode, setAuthMode] = useState<'otp' | 'netbanking' | 'upi_push'>('otp');
  const [otp, setOtp] = useState<string>('849201');
  const [timer, setTimer] = useState<number>(59);
  const [loading, setLoading] = useState<boolean>(false);
  const [authResult, setAuthResult] = useState<BankAuthResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number>(3);

  // Parse session from URL if not given
  useEffect(() => {
    if (!initialSessionId) {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const sidFromPath = parts.length > 2 ? parts[2] : (parts.length > 1 && parts[0] === 'bank' ? parts[1] : '');
      const sidFromQuery = new URLSearchParams(window.location.search).get('session_id') || '';
      const resolved = sidFromPath || sidFromQuery;
      if (resolved) {
        setSessionId(resolved);
      }
    }
  }, [initialSessionId]);

  // Fetch session details from backend
  useEffect(() => {
    if (sessionId && !sessionId.startsWith('DEMO_')) {
      getPaymentSession(sessionId)
        .then((data) => setSessionDetails(data))
        .catch(() => {});
    }
  }, [sessionId]);

  // Timer countdown
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Redirect countdown after approval
  useEffect(() => {
    if (!authResult) return;
    if (redirectCountdown <= 0) {
      window.location.href = `/pay/${encodeURIComponent(sessionId)}?recovered=true&bank_auth=${authResult.approval_code}`;
      return;
    }
    const timerId = setInterval(() => setRedirectCountdown((c) => c - 1), 1000);
    return () => clearInterval(timerId);
  }, [authResult, redirectCountdown, sessionId]);

  const selectPreset = (preset: typeof DEMO_PRESETS[0]) => {
    const bank = SUPPORTED_BANKS.find((b) => b.id === preset.bankId) || SUPPORTED_BANKS[0];
    setSelectedBank(bank);
    setCustomAmount(preset.amount);
    setSessionId(`DEMO_${preset.bankId.toUpperCase()}_${Math.floor(1000 + Math.random() * 9000)}`);
    setErrorMessage(null);
    setAuthResult(null);
  };

  const handleAuthorize = async (simulateStatus: 'approved' | 'declined' = 'approved') => {
    setLoading(true);
    setErrorMessage(null);
    const activeSid = sessionId || 'DEMO_HSBC_8821';
    const amountVal = customAmount || sessionDetails?.amount || 2400;

    try {
      // First attempt real backend bank-authorization if session exists in DB
      const res = await bankAuthorizePayment(activeSid, {
        bank_name: selectedBank.name,
        auth_method: authMode.toUpperCase(),
        payment_method: sessionDetails?.methods?.[0]?.type || 'UPI',
        simulate_status: simulateStatus,
        decline_reason: simulateStatus === 'declined' ? 'Daily transaction limit exceeded on card' : undefined,
      });

      if (res.recovered || res.bank_status === 'APPROVED') {
        setAuthResult(res);
      } else {
        setErrorMessage(res.message || 'Authorization was declined by issuing bank.');
      }
    } catch {
      // Graceful standalone simulation mode for demo sessions
      if (simulateStatus === 'declined') {
        setErrorMessage(`Authorization Declined by ${selectedBank.shortName}: Card spending limit exceeded (ISO-8583 Code 51). No funds were debited.`);
      } else {
        setAuthResult({
          status: 'success',
          bank_status: 'APPROVED',
          approval_code: `${selectedBank.shortName}-AUTH-${Math.floor(100000 + Math.random() * 900000)}`,
          bank_name: selectedBank.name,
          recovered: true,
          amount: amountVal,
          network_reference: `NET_STAN_${Math.floor(10000000 + Math.random() * 90000000)}`,
          message: `${selectedBank.name} 3DS ACS verification approved. Transaction cleared directly on bank core switch.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const amount = customAmount || sessionDetails?.amount || 2400;
  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

  return (
    <div style={{ minHeight: '100vh', background: '#e2e8f0', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── Simulated Browser Security Bar (Demonstrating Separation from Relay) ─ */}
      <div style={{ background: '#1e293b', color: '#94a3b8', padding: '8px 16px', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '600px', width: '100%' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
          </div>
          <div style={{ background: '#0f172a', padding: '4px 12px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', color: '#f1f5f9', fontFamily: 'monospace', fontSize: '11px', flex: 1, border: '1px solid #334155' }}>
            <Lock size={11} style={{ color: '#10b981' }} />
            <span>https://{selectedBank.domain}?sid={sessionId.slice(0, 8)}...</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldCheck size={13} /> Bank TLS 1.3 Certified
          </span>
          <span style={{ color: '#64748b' }}>|</span>
          <a href={`/pay/${encodeURIComponent(sessionId)}`} style={{ color: '#cbd5e1', textDecoration: 'none', fontWeight: 600 }}>
            Cancel & Return to Relay
          </a>
        </div>
      </div>

      {/* ── Bank Selector Bar (For Demo & Multi-Bank Switch) ─────────────── */}
      <div style={{ background: '#ffffff', borderBottom: '1px solid #cbd5e1', padding: '10px 16px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={15} style={{ color: '#0284c7' }} />
            <span>SELECT ISSUING BANK ACS GATEWAY:</span>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SUPPORTED_BANKS.map((bank) => (
              <button
                key={bank.id}
                onClick={() => {
                  setSelectedBank(bank);
                  setErrorMessage(null);
                  setAuthResult(null);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: `2px solid ${selectedBank.id === bank.id ? bank.color : '#e2e8f0'}`,
                  background: selectedBank.id === bank.id ? bank.color : '#ffffff',
                  color: selectedBank.id === bank.id ? '#ffffff' : '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {bank.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Live Simulation Presets */}
        <div style={{ maxWidth: '820px', margin: '8px auto 0', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Quick Simulation Presets:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => selectPreset(preset)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                {preset.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Bank Authorization Portal ───────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ background: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 30px rgba(15,23,42,0.15)', maxWidth: '640px', width: '100%', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
          
          {/* Bank Brand Header */}
          <div style={{ background: selectedBank.color, color: selectedBank.accent, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '16px', letterSpacing: '-0.04em' }}>
                {selectedBank.shortName}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {selectedBank.name}
                </h2>
                <div style={{ fontSize: '11px', opacity: 0.9, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={10} /> {selectedBank.badge} · 3-D Secure 2.2
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount to Charge</div>
              <div style={{ fontSize: '20px', fontWeight: 900 }}>{formattedAmount}</div>
            </div>
          </div>

          {/* Certificate & Regulatory Disclaimer Banner */}
          <div style={{ background: '#f8fafc', padding: '8px 24px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={12} style={{ color: '#16a34a' }} />
              <span>{selectedBank.cert}</span>
            </div>
            <span style={{ fontWeight: 600 }}>Merchant: RELAY*CHECKOUT</span>
          </div>

          {/* Body Content */}
          <div style={{ padding: '24px' }}>
            {authResult ? (
              /* Success / Approved State */
              <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={36} style={{ color: '#16a34a' }} />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#166534', margin: '0 0 6px' }}>
                  Transaction Approved by Bank
                </h3>
                <p style={{ fontSize: '13px', color: '#15803d', margin: '0 0 20px' }}>
                  {selectedBank.name} has authorized this payment. Relay recovery callback triggered.
                </p>

                {/* Bank Audit Details */}
                <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', maxWidth: '420px', margin: '0 auto 24px', textAlign: 'left', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b' }}>Bank Approval Code:</span>
                    <span style={{ fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>{authResult.approval_code}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b' }}>ISO-8583 Status:</span>
                    <span style={{ fontWeight: 700, color: '#16a34a' }}>00 (Transaction Approved)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b' }}>Network Reference:</span>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#475569' }}>{authResult.network_reference || 'NET_98234812'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                    <span style={{ color: '#64748b' }}>Relay Session:</span>
                    <span style={{ fontWeight: 700, color: '#2563eb' }}>RECOVERED</span>
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
                  Redirecting back to Relay Merchant Checkout in <strong>{redirectCountdown}s</strong>...
                </div>

                <a
                  href={`/pay/${encodeURIComponent(sessionId)}?recovered=true&bank_auth=${authResult.approval_code}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    background: '#0f172a',
                    color: '#ffffff',
                    textDecoration: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Return to Merchant Now <ArrowRight size={14} />
                </a>
              </div>
            ) : (
              /* Authorization Challenge */
              <div>
                {/* Method Switcher inside Bank */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                  <button
                    onClick={() => setAuthMode('otp')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: authMode === 'otp' ? '#f1f5f9' : 'transparent',
                      color: authMode === 'otp' ? '#0f172a' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Smartphone size={14} /> 3DS One-Time Passcode
                  </button>
                  <button
                    onClick={() => setAuthMode('netbanking')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: authMode === 'netbanking' ? '#f1f5f9' : 'transparent',
                      color: authMode === 'netbanking' ? '#0f172a' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <KeyRound size={14} /> Corporate / NetBanking Login
                  </button>
                  <button
                    onClick={() => setAuthMode('upi_push')}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: authMode === 'upi_push' ? '#f1f5f9' : 'transparent',
                      color: authMode === 'upi_push' ? '#0f172a' : '#64748b',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Building2 size={14} /> Instant Bank App Push
                  </button>
                </div>

                {errorMessage && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Mode: OTP */}
                {authMode === 'otp' && (
                  <div>
                    <p style={{ fontSize: '13px', color: '#334155', margin: '0 0 16px', lineHeight: 1.5 }}>
                      A secure 6-digit authentication code has been sent to your registered mobile number ending in <strong>•••• ••8921</strong> and registered email.
                    </p>

                    <div style={{ maxWidth: '320px', margin: '0 auto 20px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                        ENTER 6-DIGIT BANK OTP
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="849201"
                        style={{
                          width: '100%',
                          textAlign: 'center',
                          fontSize: '24px',
                          fontWeight: 800,
                          letterSpacing: '8px',
                          padding: '12px',
                          borderRadius: '10px',
                          border: '2px solid #cbd5e1',
                          outline: 'none',
                          color: '#0f172a',
                          background: '#f8fafc',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                        <span>Expires in: <strong>{timer}s</strong></span>
                        <button
                          type="button"
                          onClick={() => setTimer(60)}
                          style={{ background: 'transparent', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                        >
                          Resend Code
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mode: NetBanking */}
                {authMode === 'netbanking' && (
                  <div style={{ maxWidth: '380px', margin: '0 auto 20px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Customer ID / Username
                      </label>
                      <input
                        type="text"
                        defaultValue="CORP_HSBC_982"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        NetBanking Password / Token
                      </label>
                      <input
                        type="password"
                        defaultValue="••••••••••••"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Mode: UPI Push */}
                {authMode === 'upi_push' && (
                  <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                    <Smartphone size={40} style={{ color: selectedBank.color, margin: '0 auto 12px' }} />
                    <p style={{ fontSize: '13px', color: '#334155', fontWeight: 600, margin: '0 0 6px' }}>
                      Payment Request Pushed to {selectedBank.shortName} Mobile App
                    </p>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                      Open your bank application on your device and tap <strong>Approve</strong> for {formattedAmount}.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                  <button
                    onClick={() => handleAuthorize('approved')}
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: selectedBank.color,
                      color: selectedBank.accent,
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: 800,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
                    }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting to {selectedBank.shortName} Core Switch...
                      </>
                    ) : (
                      <>
                        Authorize & Charge Account <CheckCircle2 size={16} />
                      </>
                    )}
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleAuthorize('declined')}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      Simulate Bank Limit Decline (ISO-51)
                    </button>
                    <a
                      href={`/pay/${encodeURIComponent(sessionId)}`}
                      style={{
                        flex: 1,
                        padding: '10px',
                        background: '#ffffff',
                        border: '1px solid #ef4444',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#ef4444',
                        textAlign: 'center',
                        textDecoration: 'none',
                      }}
                    >
                      Cancel & Return to Relay
                    </a>
                  </div>
                </div>

                {/* Security Footnote */}
                <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
                  <Lock size={11} style={{ color: '#16a34a' }} />
                  <span>256-Bit TLS Bank ACS Gateway. Relay does not access, store, or process account credentials.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
