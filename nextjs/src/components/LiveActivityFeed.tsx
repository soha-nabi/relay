'use client';

import React from 'react';
import { RefreshCw, MessageSquare, PhoneCall, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge';

export interface ActivityEvent {
  id?: string;
  action: string;
  channel: 'retry' | 'whatsapp' | 'voice' | 'alert' | 'recovered';
  time: string;
  amount?: number;
  customer?: string;
  status?: string;
}

const DEFAULT_DEMO_EVENTS: ActivityEvent[] = [
  {
    action: 'Smart retry dispatched to backup gateway',
    channel: 'retry',
    time: '2m ago',
    amount: 1850,
    customer: 'Rahul S.',
    status: 'retrying',
  },
  {
    action: 'UPI instant collect link delivered',
    channel: 'whatsapp',
    time: '7m ago',
    amount: 3200,
    customer: 'Neha M.',
    status: 'contacted',
  },
  {
    action: 'Voice recovery agent engaged after 3DS drop',
    channel: 'voice',
    time: '14m ago',
    amount: 4500,
    customer: 'Vikas K.',
    status: 'contacted',
  },
  {
    action: 'Temporary bank gateway timeout detected',
    channel: 'alert',
    time: '22m ago',
    status: 'pending',
  },
  {
    action: 'Payment recovered via UPI intent',
    channel: 'recovered',
    time: '31m ago',
    amount: 2400,
    customer: 'Priya R.',
    status: 'recovered',
  },
];

export function LiveActivityFeed({
  events,
  isDemo = true,
}: {
  events?: ActivityEvent[];
  isDemo?: boolean;
}) {
  const displayEvents = events && events.length > 0 ? events : DEFAULT_DEMO_EVENTS;
  const isActualDemo = !events || events.length === 0 || isDemo;

  const getChannelIcon = (ch: ActivityEvent['channel']) => {
    switch (ch) {
      case 'retry':
        return <RefreshCw size={13} className="text-amber-600" />;
      case 'whatsapp':
        return <MessageSquare size={13} className="text-emerald-600" />;
      case 'voice':
        return <PhoneCall size={13} className="text-blue-600" />;
      case 'alert':
        return <AlertTriangle size={13} className="text-rose-600" />;
      case 'recovered':
        return <CheckCircle2 size={13} className="text-emerald-600" />;
      default:
        return <RefreshCw size={13} className="text-slate-500" />;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {isActualDemo && (
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Live Recovery Stream
          </span>
          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data
          </span>
        </div>
      )}

      <div className="space-y-3">
        {displayEvents.map((e, i) => (
          <div
            key={e.id || i}
            className="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-slate-50/80 transition-colors border border-transparent hover:border-slate-100"
          >
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-slate-100 shrink-0 mt-0.5">
                {getChannelIcon(e.channel)}
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold text-slate-900 leading-snug">
                  {e.action}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                  {e.customer && <span>{e.customer}</span>}
                  <span>•</span>
                  <span>{e.time}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              {e.amount && (
                <span className="text-xs font-bold text-slate-900">
                  ₹{e.amount.toLocaleString('en-IN')}
                </span>
              )}
              {e.status && <StatusBadge status={e.status} size="sm" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LiveActivityFeed;
