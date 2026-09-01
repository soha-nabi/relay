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
      <div className="mt-3 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted"><th>Customer ID</th><th>Risk</th><th>Revenue At Risk</th><th>Likely Reason</th><th>Recommended Action</th></tr>
          </thead>
          <tbody>
            {sample.map((r, i) => (
              <tr key={i} className="border-t"><td className="py-3">{r.customer_id}</td><td>{badge(r.risk_score)} <span className="ml-2">{r.risk_score}</span></td><td>₹{(r.predicted || 0).toLocaleString('en-IN')}</td><td>{r.preferred}</td><td><span className="badge">{r.action}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default AtRiskTable;
