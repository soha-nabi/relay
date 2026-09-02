import type { DashboardData } from '../types';

export function AtRiskTable({ rows = [] as any[] }: { rows?: any[] }) {
  const sample = rows.length ? rows.slice(0, 20) : [
    { customer_id: 'CUST00052', risk_score: 85, failures: 3, preferred: 'Card', predicted: 3200, action: 'Offer Wallet' },
    { customer_id: 'CUST00123', risk_score: 72, failures: 2, preferred: 'UPI', predicted: 1500, action: 'Retry' }
  ];

  function badge(score: number) {
    if (score >= 80) return <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#FEE2E2', color: '#B91C1C' }}>High</span>;
    if (score >= 50) return <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#FEF3C7', color: '#92400E' }}>Medium</span>;
    return <span className="px-2 py-1 rounded-full text-xs" style={{ background: '#ECFDF5', color: '#065F46' }}>Low</span>;
  }

  return (
    <section className="dashboard-card">
      <p className="section-label">At-Risk Customers</p>
      
      {/* Mobile Cards View (<640px) */}
      <div className="block sm:hidden mt-3 space-y-2.5">
        {sample.map((r, i) => (
          <div key={i} className="surface p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-900 text-sm">{r.customer_id}</span>
              <div className="flex items-center gap-1.5">
                {badge(r.risk_score)}
                <span className="text-xs font-semibold text-slate-600">{r.risk_score}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Revenue At Risk</span>
                <span className="font-bold text-slate-900 text-sm">₹{(r.predicted || 0).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Recommended</span>
                <span className="badge text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 inline-block mt-0.5">
                  {r.action}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View (>=640px) */}
      <div className="hidden sm:block mt-3 table-responsive">
        <table className="w-full text-sm" style={{ minWidth: '540px' }}>
          <thead>
            <tr className="text-left text-xs text-muted border-b border-slate-100">
              <th className="py-2.5 px-3">Customer ID</th>
              <th className="py-2.5 px-3">Risk</th>
              <th className="py-2.5 px-3">Revenue At Risk</th>
              <th className="py-2.5 px-3">Likely Reason</th>
              <th className="py-2.5 px-3">Recommended Action</th>
            </tr>
          </thead>
          <tbody>
            {sample.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-3 font-medium text-slate-900">{r.customer_id}</td>
                <td className="py-3 px-3">{badge(r.risk_score)} <span className="ml-2 text-xs text-slate-600">{r.risk_score}</span></td>
                <td className="py-3 px-3 font-semibold text-slate-800">₹{(r.predicted || 0).toLocaleString('en-IN')}</td>
                <td className="py-3 px-3 text-slate-600">{r.preferred}</td>
                <td className="py-3 px-3"><span className="badge text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">{r.action}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AtRiskTable;
