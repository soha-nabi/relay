import type { DashboardData } from '../types';

export function RevenueInsights({ dashboard }: { dashboard?: DashboardData }) {
  const leaks = (dashboard as any)?.insights?.top_leaks || [
    { name: 'Card Declines', amount: 340000 },
    { name: 'Expired Cards', amount: 120000 },
    { name: 'UPI Failures', amount: 80000 },
    { name: 'Insufficient Balance', amount: 60000 },
    { name: 'Others', amount: 40000 }
  ];

  return (
    <section className="dashboard-card">
      <p className="section-label">Top Revenue Leak Sources</p>
      <div className="mt-3 space-y-3">
        {leaks.map((l: any) => (
          <div key={l.name} className="flex items-center justify-between">
            <div className="text-sm">{l.name}</div>
            <div className="text-sm font-medium">₹{(l.amount || 0).toLocaleString('en-IN')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RevenueInsights;
