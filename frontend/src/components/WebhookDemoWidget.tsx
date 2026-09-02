import React, { useState } from 'react';
import { Radio, CheckCircle2, AlertTriangle, Send } from 'lucide-react';
import { sendWebhookDemo } from '../lib/api';
import type { WebhookEventResponse } from '../types';

interface Props {
  onWebhookReceived?: (res: WebhookEventResponse) => void;
}

export default function WebhookDemoWidget({ onWebhookReceived }: Props) {
  const [eventType, setEventType] = useState<'payment.failed' | 'payment.captured'>('payment.failed');
  const [txnId, setTxnId] = useState<string>(() => `TXN_${Math.floor(100000 + Math.random() * 900000)}`);
  const [amount, setAmount] = useState<number>(2400);
  const [customerId, setCustomerId] = useState<string>('CUST000052');
  const [reason, setReason] = useState<string>('Card Declined');
  const [loading, setLoading] = useState<boolean>(false);
  const [lastResponse, setLastResponse] = useState<WebhookEventResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSendWebhook = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sendWebhookDemo({
        event: eventType,
        transaction_id: txnId,
        amount: Number(amount),
        customer_id: customerId,
        reason: eventType === 'payment.failed' ? reason : undefined,
        event_id: `evt_demo_${Date.now()}`,
      });
      setLastResponse(res);
      onWebhookReceived?.(res);
      // Generate next random txnId for convenience
      setTxnId(`TXN_${Math.floor(100000 + Math.random() * 900000)}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Webhook dispatch failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#f8fafc', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-7">
      {/* Title & Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={18} style={{ color: '#2563eb' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Payment Webhook Simulator
          </h3>
        </div>
        <span style={{ fontSize: '10px', fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em' }}>
          Demo / Test Only
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px', lineHeight: 1.5 }}>
        Simulate incoming payment failure or capture webhooks from Razorpay or Stripe to trigger automatic recovery.
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 14px', color: '#b91c1c', fontSize: '12px', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Form controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Event</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as any)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
          >
            <option value="payment.failed">payment.failed</option>
            <option value="payment.captured">payment.captured</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Transaction ID</label>
          <input
            type="text"
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Amount (₹)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Customer ID</label>
          <input
            type="text"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <button
        onClick={handleSendWebhook}
        disabled={loading}
        style={{
          width: '100%',
          background: eventType === 'payment.failed' ? '#ef4444' : '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          padding: '10px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <Send size={14} />
        {loading ? 'Posting Webhook…' : `Simulate ${eventType}`}
      </button>

      {/* Response Box */}
      {lastResponse && (
        <div style={{ marginTop: '16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px', fontSize: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 700, color: lastResponse.status === 'processed' ? '#16a34a' : '#2563eb' }}>
              ✓ Status: {lastResponse.status}
            </span>
            {lastResponse.session_id && (
              <span style={{ color: '#64748b', fontSize: '11px' }}>
                Session: {lastResponse.session_id.slice(0, 12)}…
              </span>
            )}
          </div>
          {lastResponse.message && <div style={{ color: '#475569' }}>{lastResponse.message}</div>}
        </div>
      )}
    </div>
  );
}
