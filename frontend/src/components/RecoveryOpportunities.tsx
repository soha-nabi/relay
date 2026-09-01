export function RecoveryOpportunities({ opportunities = [] as any[] }: { opportunities?: any[] }) {
  const defaults = opportunities.length ? opportunities : [
    { title: 'Wallet Fallback', confidence: 84, recoverable: 340000 },
    { title: 'Smart Retry Engine', confidence: 76, recoverable: 120000 },
    { title: 'UPI Rerouting', confidence: 68, recoverable: 80000 },
    { title: 'Subscription Rescue', confidence: 64, recoverable: 60000 }
  ];

  const total = defaults.reduce((s, o) => s + (o.recoverable || 0), 0);

  return (
    <section className="dashboard-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-label">AI Recovery Opportunities</p>
          <h3 className="mt-2 heading-700 text-[16px]">Actionable recommendations</h3>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Total recoverable</div>
          <div className="metric-600 text-lg">₹{total.toLocaleString('en-IN')}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {defaults.map((o, i) => (
          <div key={i} className="p-3 rounded-md bg-white border flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{o.title}</div>
              <div className="text-xs text-muted">{o.confidence}% confidence</div>
            </div>
            <div className="text-sm font-semibold">+₹{(o.recoverable || 0).toLocaleString('en-IN')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RecoveryOpportunities;
