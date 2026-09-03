import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts';
import type { DashboardData, StatusStats } from '../types';
import { getRawData } from '../lib/api';

type Row = { status?: string; payment_status?: string; failure_reason?: string; amount?: number; recovery_amount?: number };
const colors = ['#2563EB', '#10B981', '#EF4444', '#F59E0B'];

export function Analytics({ dashboard, stats, rows: initialRows = [] }: { dashboard: DashboardData; stats: StatusStats; rows?: Row[] }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>(initialRows || []);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    // If parent didn't pass rows, fetch them locally and log responses
    if ((!initialRows || initialRows.length === 0) && rows.length === 0) {
      setLoading(true);
      getRawData()
        .then(data => {
          console.debug('Analytics: fetched raw rows', data?.length);
          setRows(Array.isArray(data) ? data : []);
        })
        .catch(e => {
          console.warn('Analytics: failed to fetch raw rows', e);
          setError('Failed to load raw data');
        })
        .finally(() => setLoading(false));
    } else {
      // log incoming data
      console.debug('Analytics: received rows prop', initialRows?.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // use the rows prop if provided, otherwise internal rows
  const effectiveRows = (initialRows && initialRows.length > 0) ? initialRows : rows;

  // Prepare status pie data
  const status = Object.entries(stats || {}).map(([name, value]) => ({ name, ...value }));

  // Build failure reasons counts safely
  const reasons = useMemo(() => {
    try {
      const failedRows = (effectiveRows || []).filter(x => ((x.status || x.payment_status) || '').toLowerCase() === 'failed');
      const counts: Record<string, number> = {};
      failedRows.forEach(r => { const k = (r.failure_reason || 'Unspecified') || 'Unspecified'; counts[k] = (counts[k] || 0) + 1 });
      const arr = Object.entries(counts).map(([reason, count]) => ({ reason, count }));
      // sort descending
      arr.sort((a, b) => b.count - a.count);
      // add percent label for direct BarLabel usage
      const total = arr.reduce((s, r) => s + (r.count || 0), 0) || 0;
      return arr.map(r => ({ ...r, percent: total ? (r.count / total) * 100 : 0, percentLabel: total ? `${((r.count / total) * 100).toFixed(0)}%` : '0%' }));
    } catch (e) {
      console.warn('Analytics: error preparing reasons', e);
      return [] as any[];
    }
  }, [effectiveRows]);

  // total failed for percentages
  const totalFailed = reasons.reduce((s: number, r: any) => s + (r.count || 0), 0);
  const [showAll, setShowAll] = useState(false);

  // If dataset invalid, warn
  if (!Array.isArray(effectiveRows)) {
    console.warn('Analytics: invalid rows dataset', effectiveRows);
  }

  // Fallback insights when failure_reason missing
  const hasFailureReasonData = reasons.length > 0 && totalFailed > 0;
  const fallbackInsights = useMemo(() => {
    // derive from dashboard metrics if available
    if (!dashboard) return [] as any[];
    const failedCount = dashboard.primary_metrics?.total_failed_payments || 0;
    const recovered = dashboard.recovery_metrics?.total_recovered || 0;
    const recoveryRate = dashboard.primary_metrics?.recovery_rate || 0;
    return [
      { label: 'Failed payments', value: failedCount, detail: `${dashboard.summary?.total_transactions ? ((failedCount / (dashboard.summary.total_transactions || 1)) * 100).toFixed(1) : '0'}%` },
      { label: 'Total recovered', value: recovered, detail: `${recoveryRate.toFixed(1)}% recovered` },
      { label: 'Revenue at risk', value: dashboard.primary_metrics?.total_revenue_at_risk || 0, detail: '' }
    ];
  }, [dashboard]);

  const totalTransactions = dashboard?.summary?.total_transactions || 0;
  const statusList = status.map((s) => ({ name: s.name, count: s.count || 0 }));
  const topReasons = reasons.slice(0, showAll ? reasons.length : 8);

  return (
    <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3" id="analytics">
      <Card title="Payment status">
        <div className="chart-container no-overflow">
          <div className="space-y-3">
            <div className="flex items-center justify-between"><small className="text-muted">Total transactions</small><b>{totalTransactions.toLocaleString('en-IN')}</b></div>
            <div className="space-y-2">
              {statusList.map((s, i) => {
                const pct = totalTransactions ? Math.round((s.count / totalTransactions) * 100) : 0;
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <div style={{ width: 110 }} className="text-sm text-muted">{s.name}</div>
                    <div className="flex-1">
                      <div className="small-bar"><i style={{ width: `${pct}%`, background: colors[i % colors.length] }} /></div>
                    </div>
                    <div style={{ width: 64 }} className="text-right text-sm"><b>{s.count}</b></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Why are payments failing?">
        {loading ? (
          <div className="skeleton h-52" style={{ height: 210 }} />
        ) : hasFailureReasonData ? (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topReasons} layout="vertical" margin={{ left: 0, right: 24, top: 5, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="reason" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => [v, 'Count']} />
                <Bar dataKey="count" fill="#EF4444" radius={[0, 8, 8, 0]} isAnimationActive={false}>
                  <LabelList dataKey="percentLabel" position="right" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1 text-sm">
              {topReasons.map((r: any) => {
                const pct = totalFailed > 0 ? ((r.count / totalFailed) * 100) : 0;
                return <div key={r.reason} className="flex justify-between"><span>{r.reason}</span><b>{r.count} · {pct.toFixed(0)}%</b></div>
              })}
            </div>
            {reasons.length > 8 && <div className="mt-3"><button className="button" onClick={() => setShowAll(s => !s)}>{showAll ? 'View less' : `View ${reasons.length - 8} more`}</button></div>}
          </div>
        ) : (
          <div style={{ minHeight: 210 }} className="flex flex-col justify-center">
            <p className="text-muted">No failure reason data available</p>
            <div className="mt-3">
              {fallbackInsights.map(i => <div key={i.label} className="flex justify-between text-sm"><span>{i.label}</span><b>{typeof i.value === 'number' ? (i.value).toLocaleString ? (i.value as any).toLocaleString('en-IN') : i.value : i.value}</b></div>)}
            </div>
          </div>
        )}
      </Card>

      <Card title="Recovery funnel">
        <div className="mt-7 space-y-5">
          {([['Failed value', dashboard?.primary_metrics?.total_failed_amount, '#EF4444'], ['Recovered', dashboard?.recovery_metrics?.total_recovered, '#10B981'], ['Still at risk', dashboard?.primary_metrics?.total_revenue_at_risk, '#F59E0B']] as const).map(([name, value, color]) =>
            <div key={name}>
              <div className="mb-2 flex justify-between text-xs"><span className="text-muted">{name}</span><b>₹{(value || 0).toLocaleString('en-IN')}</b></div>
              <div className="h-3 rounded-full bg-slate-100"><i className="block h-full rounded-full" style={{ width: `${dashboard?.primary_metrics?.total_failed_amount ? Number(value) / dashboard.primary_metrics.total_failed_amount * 100 : 0}%`, background: color }} /></div>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="dashboard-card">
      <p className="section-label">Decision Insight</p>
      <h3 className="mt-1 text-[15px] font-bold text-slate-900">{title}</h3>
      {children}
    </article>
  );
}
