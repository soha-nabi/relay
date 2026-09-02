import React, { useEffect, useState } from 'react';
import { CreditCard, Smartphone, Wallet, CheckCircle2, ShieldCheck, ArrowRight, RefreshCw, X } from 'lucide-react';
import { getPaymentSession, selectPaymentMethod, processPayment } from '../lib/api';
import type { CustomerPaymentDetails, CustomerPaymentResult } from '../types';
import RelayVoiceAgent from './RelayVoiceAgent';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface Props {
  sessionId?: string;
  onClose?: () => void;
}

export default function CustomerPaymentExperience({ sessionId = '', onClose }: Props) {
  const [activeSessionId, setActiveSessionId] = useState<string>(sessionId);
  const [details, setDetails] = useState<CustomerPaymentDetails | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('UPI');
  const [loading, setLoading] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<CustomerPaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async (sid: string) => {
    if (!sid.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await getPaymentSession(sid.trim());
      setDetails(data);
      if (data.methods && data.methods.length > 0) {
        const rec = data.methods.find((m) => m.recommended);
        setSelectedMethod(rec ? rec.type : data.methods[0].type);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load recovery checkout session.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) {
      fetchSession(sessionId);
    }
  }, [sessionId]);

  const handleSelectMethod = async (methodType: string) => {
    setSelectedMethod(methodType);
    if (!activeSessionId) return;
    try {
      await selectPaymentMethod(activeSessionId, methodType);
    } catch {
      // Best-effort
    }
  };

  const handlePayNow = async (outcome: string = 'success') => {
    if (!activeSessionId) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await processPayment(activeSessionId, selectedMethod, outcome);
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Payment processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const getMethodIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'upi':
        return <Smartphone size={20} style={{ color: '#2563eb' }} />;
      case 'card':
      case 'credit_card':
        return <CreditCard size={20} style={{ color: '#8b5cf6' }} />;
      case 'wallet':
        return <Wallet size={20} style={{ color: '#10b981' }} />;
      default:
        return <CreditCard size={20} style={{ color: '#2563eb' }} />;
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: '24px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(15,23,42,0.04)', position: 'relative' }} className="sm:p-8">
      {onClose && (
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: '16px', top: '16px', background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
          Customer Experience Demo
        </p>
        <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          Frictionless Customer Payment
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
          Simulate the merchant recovery link and customer-facing payment completion checkout.
        </p>
      </div>

      {/* Session Lookup Input */}
      {!details && (
        <div style={{ maxWidth: '480px', marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Recovery Session ID
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={activeSessionId}
              onChange={(e) => setActiveSessionId(e.target.value)}
              placeholder="Enter active session_id"
              style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
            <button
              onClick={() => fetchSession(activeSessionId)}
              disabled={loading || !activeSessionId}
              style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {loading ? 'Loading…' : 'Load Payment Link'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Payment Details */}
      {details && (
        <div>
          {result ? (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '24px', textAlign: 'center' }} className="sm:p-9">
              <CheckCircle2 size={44} style={{ color: '#16a34a', margin: '0 auto 14px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#166534', margin: '0 0 6px' }}>
                Payment Restored Successfully!
              </h3>
              <p style={{ fontSize: '14px', color: '#15803d', margin: '0 0 16px' }}>
                {money(result.amount)} captured via {result.payment_method}. The recovery session has closed.
              </p>
              <button
                onClick={() => {
                  setResult(null);
                  setDetails(null);
                }}
                style={{ background: '#166534', color: 'white', border: 'none', borderRadius: '10px', padding: '10px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* AI Agent Panel */}
              {details.can_pay && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-6px' }}>
                  <RelayVoiceAgent
                    customerContext={{
                      customer_id: details.customer_id,
                      recovery_session_id: activeSessionId,
                      customer_name: 'Customer', // Would come from profile normally
                      amount: details.amount,
                    }}
                    onSelectMethod={(method) => handleSelectMethod(method)}
                    onPayNow={() => handlePayNow('success')}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {/* Order Summary */}
                <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
                    {details.title || 'Complete your payment'}
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
                    {details.message || 'Choose an alternate payment method below to finalize your order.'}
                  </p>

                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#64748b' }}>Customer</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{details.customer_id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                      <span style={{ color: '#64748b' }}>Failure Reason</span>
                      <span style={{ fontWeight: 600, color: '#ef4444' }}>{details.failure_reason || 'Decline'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '15px' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>Amount Due</span>
                      <span style={{ fontWeight: 800, color: '#2563eb' }}>{money(details.amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Methods */}
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
                    Select Payment Method
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    {(details.methods || [
                      { id: 'upi', type: 'UPI', label: 'Instant UPI (GPay / PhonePe / Paytm)', recommended: true, description: 'Highest success rate' },
                      { id: 'card', type: 'Card', label: 'Alternate Credit / Debit Card', recommended: false, description: 'Enter updated card details' },
                      { id: 'wallet', type: 'Wallet', label: 'Digital Wallet', recommended: false, description: 'Amazon Pay / Paytm' },
                    ]).map((method) => (
                      <div
                        key={method.id || method.type}
                        onClick={() => handleSelectMethod(method.type)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: '14px',
                          border: `2px solid ${selectedMethod === method.type ? '#2563eb' : '#e2e8f0'}`,
                          background: selectedMethod === method.type ? 'rgba(37,99,235,0.03)' : 'white',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {getMethodIcon(method.type)}
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{method.label}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{method.description}</div>
                          </div>
                        </div>
                        {method.recommended && (
                          <span style={{ fontSize: '10px', fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '999px', flexShrink: 0 }}>
                            Recommended
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      onClick={() => handlePayNow('success')}
                      disabled={processing || !details.can_pay}
                      style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', borderRadius: '12px', padding: '12px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      {processing ? 'Authorizing…' : `Pay ${money(details.amount)}`} <ArrowRight size={15} />
                    </button>
                    <button
                      onClick={() => handlePayNow('fail')}
                      disabled={processing}
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#ef4444', borderRadius: '12px', padding: '12px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Simulate Failure
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
