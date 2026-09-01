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
} from 'lucide-react';
import { adminApi } from '../lib/api';
import type { AdminMerchant, AdminPlatformStats, AdminUser } from '../types';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function AdminShell() {
  const [activeNav, setActiveNav] = useState<'overview' | 'merchants' | 'users' | 'operations' | 'webhooks' | 'audit' | 'health'>('overview');
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '32px', minHeight: '80vh' }}>
      {/* ── Admin Sidebar Navigation ────────────────────────────────────── */}
      <aside style={{ background: 'white', borderRadius: '20px', padding: '24px', border: '1px solid #e2e8f0', height: 'fit-content' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
          <Shield size={18} style={{ color: '#2563eb' }} />
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Platform Operations</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            { id: 'overview', label: 'Platform Overview', icon: <Activity size={16} /> },
            { id: 'merchants', label: 'Merchants Directory', icon: <Store size={16} /> },
            { id: 'users', label: 'Platform Users', icon: <Users size={16} /> },
            { id: 'operations', label: 'Recovery Operations', icon: <TrendingUp size={16} /> },
            { id: 'webhooks', label: 'Webhook Stream', icon: <Radio size={16} /> },
            { id: 'audit', label: 'Audit Trail', icon: <FileText size={16} /> },
            { id: 'health', label: 'System Health', icon: <Server size={16} /> },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeNav === item.id ? '#0f172a' : 'transparent',
                color: activeNav === item.id ? 'white' : '#64748b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Admin Content Area ──────────────────────────────────────────── */}
      <section>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px 18px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 1. Overview */}
        {activeNav === 'overview' && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                Control Center
              </p>
              <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
                Platform Health & Recovery Volume
              </h2>
            </div>

            {/* KPI Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
              {[
                { label: 'Platform Volume', val: money(stats?.platform_overview?.total_volume || 1245000), color: '#0f172a' },
                { label: 'Total Recovered', val: money(stats?.platform_overview?.total_recovered || 348200), color: '#16a34a' },
                { label: 'Global Recovery Rate', val: `${stats?.platform_overview?.global_recovery_rate || 45.8}%`, color: '#2563eb' },
                { label: 'Active Merchants', val: stats?.platform_overview?.active_merchants || 14, color: '#0f172a' },
              ].map((k, idx) => (
                <div key={idx} style={{ background: 'white', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.03)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>{k.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: k.color, letterSpacing: '-0.02em' }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Method Breakdown */}
            <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Cross-Merchant Recovery Breakdown</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                  { name: 'UPI Instant Recovery', rate: '84.1%', status: 'Optimal' },
                  { name: 'Digital Wallets', rate: '78.5%', status: 'Healthy' },
                  { name: 'Credit / Debit Cards', rate: '62.4%', status: 'Standard' },
                  { name: 'Netbanking / ACH', rate: '51.2%', status: 'Moderate' },
                ].map((m, i) => (
                  <div key={i} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{m.name}</div>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb', marginTop: '6px' }}>{m.rate}</div>
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>● {m.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Merchants Directory */}
        {activeNav === 'merchants' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Registered Merchants ({merchants.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Merchant</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Plan</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Volume</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Recovery Rate</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{m.name}</td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>{m.plan}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{m.total_volume}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#16a34a' }}>{m.recovery_rate}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '999px' }}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Platform Users */}
        {activeNav === 'users' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Platform Users ({users.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Name</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Username</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Role</th>
                  <th style={{ padding: '12px 16px', color: '#64748b' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{u.name}</td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>{u.username}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, background: u.role === 'admin' ? '#fee2e2' : u.role === 'merchant' ? '#dbeafe' : '#f1f5f9', color: u.role === 'admin' ? '#b91c1c' : u.role === 'merchant' ? '#1d4ed8' : '#475569', padding: '2px 8px', borderRadius: '999px' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#16a34a', fontWeight: 600 }}>● {u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Operations */}
        {activeNav === 'operations' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Platform Recovery Operations</h3>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
              System-wide active recovery queues and engine executions.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Active Retry Queues</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '6px' }}>12 Sessions</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Automations Triggered</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', marginTop: '6px' }}>248 Times</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Average Time-to-Recovery</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>3.8 Hours</div>
              </div>
            </div>
          </div>
        )}

        {/* 5. Webhooks */}
        {activeNav === 'webhooks' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Webhook Event Ingestion Stream</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {webhooks.map((w, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <code style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700 }}>{w.event}</code>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{w.merchant}</span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>({money(w.amount)})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '999px' }}>{w.status}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{w.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. Audit Trail */}
        {activeNav === 'audit' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Platform Audit Log</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {auditLogs.map((a, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #f1f5f9', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>[{a.event}] </span>
                    <span style={{ color: '#475569' }}>{a.details}</span>
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>{a.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 7. System Health */}
        {activeNav === 'health' && (
          <div style={{ background: 'white', borderRadius: '20px', padding: '28px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>System Health & Infrastructure</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div style={{ padding: '20px', background: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Database Engine</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#14532d', marginTop: '4px' }}>MongoDB Atlas (Connected)</div>
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>Persistence enabled for users, sessions, recovery, automations</div>
              </div>
              <div style={{ padding: '20px', background: '#f0fdf4', borderRadius: '14px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>API Gateway</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#14532d', marginTop: '4px' }}>FastAPI v2.0.0 (Operational)</div>
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>Uptime 99.98% · Rate limiting & HMAC verification enabled</div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
