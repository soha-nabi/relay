'use client';

import React from 'react';
import type { DashboardData } from '@/types';

export function RevenueInsights({ dashboard }: { dashboard?: DashboardData }) {
  const hasRealData = Boolean((dashboard as any)?.insights?.top_leaks);
  const leaks = (dashboard as any)?.insights?.top_leaks || [
    { name: 'Card 3DS Timeouts', amount: 340000, pct: 52 },
    { name: 'Bank Gateway Limits', amount: 120000, pct: 18 },
    { name: 'UPI VPA Validation Drops', amount: 80000, pct: 12 },
    { name: 'Insufficient Balance', amount: 60000, pct: 9 },
    { name: 'Expired Instruments', amount: 40000, pct: 6 },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Top Revenue Leak Sources
        </span>
        {!hasRealData && (
          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data
          </span>
        )}
      </div>
      <div className="space-y-3">
        {leaks.map((l: any) => (
          <div key={l.name} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700">{l.name}</span>
              <span className="text-slate-900 font-extrabold">₹{(l.amount || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${l.pct || 20}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RevenueInsights;
