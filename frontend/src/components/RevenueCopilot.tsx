import type { DashboardData } from '../types';

export function RevenueCopilot({ dashboard }: { dashboard?: DashboardData }) {
  const insights = [
    { emoji: '⚠', title: 'Card declines drive 41% of losses', detail: 'Card declines are the top source of recoverable revenue.' },
    { emoji: '↑', title: 'Wallet users recover 2.7x better', detail: 'Encourage wallet adoption for high-value segments.' },
    { emoji: '📈', title: 'Evening retries perform 18% better', detail: 'Schedule retries for 6pm–10pm local time.' },
    { emoji: '🎯', title: 'Top recoverable segment: Returning 25–40', detail: 'Target returning customers aged 25–40 with wallet offers.' }
  ];

  return (
    <section className="dashboard-card">
      <p className="section-label">AI Insights</p>
      <h3 className="mt-2 heading-700 text-[16px]">Actionable findings</h3>
      <div className="mt-4 space-y-3">
        {insights.map((i, idx) => (
          <div key={idx} className="p-3 rounded-md bg-white border">
            <div className="flex items-start gap-3">
              <div className="text-2xl" aria-hidden>{i.emoji}</div>
              <div>
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-xs text-muted mt-1">{i.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RevenueCopilot;
