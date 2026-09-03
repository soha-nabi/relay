import React, { ChangeEvent, useEffect, useState } from 'react';
import { Upload, LogOut, Shield, Store, User as UserIcon, RefreshCw, AlertCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { setOnForbidden } from './lib/api';
import LoginView from './components/LoginView';
import AdminShell from './components/AdminShell';
import MerchantShell from './components/MerchantShell';
import UserShell from './components/UserShell';
import RelayVoiceAgent from './components/RelayVoiceAgent';

import { getDashboard, getStatusStats, uploadCsv } from './lib/api';
import type { DashboardData, StatusStats } from './types';

function MainAppShell() {
  const { user, logout, isAuthenticated, loading: authLoading } = useAuth();
  const [d, setD] = useState<DashboardData>();
  const [s, setS] = useState<StatusStats>();
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);

  const loadData = async () => {
    if (!user || user.role === 'user') return;
    setLoadingData(true);
    try {
      const [dash, stats] = await Promise.all([getDashboard(), getStatusStats()]);
      setD(dash);
      setS(stats);
    } catch (e) {
      console.warn('Dashboard load note:', e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    setOnForbidden((detail: string) => {
      setForbiddenError(detail);
      setTimeout(() => setForbiddenError(null), 5000);
    });
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role !== 'user') {
      loadData();
    }
  }, [isAuthenticated, user?.role]);

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const res = await uploadCsv(f);
      setUploadStatus(`Loaded ${res.rows_loaded} transactions.`);
      await loadData();
      setTimeout(() => setUploadStatus(null), 4000);
    } catch (err: any) {
      setUploadStatus(err.response?.data?.detail || 'CSV upload failed.');
    }
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Loading Relay…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  const role = (user.role || 'user').toLowerCase();

  const getRoleBadge = () => {
    if (role === 'admin') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Shield size={12} /> OPERATOR ADMIN
        </span>
      );
    }
    if (role === 'merchant') {
      return (
        <span style={{ fontSize: '11px', fontWeight: 800, background: '#dbeafe', color: '#1d4ed8', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Store size={12} /> MERCHANT CONSOLE
        </span>
      );
    }
    return (
      <span style={{ fontSize: '11px', fontWeight: 800, background: '#f1f5f9', color: '#475569', padding: '3px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <UserIcon size={12} /> CUSTOMER PORTAL
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0f172a' }}>
      {/* ── Role Topbar ─────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }} className="sm:px-6">
          <div style={{ display: 'flex', minHeight: '56px', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', padding: '6px 0' }}>
            {/* Brand + Active Role */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="sm:gap-4">
              <div style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.04em', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '6px', background: '#0f172a', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
                  R
                </span>
                relay
              </div>
              <div className="scale-90 sm:scale-100 origin-left">
                {getRoleBadge()}
              </div>
            </div>

            {/* Actions: CSV upload (Merchant/Admin only) & User Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="sm:gap-4">
              {uploadStatus && (
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '8px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {uploadStatus}
                </span>
              )}

              {/* Only Merchant & Admin see CSV upload */}
              {(role === 'merchant' || role === 'admin') && (
                <label
                  id="header-upload-csv"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '5px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} /> <span className="hidden xs:inline sm:inline">Upload</span>
                  <input className="hidden" type="file" accept=".csv" onChange={onUpload} style={{ display: 'none' }} />
                </label>
              )}

              {/* Profile & Sign Out */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #e2e8f0', paddingLeft: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#475569', flexShrink: 0 }}>
                    {user.name?.[0] || 'U'}
                  </div>
                  <div className="hidden sm:block">
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', lineHeight: 1.1, maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.username}</div>
                    <div style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{user.role}</div>
                  </div>
                </div>

                <button
                  id="btn-signout"
                  onClick={logout}
                  title="Sign out"
                  style={{ background: 'transparent', border: 'none', padding: '5px', borderRadius: '6px', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Forbidden 403 Alert */}
      {forbiddenError && (
        <div style={{ maxWidth: '1400px', margin: '12px auto 0', padding: '0 16px' }} className="sm:px-6">
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '10px 14px', color: '#b91c1c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{forbiddenError}</span>
          </div>
        </div>
      )}

      {/* ── Main Role Shell ─────────────────────────────────────────────── */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '12px 12px 64px' }} className="sm:p-5 md:p-6">
        {role === 'admin' && <AdminShell />}
        {role === 'merchant' && <MerchantShell dashboard={d} onRefreshData={loadData} />}
        {role === 'user' && <UserShell />}
      </main>

      {/* ── Floating Voice Agent Assistant ──────────────────────────────── */}
      <RelayVoiceAgent
        variant="floating"
        customerContext={{
          customer_id: user?.username || 'cust_active',
          customer_name: user?.name || user?.username || 'Customer',
          amount: 1500,
        }}
      />

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppShell />
    </AuthProvider>
  );
}
