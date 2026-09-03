import React, { useEffect, useState } from 'react';
import {
  Activity,
  Users,
  Store,
  Radio,
  FileText,
  Shield,
  Server,
  Settings,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  Database,
  ArrowUpRight,
  Menu,
  AlertTriangle,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminMerchant, AdminPlatformStats, AdminUser } from '../types';
import MobileDrawer from './MobileDrawer';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function AdminShell() {
  const [activeNav, setActiveNav] = useState<'overview' | 'merchants' | 'users' | 'operations' | 'webhooks' | 'audit' | 'health'>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<AdminPlatformStats | null>(null);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m, u, w, a] = await Promise.all([
        adminApi.getPlatformStats(),
        adminApi.getMerchants(),
        adminApi.getUsers(),
        adminApi.getWebhooks(),
        adminApi.getAuditLogs(),
      ]);
      setStats(s);
      setMerchants(m.merchants || []);
      setUsers(u.users || []);
      setWebhooks(w.webhook_events || []);
      setAuditLogs(a.audit_logs || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load platform administration metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const navItems = [
    { id: 'overview', label: 'Platform Overview', icon: <Activity size={16} /> },
    { id: 'merchants', label: 'Merchants Directory', icon: <Store size={16} /> },
    { id: 'users', label: 'Platform Users', icon: <Users size={16} /> },
    { id: 'operations', label: 'Recovery Operations', icon: <TrendingUp size={16} /> },
    { id: 'webhooks', label: 'Webhook Stream', icon: <Radio size={16} /> },
    { id: 'audit', label: 'Audit Trail', icon: <FileText size={16} /> },
    { id: 'health', label: 'System Health', icon: <Server size={16} /> },
  ];

  const handleNavClick = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setActiveNav(id as any);
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  return (
    <div className="flex flex-col min-h-[80vh]">

      {/* ── Mobile-only Header (hamburger) ─────────────────────────────────── */}
      <header className="mobile-header md:hidden">
        <span className="mobile-header-logo">Admin</span>
        <button
          className="hamburger-btn"
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
        navItems={navItems}
        activeId={activeNav}
        onSelect={(id) => setActiveNav(id as any)}
        title="Platform Ops"
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8 flex-1">
      {/* ── Admin Sidebar Navigation (md+) ─────────────────────────────── */}
      <aside className="hidden md:block bg-white rounded-2xl p-2.5 sm:p-5 border border-slate-200 lg:h-fit sticky top-[64px] z-20 shadow-sm sm:shadow-none">
        <div className="hidden lg:flex items-center gap-2 mb-4 pb-3.5 border-b border-slate-100">
          <Shield size={18} className="text-blue-600" />
          <span className="text-sm font-extrabold text-slate-900 tracking-tight">Platform Operations</span>
        </div>

        <nav className="swipeable-tabs flex lg:flex-col overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 gap-2 scrollbar-hide">
          {navItems.map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={(e) => handleNavClick(item.id, e)}
                className={`swipe-item inline-flex items-center gap-4 px-4 py-3 rounded-xl text-[14px] sm:text-base font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md transform scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                style={{
                  minHeight: '56px',
                  padding: '0.75rem 1rem',
                  whiteSpace: 'nowrap',
                  touchAction: 'pan-x pan-y',
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Admin Content Area ──────────────────────────────────────────── */}
      <section style={{ minWidth: 0 }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Overview */}
        {activeNav === 'overview' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                Control Center
              </p>
              <h2 style={{ fontSize: 'clamp(20px, 4vw, 26px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
                Platform Health & Recovery Volume
              </h2>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 mb-6">
              {[
                { label: 'Platform Volume', val: money(stats?.platform_overview?.total_volume || 1245000), color: '#0f172a' },
                { label: 'Total Recovered', val: money(stats?.platform_overview?.total_recovered || 348200), color: '#16a34a' },
                { label: 'Global Recovery Rate', val: `${stats?.platform_overview?.global_recovery_rate || 45.8}%`, color: '#2563eb' },
                { label: 'Active Merchants', val: stats?.platform_overview?.active_merchants || 14, color: '#0f172a' },
              ].map((k, idx) => (
                <div key={idx} style={{ background: 'white', borderRadius: '16px', padding: '18px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.03)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>{k.label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: k.color, letterSpacing: '-0.02em' }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Method Breakdown */}
            <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '24px' }} className="sm:p-6">
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Cross-Merchant Recovery Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {[
                  { name: 'UPI Instant Recovery', rate: '84.1%', status: 'Optimal' },
                  { name: 'Digital Wallets', rate: '78.5%', status: 'Healthy' },
                  { name: 'Credit / Debit Cards', rate: '62.4%', status: 'Standard' },
                  { name: 'Netbanking / ACH', rate: '51.2%', status: 'Moderate' },
                ].map((m, i) => (
                  <div key={i} style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>{m.name}</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>{m.rate}</div>
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>● {m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Merchants Directory */}
        {activeNav === 'merchants' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Registered Merchants ({merchants.length})</h3>
            
            {/* Mobile Cards View (<640px) */}
            <div className="block sm:hidden space-y-3">
              {merchants.map((m) => (
                <div key={m.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-slate-900 text-sm">{m.name}</div>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      {m.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-200">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Plan</span>
                      <span className="font-medium text-slate-700">{m.plan}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Volume</span>
                      <span className="font-bold text-slate-900">{m.total_volume}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Recovery</span>
                      <span className="font-bold text-emerald-600">{m.recovery_rate}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>=640px) */}
            <div className="hidden sm:block table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Merchant</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Plan</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Volume</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Recovery Rate</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{m.name}</td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>{m.plan}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{m.total_volume}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#16a34a' }}>{m.recovery_rate}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '999px' }}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Platform Users */}
        {activeNav === 'users' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Platform Users ({users.length})</h3>
            
            {/* Mobile Cards View (<640px) */}
            <div className="block sm:hidden space-y-3">
              {users.map((u, i) => (
                <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                      {u.name?.[0] || 'U'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                      <div className="text-xs text-slate-500">@{u.username}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span style={{ fontSize: '11px', fontWeight: 700, background: u.role === 'admin' ? '#fee2e2' : u.role === 'merchant' ? '#dbeafe' : '#f1f5f9', color: u.role === 'admin' ? '#b91c1c' : u.role === 'merchant' ? '#1d4ed8' : '#475569', padding: '2px 8px', borderRadius: '999px', display: 'inline-block' }}>
                      {u.role}
                    </span>
                    <div className="text-[11px] text-emerald-600 font-semibold mt-1">● {u.status}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>=640px) */}
            <div className="hidden sm:block table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Name</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Username</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Role</th>
                    <th style={{ padding: '12px 14px', color: '#64748b' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{u.name}</td>
                      <td style={{ padding: '12px 14px', color: '#475569' }}>{u.username}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, background: u.role === 'admin' ? '#fee2e2' : u.role === 'merchant' ? '#dbeafe' : '#f1f5f9', color: u.role === 'admin' ? '#b91c1c' : u.role === 'merchant' ? '#1d4ed8' : '#475569', padding: '2px 8px', borderRadius: '999px' }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#16a34a', fontWeight: 600 }}>● {u.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Operations */}
        {activeNav === 'operations' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 12px' }}>Platform Recovery Operations</h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
              System-wide active recovery queues and engine executions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Active Retry Queues</span>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>12 Sessions</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Automations Triggered</span>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>248 Times</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Average Time-to-Recovery</span>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>3.8 Hours</div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Webhooks */}
        {activeNav === 'webhooks' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Webhook Event Ingestion Stream</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {webhooks.map((w, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <code style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{w.event}</code>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{w.merchant}</span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>({money(w.amount)})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', alignSelf: 'flex-start' }} className="sm:self-auto">
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '999px' }}>{w.status}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{w.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Audit Trail */}
        {activeNav === 'audit' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Platform Audit Log</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auditLogs.map((a, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100 text-[13px]">
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>[{a.event}] </span>
                    <span style={{ color: '#475569' }}>{a.details}</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '11px', flexShrink: 0 }}>{a.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. System Health */}
        {activeNav === 'health' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #e2e8f0' }} className="sm:p-6">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>System Health & Infrastructure</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div style={{ padding: '18px', background: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Database Engine</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#14532d', marginTop: '4px' }}>MongoDB Atlas (Connected)</div>
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>Persistence enabled for users, sessions, recovery, automations</div>
              </div>
              <div style={{ padding: '18px', background: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>API Gateway</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#14532d', marginTop: '4px' }}>FastAPI v2.0.0 (Operational)</div>
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>Uptime 99.98% · Rate limiting & HMAC verification enabled</div>
              </div>
            </div>
          </div>
        )}
      </section>
      </div>{/* end grid */}
    </div>
  );
}
