import { AlertTriangle, TrendingUp, Clock, Target } from 'lucide-react';
import type { DashboardData } from '../types';

export function RevenueCopilot({ dashboard }: { dashboard?: DashboardData }) {
  const insights = [
    {
      icon: <AlertTriangle size={16} className="text-amber-600" />,
      bg: 'bg-amber-50 border-amber-100',
      title: 'Card declines drive 41% of losses',
      detail: 'Card declines are the top source of recoverable revenue.'
    },
    {
      icon: <TrendingUp size={16} className="text-blue-600" />,
      bg: 'bg-blue-50 border-blue-100',
      title: 'Wallet users recover 2.7x better',
      detail: 'Encourage wallet adoption for high-value segments.'
    },
    {
      icon: <Clock size={16} className="text-indigo-600" />,
      bg: 'bg-indigo-50 border-indigo-100',
      title: 'Evening retries perform 18% better',
      detail: 'Schedule retries for 6pm–10pm local time.'
    },
    {
      icon: <Target size={16} className="text-emerald-600" />,
      bg: 'bg-emerald-50 border-emerald-100',
      title: 'Top recoverable segment: Returning 25–40',
      detail: 'Target returning customers aged 25–40 with wallet offers.'
    }
  ];

  return (
    <section className="dashboard-card">
      <p className="section-label">AI Insights</p>
      <h3 className="mt-1 heading-700 text-[15px]">Actionable findings</h3>
      <div className="mt-3 space-y-2.5">
        {insights.map((i, idx) => (
          <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200">
            <div className="flex items-start gap-2.5">
              <div className={`p-1.5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5 ${i.bg}`}>
                {i.icon}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-900">{i.title}</div>
                <div className="text-[11px] text-muted mt-0.5 leading-relaxed">{i.detail}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default RevenueCopilot;
