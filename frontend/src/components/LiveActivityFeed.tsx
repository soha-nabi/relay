export function LiveActivityFeed({ events = [] as any[] }: { events?: any[] }) {
  const sample = events.length ? events : [
    { text: 'Payment recovered', amount: 2400 },
    { text: 'Wallet campaign launched', count: 1280 },
    { text: 'Risk score updated', count: 124 },
    { text: 'Alert: Card decline spike' }
  ];

  return (
    <section className="dashboard-card">
      <p className="section-label">Live Activity</p>
      <div className="mt-3 space-y-3 text-sm">
        {sample.map((e, i) => (
          <div key={i} className="flex justify-between items-center">
            <div>{e.text}</div>
            <div className="text-muted text-xs">{e.amount ? `₹${e.amount}` : e.count ? `${e.count}` : ''}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default LiveActivityFeed;
