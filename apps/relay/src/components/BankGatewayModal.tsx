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
  X,
  RefreshCw,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { bankAuthorizePayment } from '../lib/api';
import type { BankAuthResult } from '../types';

interface BankGatewayModalProps {
  sessionId: string;
  amount: number;
  customerName?: string;
  paymentMethod?: string;
  failureReason?: string;
  onSuccess: (result: BankAuthResult) => void;
  onClose: () => void;
}

const SUPPORTED_BANKS = [
  { id: 'hsbc', name: 'HSBC Global Gateway', color: '#db0011', badge: 'HSBC 3DS' },
  { id: 'dbs', name: 'DBS IDEAL / PayLah!', color: '#d9272e', badge: 'DBS Secure' },
  { id: 'hdfc', name: 'HDFC Bank 3D Secure 2.0', color: '#004c8f', badge: 'HDFC Safe' },
  { id: 'chase', name: 'Chase Paymentech', color: '#1170cf', badge: 'Chase Shield' },
];

export default function BankGatewayModal({
  sessionId,
  amount,
  customerName = 'Valued Customer',
  paymentMethod = 'UPI',
  failureReason = '',
  onSuccess,
  onClose,
}: BankGatewayModalProps) {
  const [selectedBank, setSelectedBank] = useState(SUPPORTED_BANKS[0]);
  const [authMode, setAuthMode] = useState<'otp' | 'netbanking' | 'upi_push'>('otp');
  const [otp, setOtp] = useState<string>('849201');
  const [timer, setTimer] = useState<number>(59);
  const [loading, setLoading] = useState<boolean>(false);
  const [authResult, setAuthResult] = useState<BankAuthResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Countdown timer for OTP / push
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleAuthorize = async (simulateStatus: 'approved' | 'declined' = 'approved') => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await bankAuthorizePayment(sessionId, {
        bank_name: selectedBank.name,
        auth_method: authMode.toUpperCase(),
        payment_method: paymentMethod,
        simulate_status: simulateStatus,
        decline_reason: simulateStatus === 'declined' ? 'Daily transaction limit exceeded on card' : undefined,
      });

      if (res.recovered || res.bank_status === 'APPROVED') {
        setAuthResult(res);
        setTimeout(() => {
          onSuccess(res);
        }, 1800);
      } else {
        setErrorMessage(res.message || 'Authorization was declined by issuing bank.');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Bank gateway connection timeout.');
    } finally {
      setLoading(false);
    }
  };

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Bank Portal Brand Bar */}
        <div
          style={{
            backgroundColor: '#0b1533',
            color: '#ffffff',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: selectedBank.color,
                boxShadow: `0 0 10px ${selectedBank.color}`,
              }}
            />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {selectedBank.name}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={10} style={{ color: '#22c55e' }} /> TLS 1.3 256-bit Encrypted Banking Switch
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Cancel and return to merchant"
          >
            <X size={18} />
          </button>
        </div>

        {/* Bank Switcher (Simulation Selector) */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '8px 16px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
            Simulate Bank:
          </span>
          {SUPPORTED_BANKS.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBank(b)}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: '6px',
                border: selectedBank.id === b.id ? `1px solid ${b.color}` : '1px solid #cbd5e1',
                backgroundColor: selectedBank.id === b.id ? '#ffffff' : 'transparent',
                color: selectedBank.id === b.id ? '#0f172a' : '#64748b',
                cursor: 'pointer',
              }}
            >
              {b.badge}
            </button>
          ))}
        </div>

        {/* Main Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {authResult ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <CheckCircle2 size={36} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
                Bank Authorization Confirmed
              </h3>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
                {selectedBank.name} has authorized the capture of {formattedAmount}.
              </p>

              <div
                style={{
                  backgroundColor: '#f1f5f9',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'left',
                  fontSize: '12px',
                  color: '#334155',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>Bank Approval Code:</span>
                  <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{authResult.approval_code}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>Transaction ID:</span>
                  <span style={{ fontWeight: 600 }}>{authResult.transaction_id || sessionId}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Status Callback:</span>
                  <span style={{ fontWeight: 700, color: '#16a34a' }}>webhook.payment.captured</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#2563eb', fontSize: '13px', fontWeight: 600 }}>
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Redirecting back to Relay Merchant portal...
              </div>
            </div>
          ) : (
            /* Interactive Auth Form */
            <div>
              {/* Order / Amount Summary */}
              <div
                style={{
                  background: 'linear-gradient(to right, #f8fafc, #eff6ff)',
                  border: '1px solid #dbeafe',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Merchant Authorization Request
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Relay Merchant Solutions</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Customer: {customerName}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Amount to Pay</div>
                  <div style={{ fontSize: '22px', fontWeight: 900, color: '#1d4ed8' }}>{formattedAmount}</div>
                </div>
              </div>

              {/* Failure Context Alert */}
              {failureReason && (
                <div
                  style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#92400e',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    <strong>Resolution Step:</strong> Prior attempt failed ({failureReason}). Authorize this fresh session through your issuing bank.
                  </span>
                </div>
              )}

              {/* Auth Method Selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button
                  onClick={() => setAuthMode('otp')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: authMode === 'otp' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: authMode === 'otp' ? '#eff6ff' : '#ffffff',
                    color: authMode === 'otp' ? '#1d4ed8' : '#64748b',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Smartphone size={14} /> 3D-Secure OTP
                </button>
                <button
                  onClick={() => setAuthMode('netbanking')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: authMode === 'netbanking' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: authMode === 'netbanking' ? '#eff6ff' : '#ffffff',
                    color: authMode === 'netbanking' ? '#1d4ed8' : '#64748b',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Building2 size={14} /> NetBanking
                </button>
                <button
                  onClick={() => setAuthMode('upi_push')}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '10px',
                    border: authMode === 'upi_push' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                    background: authMode === 'upi_push' ? '#eff6ff' : '#ffffff',
                    color: authMode === 'upi_push' ? '#1d4ed8' : '#64748b',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <KeyRound size={14} /> Instant UPI
                </button>
              </div>

              {/* Mode Views */}
              {authMode === 'otp' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Enter 6-Digit Banking One-Time Password (OTP)
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="123456"
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        fontSize: '18px',
                        letterSpacing: '4px',
                        textAlign: 'center',
                        fontWeight: 800,
                        border: '2px solid #cbd5e1',
                        borderRadius: '10px',
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => setOtp(String(Math.floor(100000 + Math.random() * 900000)))}
                      style={{
                        padding: '0 14px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      Resend ({timer}s)
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                    SMS dispatched to registered mobile ending in <strong>••48</strong>.
                  </p>
                </div>
              )}

              {authMode === 'netbanking' && (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Bank Customer / Corporate ID
                  </label>
                  <input
                    type="text"
                    defaultValue="hsbc_corp_9021"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 14px',
                      fontSize: '13px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      marginBottom: '10px',
                    }}
                  />
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                    Password / SecureKey PIN
                  </label>
                  <input
                    type="password"
                    defaultValue="••••••••"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 14px',
                      fontSize: '13px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                    }}
                  />
                </div>
              )}

              {authMode === 'upi_push' && (
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    borderRadius: '12px',
                    padding: '20px',
                    textAlign: 'center',
                    marginBottom: '20px',
                  }}
                >
                  <Smartphone size={32} style={{ color: '#2563eb', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                    Collect Request Sent to UPI App
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 12px' }}>
                    Open Google Pay / PhonePe / PayLah! on your device to approve <strong>{formattedAmount}</strong>.
                  </p>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
                    Awaiting App Approval ({timer}s)
                  </span>
                </div>
              )}

              {errorMessage && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <AlertCircle size={14} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={() => handleAuthorize('approved')}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    backgroundColor: selectedBank.color,
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Authorizing with {selectedBank.name}...
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      Authorize Payment ({formattedAmount})
                    </>
                  )}
                </button>

                {/* Simulate Decline Button */}
                <button
                  onClick={() => handleAuthorize('declined')}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    border: '1px dashed #cbd5e1',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Test Failure Flow: Simulate Bank Decline (ISO-61 Limit Exceeded)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bank Portal Footer */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '12px 20px',
            fontSize: '11px',
            color: '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>PCI-DSS Level 1 Authenticated Switch</span>
          <span>Session: {sessionId.substring(0, 12)}...</span>
        </div>
      </div>
    </div>
  );
}
