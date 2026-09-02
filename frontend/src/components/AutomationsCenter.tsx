import React, { useEffect, useState } from 'react';
import { Plus, Play, Pause, Copy, Trash2, Zap, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import {
  listAutomations,
  createAutomation,
  pauseAutomation,
  resumeAutomation,
  duplicateAutomation,
  deleteAutomation,
  previewAutomation,
  triggerAutomation,
} from '../lib/api';
import type { Automation, AutomationMeta } from '../types';

export default function AutomationsCenter() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [meta, setMeta] = useState<AutomationMeta | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New automation modal/form state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [trigger, setTrigger] = useState<string>('payment_failed');
  const [actionType, setActionType] = useState<string>('smart_retry');
  const [previewSteps, setPreviewSteps] = useState<string[]>([]);

  // Trigger test state
  const [triggerCustId, setTriggerCustId] = useState<string>('CUST000052');
  const [triggerResult, setTriggerResult] = useState<any | null>(null);

  const fetchAutomations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAutomations();
      setAutomations(res.automations || []);
      setMeta(res.meta);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load automations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handlePause = async (id: string) => {
    try {
      await pauseAutomation(id);
      setSuccessMsg('Automation paused.');
      fetchAutomations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to pause automation.');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeAutomation(id);
      setSuccessMsg('Automation activated.');
      fetchAutomations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resume automation.');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateAutomation(id);
      setSuccessMsg('Automation duplicated.');
      fetchAutomations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to duplicate automation.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this automation?')) return;
    try {
      await deleteAutomation(id);
      setSuccessMsg('Automation deleted.');
      fetchAutomations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete automation.');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createAutomation({
        name: name.trim(),
        trigger,
        conditions: [],
        actions: [{ type: actionType }],
        stop_rules: ['payment_succeeds', 'max_attempts_reached'],
      });
      setShowModal(false);
      setName('');
      setSuccessMsg('New recovery automation created!');
      fetchAutomations();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create automation.');
    }
  };

  const handlePreview = async () => {
    try {
      const res = await previewAutomation({
        trigger,
        conditions: [],
        actions: [{ type: actionType }],
        stop_rules: ['payment_succeeds', 'max_attempts_reached'],
      });
      setPreviewSteps(res.steps || []);
    } catch {
      // Best-effort
    }
  };

  const handleTestTrigger = async () => {
    setLoading(true);
    setTriggerResult(null);
    try {
      const res = await triggerAutomation(triggerCustId.trim(), 'payment_failed');
      setTriggerResult(res);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Test trigger failed.');
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
            No-Code Workflow Engine
          </p>
          <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
            Recovery Automations
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            Define WHEN → IF → THEN rules that run instantly when payments fail and stop when paid.
          </p>
        </div>

        <button
          onClick={() => {
            setShowModal(true);
            handlePreview();
          }}
          style={{
            background: '#0f172a',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            padding: '10px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            alignSelf: 'flex-start',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={16} /> Create Automation
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', color: '#b91c1c', fontSize: '13px', marginBottom: '20px' }}>
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px', color: '#166534', fontSize: '13px', marginBottom: '20px' }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Automations Table / List */}
      {loading && automations.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8' }}>Loading automations…</div>
      ) : automations.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <Zap size={28} style={{ color: '#94a3b8', margin: '0 auto 10px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: '0 0 4px' }}>No active automations</h3>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>Create an automation rule to auto-recover incoming failed payments.</p>
          <button
            onClick={() => setShowModal(true)}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Create first rule
          </button>
        </div>
      ) : (
        <div>
          {/* Mobile Cards View (<640px) */}
          <div className="block sm:hidden space-y-3">
            {automations.map((auto) => (
              <div key={auto.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{auto.name}</h4>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Action: <strong className="text-slate-700">{auto.actions?.[0]?.type || 'Smart Retry'}</strong>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      auto.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {auto.status}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-500">
                    Trigger: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-[11px] font-semibold">{auto.trigger}</code>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {auto.status === 'active' ? (
                      <button
                        title="Pause"
                        onClick={() => handlePause(auto.id)}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-amber-600 hover:bg-amber-50"
                      >
                        <Pause size={13} />
                      </button>
                    ) : (
                      <button
                        title="Resume"
                        onClick={() => handleResume(auto.id)}
                        className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-emerald-600 hover:bg-emerald-50"
                      >
                        <Play size={13} />
                      </button>
                    )}
                    <button
                      title="Duplicate"
                      onClick={() => handleDuplicate(auto.id)}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      title="Delete"
                      onClick={() => handleDelete(auto.id)}
                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View (>=640px) */}
          <div className="hidden sm:block border border-slate-200 rounded-2xl overflow-hidden table-responsive">
            <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b' }}>Name</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b' }}>Trigger</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b' }}>Action</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b' }}>Executed</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#64748b', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((auto) => (
                  <tr key={auto.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0f172a' }}>{auto.name}</td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>
                      <code style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '12px' }}>{auto.trigger}</code>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>{auto.actions?.[0]?.type || 'Smart Retry'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: auto.status === 'active' ? '#dcfce7' : '#f1f5f9',
                          color: auto.status === 'active' ? '#166534' : '#64748b',
                        }}
                      >
                        {auto.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#64748b', fontWeight: 600 }}>{auto.execution_count ?? auto.times_triggered ?? 0} times</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {auto.status === 'active' ? (
                          <button
                            title="Pause"
                            onClick={() => handlePause(auto.id)}
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
                          >
                            <Pause size={13} style={{ color: '#d97706' }} />
                          </button>
                        ) : (
                          <button
                            title="Resume"
                            onClick={() => handleResume(auto.id)}
                            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
                          >
                            <Play size={13} style={{ color: '#16a34a' }} />
                          </button>
                        )}
                        <button
                          title="Duplicate"
                          onClick={() => handleDuplicate(auto.id)}
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
                        >
                          <Copy size={13} style={{ color: '#475569' }} />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => handleDelete(auto.id)}
                          style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} style={{ color: '#ef4444' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Test Trigger Section ─────────────────────────────────────────── */}
      <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid #f1f5f9' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
          Interactive Automation Simulator
        </p>
        <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
          Test Trigger an Active Workflow
        </h4>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={triggerCustId}
            onChange={(e) => setTriggerCustId(e.target.value)}
            placeholder="CUST000052"
            style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            className="flex-1 min-w-[180px] max-w-xs"
          />
          <button
            onClick={handleTestTrigger}
            disabled={loading}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Trigger Event
          </button>
        </div>

        {triggerResult && (
          <div style={{ marginTop: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: triggerResult.matched ? '#166534' : '#64748b' }}>
              {triggerResult.matched ? '✓ Automation matched and session created!' : 'No matching automation found.'}
            </span>
            {triggerResult.session_id && <div style={{ color: '#475569', marginTop: '4px' }}>Session ID: {triggerResult.session_id}</div>}
          </div>
        )}
      </div>

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }} className="sm:p-8">
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Create Recovery Automation</h3>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Rule Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="High-Value Soft Decline Auto-Retry"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Trigger Event</label>
                <select
                  value={trigger}
                  onChange={(e) => {
                    setTrigger(e.target.value);
                    handlePreview();
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="payment_failed">Payment Failed (All types)</option>
                  <option value="payment_failed_soft">Payment Failed (Soft decline only)</option>
                  <option value="payment_failed_hard">Payment Failed (Hard decline)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Action</label>
                <select
                  value={actionType}
                  onChange={(e) => {
                    setActionType(e.target.value);
                    handlePreview();
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }}
                >
                  <option value="smart_retry">Smart Retry (Auto-scheduled AI window)</option>
                  <option value="custom_retry_schedule">Custom Retry Schedule</option>
                  <option value="offer_alternative_payment">Generate Customer Payment Link</option>
                  <option value="escalate">High Priority Recovery Outreach</option>
                </select>
              </div>

              {/* Plain-English Preview */}
              {previewSteps.length > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '12px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a', display: 'block', marginBottom: '6px' }}>Workflow Logic:</span>
                  {previewSteps.map((s, idx) => (
                    <div key={idx} style={{ marginBottom: '2px' }}>{s}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Save Automation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
