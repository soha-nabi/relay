'use client';

import React from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import CustomerPaymentExperience from '@/components/CustomerPaymentExperience';

interface Props {
  initialSessionId?: string;
}

export default function CustomerHostedCheckout({ initialSessionId = '' }: Props) {
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* ── Top Header ────────────────────────────────────────────── */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 40, boxShadow: '0 1px 3px rgba(15,23,42,0.03)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#0f172a', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800 }}>
              R
            </span>
            <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.03em', color: '#0f172a' }}>relay</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '999px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Secure Recovery Checkout
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
              <ShieldCheck size={16} style={{ color: '#16a34a' }} />
              <span>Direct Bank 3DS Protected</span>
            </div>
            <a
              href="/"
              style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              Merchant Sign In <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Checkout Container ────────────────────────────────────── */}
      <main style={{ maxWidth: '960px', margin: '24px auto', padding: '0 16px', width: '100%', flex: 1 }}>
        <CustomerPaymentExperience sessionId={initialSessionId} />
      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer style={{ textAlign: 'center', padding: '24px 16px', color: '#94a3b8', fontSize: '12px', borderTop: '1px solid #e2e8f0', background: '#ffffff', marginTop: 'auto' }}>
        <p style={{ margin: 0 }}>
          Relay Two-Way Banking Recovery System · No payment card data stored on Relay servers. All transactions authorized directly via your bank.
        </p>
      </footer>
    </div>
  );
}
