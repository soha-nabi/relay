import React, { useState } from 'react';
import { Search, Sparkles, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight, Clock, ShieldAlert } from 'lucide-react';
import {
  getCustomer,
  getRecommendation,
  runSimulation,
  startRecovery,
  retryRecoveryAction,
  completeRecovery,
  validateSchedule,
} from '../lib/api';
import type { CustomerProfile, Recommendation, RecoverySession, Simulation } from '../types';

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

interface Props {
  onSessionCreated?: (session: RecoverySession) => void;
  onOpenCustomerPayment?: (sessionId: string) => void;
}

export default function RecoveryWorkflow({ onSessionCreated, onOpenCustomerPayment }: Props) {
  // Step state (1 to 5)
  const [step, setStep] = useState<number>(1);
  const [customerId, setCustomerId] = useState<string>('CUST000052');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('Smart Retry');
  const [customSchedule, setCustomSchedule] = useState<number[]>([0, 24, 72]);
  const [session, setSession] = useState<RecoverySession | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Search Customer
  const handleSearchCustomer = async (cidToSearch?: string) => {
    const cid = (cidToSearch || customerId).trim();
    if (!cid) return;
    setLoading(true);
    setError(null);
    try {
      const p = await getCustomer(cid);
      setProfile(p);
      setCustomerId(cid);
      setStep(2);

      // Pre-fetch recommendation
      const rec = await getRecommendation(cid);
      setRecommendation(rec);
      if (rec.recommended_strategy) {
        setSelectedStrategy(rec.recommended_strategy);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || `Customer '${cid}' not found.`);
    } finally {
      setLoading(false);
    }
  };

  // 2. Run Strategy Simulation
  const handleSimulate = async (strat: string) => {
    if (!profile) return;
    setSelectedStrategy(strat);
    setLoading(true);
    try {
      const sim = await runSimulation(profile.customer_id, strat);
      setSimulation(sim);
    } catch {
      // Best-effort
    } finally {
      setLoading(false);
    }
  };

  // 3. Start Recovery
  const handleStartRecovery = async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);

    const expectedRec = simulation?.expected_recovered_revenue || recommendation?.expected_recovery || profile.last_failed_amount || 0;
    const schedule = selectedStrategy === 'Custom Schedule' ? customSchedule : undefined;

    try {
      if (selectedStrategy === 'Custom Schedule' && schedule) {
        await validateSchedule(profile.customer_id, schedule);
      }

      const sess = await startRecovery(profile.customer_id, selectedStrategy, expectedRec, schedule);
      setSession(sess);
      onSessionCreated?.(sess);
      setStep(4);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start recovery session.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Retry Payment
  const handleRetryAction = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const updated = await retryRecoveryAction(session.session_id);
      setSession(updated);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Retry failed.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Complete Recovery
  const handleCompleteSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const updated = await completeRecovery(session.session_id);
      setSession(updated);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to mark as completed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'white', borderRadius: '24px', padding: '20px', border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(15,23,42,0.04)' }} className="sm:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
            Closed-Loop Recovery Engine
          </p>
          <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            Interactive Recovery Workflow
          </h2>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 max-w-full">
          {[
            { num: 1, label: 'Customer' },
            { num: 2, label: 'Diagnose' },
            { num: 3, label: 'Decide' },
            { num: 4, label: 'Execute' },
          ].map((s) => (
            <React.Fragment key={s.num}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  background: step >= s.num ? '#0f172a' : '#f1f5f9',
                  color: step >= s.num ? 'white' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <span>{s.num}.</span>
                <span>{s.label}</span>
              </div>
              {s.num < 4 && <span style={{ color: '#cbd5e1', fontSize: '11px' }}>→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── STEP 1: Find Customer ────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
            Enter a customer ID to diagnose their payment failure history and recommend the optimal recovery route.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchCustomer();
            }}
            className="flex flex-col sm:flex-row gap-3 max-w-lg"
          >
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="CUST000052"
                required
                style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 20px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {loading ? 'Searching…' : 'Diagnose'}
            </button>
          </form>

          {/* Quick preset buttons */}
          <div className="flex items-center gap-2 flex-wrap mt-5">
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Quick test:</span>
            {[
              { id: 'CUST000052', label: 'CUST000052 (High Value)' },
              { id: 'CUST001467', label: 'CUST001467 (Healthy)' },
              { id: 'CUST001887', label: 'CUST001887 (Unrecoverable)' },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSearchCustomer(preset.id)}
                style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Diagnosis ────────────────────────────────────────────── */}
      {step === 2 && profile && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Customer ID</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginTop: '2px', wordBreak: 'break-all' }}>{profile.customer_id}</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Failures</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: profile.failure_count > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                {profile.failure_count}
              </div>
            </div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Recovery Rate</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#2563eb', marginTop: '2px' }}>{profile.recovery_rate}%</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '14px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Risk Score</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: profile.risk_score > 60 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                {profile.risk_score}/100
              </div>
            </div>
          </div>

          {/* Failure reason if available */}
          {profile.last_failure_reason && (
            <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#92400e' }}>Last failure reason: </span>
                <span style={{ fontSize: '12px', color: '#78350f' }}>{profile.last_failure_reason} ({money(profile.last_failed_amount || 0)})</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStep(1)}
              style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
            >
              Back
            </button>
            <button
              onClick={() => {
                setStep(3);
                handleSimulate(selectedStrategy);
              }}
              style={{ background: '#0f172a', border: 'none', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              Configure Strategy <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Decide Strategy ──────────────────────────────────────── */}
      {step === 3 && profile && (
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>Select Recovery Strategy</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {[
              { id: 'Smart Retry', label: 'Smart Retry', desc: 'AI-scheduled retry based on historical success curves' },
              { id: 'Custom Schedule', label: 'Custom Schedule', desc: 'Define precise retry intervals (0h, 24h, 72h)' },
              { id: 'Offer Alternative Payment Method', label: 'Customer Payment Link', desc: 'Send direct customer recovery link with preferred methods' },
            ].map((strat) => (
              <div
                key={strat.id}
                onClick={() => handleSimulate(strat.id)}
                style={{
                  border: `2px solid ${selectedStrategy === strat.id ? '#2563eb' : '#e2e8f0'}`,
                  background: selectedStrategy === strat.id ? 'rgba(37,99,235,0.03)' : 'white',
                  borderRadius: '16px',
                  padding: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{strat.label}</span>
                  {selectedStrategy === strat.id && <CheckCircle2 size={16} style={{ color: '#2563eb', flexShrink: 0 }} />}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.45 }}>{strat.desc}</p>
              </div>
            ))}
          </div>

          {/* Simulation Output */}
          {simulation && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Simulation Result</span>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>{simulation.summary}</div>
                </div>
                <div className="sm:text-right">
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Expected Recovered</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>{money(simulation.expected_recovered_revenue)}</div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStep(2)}
              style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
            >
              Back
            </button>
            <button
              onClick={handleStartRecovery}
              disabled={loading}
              style={{ background: '#2563eb', border: 'none', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {loading ? 'Starting…' : 'Start Recovery Workflow'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Execution & In-Progress Session ───────────────────────── */}
      {step === 4 && session && (
        <div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '16px', padding: '18px', marginBottom: '20px' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#166534' }}>Recovery Session Initialized</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '999px', alignSelf: 'flex-start' }} className="sm:self-auto">
                Status: {session.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <span style={{ fontSize: '11px', color: '#15803d' }}>Session ID</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>{session.session_id.slice(0, 16)}…</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#15803d' }}>Strategy</span>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>{session.strategy}</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#15803d' }}>Expected Recovery</span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>{money(session.expected_recovery || session.amount || 0)}</div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2.5 flex-wrap">
            <button
              onClick={handleRetryAction}
              disabled={loading || session.status === 'recovered'}
              style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} /> Execute Retry Now
            </button>

            <button
              onClick={() => onOpenCustomerPayment?.(session.session_id)}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Open Customer Payment View
            </button>

            <button
              onClick={handleCompleteSession}
              disabled={loading || session.status === 'recovered'}
              style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
            >
              Mark Recovered
            </button>

            <button
              onClick={() => {
                setStep(1);
                setSession(null);
                setProfile(null);
              }}
              style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
            >
              New Recovery
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
