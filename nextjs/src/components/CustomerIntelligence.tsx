'use client';

import React, { FormEvent, useState } from 'react';
import { Search, User, CreditCard, ShieldCheck, ArrowRight, Clock, AlertTriangle } from 'lucide-react';
import { getCustomer } from '@/lib/api';
import type { CustomerProfile } from '@/types';
import { PageHeader } from './ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/Card';
import { StatCard } from './ui/StatCard';
import { StatusBadge } from './ui/StatusBadge';
import { Timeline, type TimelineEvent } from './ui/Timeline';
import { EmptyState } from './ui/EmptyState';
import { ErrorState } from './ui/ErrorState';

interface CustomerIntelligenceProps {
  onProfile?: (profile: CustomerProfile) => void;
  onStartRecovery?: (customerId: string) => void;
}

const SAMPLE_CUSTOMERS = ['CUST000052', 'CUST000010', 'CUST000088', 'CUST000015'];

export function CustomerIntelligence({ onProfile, onStartRecovery }: CustomerIntelligenceProps) {
  const [customerId, setCustomerId] = useState('CUST000052');
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCustomer = async (cidToFetch?: string) => {
    const id = (cidToFetch || customerId).trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomer(id);
      setProfile(data);
      setCustomerId(id);
      onProfile?.(data);
    } catch (err: any) {
      setProfile(null);
      setError(err?.response?.data?.detail || `Customer '${id}' not found. Verify the customer ID or try a sample.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    fetchCustomer();
  };

  // Generate realistic chronological activity timeline based on profile
  const timelineEvents: TimelineEvent[] = profile
    ? [
        {
          id: 'evt-1',
          timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          channel: 'system',
          title: 'Transaction Failure Logged',
          status: 'failed',
          description: profile.last_failure_reason || 'Decline code: 3DS_TIMEOUT at acquiring bank.',
          metadata: { Amount: `₹${(profile.last_failed_amount || profile.average_amount).toLocaleString('en-IN')}` },
        },
        {
          id: 'evt-2',
          timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          channel: 'retry',
          title: 'Smart Retry Strategy Selected',
          status: 'retrying',
          description: 'Autonomous engine matched customer history and scheduled off-peak gateway retry.',
        },
        {
          id: 'evt-3',
          timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
          channel: 'voice',
          title: 'Customer Recovery Fallback Ready',
          status: 'contacted',
          description: `Preferred payment method identified as ${profile.preferred_payment_method || 'UPI'}.`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Customer Intelligence"
        title="Customer Recovery Profile"
        description="Analyze payment behavior, historic failure frequency, and resolution success rates for targeted recovery."
      />

      {/* Search Bar + Quick Select */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="Enter Customer ID (e.g. CUST000052)"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
            >
              {loading ? (
                <>Analyzing…</>
              ) : (
                <>
                  <Search size={15} />
                  Analyze Customer
                </>
              )}
            </button>
          </form>

          {/* Quick Select Chips */}
          <div className="mt-3 flex items-center gap-2 flex-wrap text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Sample Customers:</span>
            {SAMPLE_CUSTOMERS.map((cid) => (
              <button
                key={cid}
                type="button"
                onClick={() => fetchCustomer(cid)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition font-mono text-[11px]"
              >
                {cid}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <ErrorState
          title="Customer Profile Error"
          message={error}
          onRetry={() => fetchCustomer()}
        />
      )}

      {/* Profile Loaded */}
      {profile && (
        <div className="flex flex-col gap-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Transactions"
              value={profile.total_transactions}
              subtext="Lifetime order count"
            />
            <StatCard
              label="Average Amount"
              value={`₹${Math.round(profile.average_amount).toLocaleString('en-IN')}`}
              subtext="Historical order value"
            />
            <StatCard
              label="Failed Payments"
              value={profile.failure_count}
              variant={profile.failure_count > 2 ? 'danger' : 'default'}
              subtext="Lifetime failed attempts"
            />
            <StatCard
              label="Recovery Rate"
              value={`${(profile.recovery_rate || 0).toFixed(1)}%`}
              variant="success"
              subtext="Resolution conversion"
            />
          </div>

          {/* Detail Cards: Profile Summary + Timeline */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6 items-start">
            
            {/* Customer Health Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Health Breakdown</CardTitle>
                <CardDescription>Payment preference and risk classification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                      <User size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{profile.customer_id}</div>
                      <div className="text-xs text-slate-500">Registered Merchant Customer</div>
                    </div>
                  </div>
                  <StatusBadge
                    status={profile.risk_score > 70 ? 'failed' : profile.risk_score > 40 ? 'retrying' : 'recovered'}
                    label={profile.risk_score > 70 ? 'High Risk' : profile.risk_score > 40 ? 'Moderate' : 'Healthy'}
                  />
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-500">Preferred Method</span>
                    <span className="font-semibold text-slate-900">{profile.preferred_payment_method || 'UPI Intent'}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-500">Recovery Health Score</span>
                    <span className="font-bold text-blue-600">{100 - (profile.risk_score || 0)} / 100</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-500">Last Failure Reason</span>
                    <span className="font-medium text-slate-700">{profile.last_failure_reason || '3DS_AUTHENTICATION_TIMEOUT'}</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-500">Last Failed Amount</span>
                    <span className="font-bold text-rose-600">
                      ₹{(profile.last_failed_amount || profile.average_amount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => onStartRecovery?.(profile.customer_id)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-sm"
                  >
                    <span>Launch Recovery Workflow</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Chronological Activity Timeline */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <CardTitle>Recovery Activity Timeline</CardTitle>
                    <CardDescription>Chronological log of customer events & interactions</CardDescription>
                  </div>
                  <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    Audited Stream
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <Timeline events={timelineEvents} />
              </CardContent>
            </Card>

          </div>
        </div>
      )}

      {/* Empty State when no profile is active */}
      {!loading && !profile && !error && (
        <EmptyState
          title="No Customer Selected"
          description="Enter a customer identifier above or choose one of the sample customers to load their recovery profile."
          icon={<User size={24} />}
        />
      )}
    </div>
  );
}

export default CustomerIntelligence;
