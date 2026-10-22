'use client';

import React from 'react';
import { Sparkles, ArrowUpRight } from 'lucide-react';

export interface OpportunityItem {
  title: string;
  confidence?: number;
  recoverable?: number;
  reason?: string;
  description?: string;
  impact?: string;
  strategy?: string;
}

const DEFAULT_DEMO_OPPORTUNITIES: OpportunityItem[] = [
  {
    title: 'Smart Retry Timing for HDFC & SBI Cards',
    confidence: 84,
    recoverable: 340000,
    reason: 'Off-peak clearing window increases approval by 18%',
  },
  {
    title: 'Instant UPI Intent Fallback on 3DS Failures',
    confidence: 76,
    recoverable: 120000,
    reason: 'Direct intent links resolve within 60s',
  },
  {
    title: 'Autonomous ElevenLabs Voice Agent Outreach',
    confidence: 68,
    recoverable: 80000,
    reason: 'Instant outbound call for orders > ₹3,000',
  },
  {
    title: 'Recurring Mandate Auto-Reroute',
    confidence: 64,
    recoverable: 60000,
    reason: 'Switches secondary payment instrument upon failure',
  },
];

export function RecoveryOpportunities({
  opportunities = [],
  isDemo = true,
}: {
  opportunities?: OpportunityItem[];
  isDemo?: boolean;
}) {
  const isActualDemo = !opportunities || opportunities.length === 0 || isDemo;
  const items = opportunities.length > 0 ? opportunities : DEFAULT_DEMO_OPPORTUNITIES;
  const total = items.reduce((s, o) => s + (o.recoverable || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-900">
            Actionable AI Recommendations
          </span>
          {isActualDemo && (
            <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
              Demo data
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-[11px] text-slate-500 block">Total Recoverable Potential</span>
          <span className="text-sm sm:text-base font-extrabold text-emerald-600">
            ₹{total.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      <div className="grid gap-2.5">
        {items.map((o, i) => (
          <div
            key={i}
            className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-xs transition-all flex items-center justify-between gap-3"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-900 leading-snug">
                  {o.title}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {o.confidence ?? 75}% confidence
                </span>
              </div>
              {(o.reason || o.description) && (
                <p className="text-[11px] text-slate-500 line-clamp-1">{o.reason || o.description}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-0.5 justify-end">
                +₹{(o.recoverable || 0).toLocaleString('en-IN')}
                <ArrowUpRight size={13} className="text-emerald-600" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecoveryOpportunities;
