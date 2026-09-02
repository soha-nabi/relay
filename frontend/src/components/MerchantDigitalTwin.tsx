import type { DashboardData } from '../types';

export function MerchantDigitalTwin({ dashboard }: { dashboard?: DashboardData }) {
  const score = Math.round(dashboard?.primary_metrics?.recovery_rate || 82);
  const status = score >= 80 ? 'Healthy' : score >= 60 ? 'At risk' : 'Critical';
  const projectedRecovery = dashboard?.recovery_metrics?.total_recovered || 1240000;
  const projectedRisk = dashboard?.primary_metrics?.total_revenue_at_risk || 2352972;
  const confidence = Math.round(dashboard?.primary_metrics?.recovery_rate || 84);

  return (
    <section className="dashboard-card">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <p className="section-label">Merchant Digital Twin</p>
          <h3 className="mt-2 heading-700 text-[18px]">AI model of your revenue ecosystem</h3>
          <p className="text-sm text-muted mt-1">A concise, explorable model of revenue health and recovery potential.</p>
        </div>
        <div className="sm:text-right">
          <div className="inline-flex items-baseline gap-2 sm:gap-3">
            <div className="text-3xl sm:text-4xl font-extrabold">{score}</div>
            <div className="text-sm text-muted">/100</div>
          </div>
          <div className="mt-1 text-sm font-medium">Status: <span className="text-muted">{status}</span></div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flow-diagram">
          <div className="flow-row"><div className="flow-card">Customers</div><div className="flow-arrow">→</div><div className="flow-card">Payments</div><div className="flow-arrow">→</div><div className="flow-card">Failures</div><div className="flow-arrow">→</div><div className="flow-card">Recovery</div><div className="flow-arrow">→</div><div className="flow-card">Revenue</div></div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-center">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs text-muted">Customers</div>
              <div className="metric-600 mt-1">5,000</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs text-muted">Payments</div>
              <div className="metric-600 mt-1">₹27,70,000</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs text-muted">Failures</div>
              <div className="metric-600 mt-1">1,286</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs text-muted">Recovered</div>
              <div className="metric-600 mt-1">₹4,18,288</div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
              <div className="text-xs text-muted">Revenue At Risk</div>
              <div className="metric-600 mt-1">₹23,52,972</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MerchantDigitalTwin;
