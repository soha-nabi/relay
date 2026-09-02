import React, { useEffect, useState } from 'react';
import { Home, CreditCard, HelpCircle, User as UserIcon, ArrowRight, CheckCircle2, AlertTriangle, Smartphone, ShieldCheck, Menu } from 'lucide-react';
import MobileDrawer from './MobileDrawer';
import { userApi } from '../lib/api';
import type { RecoveryInstruction, UserDashboardData, UserTransaction } from '../types';
import CustomerPaymentExperience from './CustomerPaymentExperience';
import RelayVoiceAgent from './RelayVoiceAgent';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function UserShell() {
  const [activeTab, setActiveTab] = useState<'home' | 'payments' | 'recovery' | 'profile'>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [data, setData] = useState<UserDashboardData | null>(null);
  const [instructions, setInstructions] = useState<RecoveryInstruction[]>([]);
  const [support, setSupport] = useState<any>(null);
  const [selectedTxn, setSelectedTxn] = useState<UserTransaction | null>(null);
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, inst] = await Promise.all([
        userApi.getPayments(),
        userApi.getInstructions(),
      ]);
      setData(p);
      setInstructions(inst.instructions || []);
      setSupport(inst.support_contacts || {});

      // Auto-select first failed payment as outstanding
      const failed = p.transactions.find((t) => t.status === 'failed');
      if (failed) {
        setSelectedTxn(failed);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load account information.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const userNavItems = [
    { id: 'home',     label: 'Home',          icon: <Home size={18} /> },
    { id: 'payments', label: 'My Payments',   icon: <CreditCard size={18} /> },
    { id: 'recovery', label: 'Recovery Help', icon: <HelpCircle size={18} /> },
    { id: 'profile',  label: 'Profile',       icon: <UserIcon size={18} /> },
  ];

  return (
    <div className="w-full flex flex-col min-w-0 pb-16 mx-auto max-w-[800px]">

      {/* ── Mobile-only Header (hamburger) ─────────────────────────────────── */}
      <header className="mobile-header md:hidden">
        <span className="mobile-header-logo">Payments</span>
        <button
          className="hamburger-btn p-2"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <Menu size={20} />
        </button>
      </header>

      <MobileDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        navItems={userNavItems}
        activeId={activeTab}
        onSelect={(id) => {
          setActiveTab(id as any);
          setShowCheckout(false);
        }}
        title="My Account"
      />

      {/* ── User Navigation Tabs (desktop md+) ─────────────────────────── */}
      <div className="hidden md:block sticky top-[64px] z-30 pt-2 pb-3 mb-6 sm:mb-8 bg-slate-50/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="swipeable-tabs bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          {[
            { id: 'home', label: 'Home', icon: <Home size={15} /> },
            { id: 'payments', label: 'My Payments', icon: <CreditCard size={15} /> },
            { id: 'recovery', label: 'Recovery Help', icon: <HelpCircle size={15} /> },
            { id: 'profile', label: 'Profile', icon: <UserIcon size={15} /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`user-nav-${tab.id}`}
                onClick={(e) => {
                  setActiveTab(tab.id as any);
                  setShowCheckout(false);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                className={`swipe-item flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] sm:text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md transform scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                style={{
                  minHeight: '44px',
                  whiteSpace: 'nowrap',
                  touchAction: 'pan-x pan-y',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── 1. HOME / OVERVIEW ───────────────────────────────────── */}
      {activeTab === 'home' && !showCheckout && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Outstanding Attention Card */}
          {selectedTxn ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '24px', padding: '24px', boxShadow: '0 4px 20px rgba(245,158,11,0.06)' }} className="sm:p-8">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#d97706', display: 'inline-block' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Payment Needs Attention
                </span>
              </div>

              <h2 style={{ fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
                Amount Due: {money(selectedTxn.amount)}
              </h2>
              <p style={{ fontSize: '14px', color: '#78350f', margin: '0 0 20px', lineHeight: 1.5 }}>
                Your transaction with <strong>{selectedTxn.merchant}</strong> failed ({selectedTxn.reason}). Choose an alternative method to restore your payment instantly.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  id="btn-user-continue-payment"
                  onClick={() => setShowCheckout(true)}
                  style={{
                    background: '#0f172a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px 22px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
                  }}
                >
                  Continue Payment <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '24px', padding: '28px', textAlign: 'center' }}>
              <CheckCircle2 size={36} style={{ color: '#16a34a', margin: '0 auto 10px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#166534', margin: '0 0 6px' }}>All Payments Up to Date</h3>
              <p style={{ fontSize: '13px', color: '#15803d', margin: 0 }}>You have no outstanding payment recovery requests.</p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
            <div style={{ background: 'white', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Total Transactions</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{data?.summary.total_transactions || 4}</div>
            </div>
            <div style={{ background: 'white', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Successful</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>{data?.summary.successful_payments || 2}</div>
            </div>
            <div style={{ background: 'white', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Pending / Failed</span>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>{data?.summary.failed_payments || 2}</div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Screen */}
      {showCheckout && (
        <div>
          <button
            onClick={() => setShowCheckout(false)}
            style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '16px' }}
          >
            ← Back to my overview
          </button>
          <CustomerPaymentExperience
            sessionId="demo_user_session"
            onClose={() => setShowCheckout(false)}
          />
        </div>
      )}

      {/* ── 2. MY PAYMENTS ──────────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Payment History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(data?.transactions || []).map((t) => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{t.merchant}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: t.status === 'success' ? '#dcfce7' : '#fee2e2', color: t.status === 'success' ? '#166534' : '#b91c1c' }}>
                      {t.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{t.date} · {t.reason || 'Approved'}</div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>{money(t.amount)}</div>
                  {t.recovery_available && (
                    <button
                      onClick={() => {
                        setSelectedTxn(t);
                        setShowCheckout(true);
                      }}
                      style={{ background: 'transparent', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 700, cursor: 'pointer', padding: 0, marginTop: '2px' }}
                    >
                      Restore Payment →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. PAYMENT RECOVERY GUIDANCE ────────────────────────────────── */}
      {activeTab === 'recovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* AI Voice Assistant Card */}
          <RelayVoiceAgent
            variant="card"
            defaultOpen={true}
            customerContext={{
              customer_id: data?.user_profile?.username || 'user',
              customer_name: data?.user_profile?.name || 'Customer',
              amount: selectedTxn?.amount || 2499,
              failure_reason: selectedTxn?.reason || 'Payment declined',
            }}
            onSelectMethod={() => setShowCheckout(true)}
            onPayNow={() => setShowCheckout(true)}
          />

          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>Self-Service Recovery Assistance</h3>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px' }}>
              Common recovery pathways to quickly complete payments without re-entering checkout forms.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {instructions.map((inst, idx) => (
                <div key={idx} style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{inst.title}</div>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px', lineHeight: 1.5 }}>{inst.description}</p>
                  <button
                    onClick={() => setShowCheckout(true)}
                    style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                  >
                    {inst.action} →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Support Helpline */}
          {support && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 sm:p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Need Help?</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#14532d', marginTop: '2px', wordBreak: 'break-word' }}>{support.email} · {support.helpline}</div>
              </div>
              <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 600 }}>{support.hours}</span>
            </div>
          )}
        </div>
      )}

      {/* ── 4. PROFILE ──────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>User Account Profile</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 pb-3 border-b border-slate-100">
              <span style={{ color: '#64748b', fontSize: '13px' }}>Full Name</span>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{data?.user_profile?.name || 'User'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 pb-3 border-b border-slate-100">
              <span style={{ color: '#64748b', fontSize: '13px' }}>Username</span>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>{data?.user_profile?.username || 'user'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 pb-3 border-b border-slate-100">
              <span style={{ color: '#64748b', fontSize: '13px' }}>Email Address</span>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px', wordBreak: 'break-all' }}>{data?.user_profile?.email || 'user@relay.local'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <span style={{ color: '#64748b', fontSize: '13px' }}>Primary Payment Method</span>
              <span style={{ fontWeight: 600, color: '#2563eb', fontSize: '13px' }}>{data?.user_profile?.default_payment_method}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
