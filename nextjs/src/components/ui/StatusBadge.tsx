import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, XCircle, PhoneCall, ArrowUpRight } from 'lucide-react';

export type PaymentStatusType =
  | 'failed'
  | 'retrying'
  | 'contacted'
  | 'recovered'
  | 'written_off'
  | 'pending'
  | 'active'
  | 'success'
  | string;

interface StatusBadgeProps {
  status: PaymentStatusType;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({
  status,
  label,
  size = 'md',
  className = '',
}: StatusBadgeProps) {
  const norm = String(status || '').toLowerCase().replace(/[\s-]/g, '_');

  let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
  let Icon = Clock;
  let defaultLabel = norm.replace('_', ' ');

  if (norm === 'failed' || norm === 'failure' || norm === 'error' || norm === 'payment_failed') {
    badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200';
    Icon = XCircle;
    defaultLabel = 'Failed';
  } else if (norm === 'retrying' || norm === 'scheduled' || norm === 'retry_scheduled') {
    badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200';
    Icon = AlertTriangle;
    defaultLabel = 'Retrying';
  } else if (norm === 'contacted' || norm === 'outreached' || norm === 'calling') {
    badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
    Icon = PhoneCall;
    defaultLabel = 'Contacted';
  } else if (norm === 'recovered' || norm === 'success' || norm === 'completed' || norm === 'paid') {
    badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    Icon = CheckCircle2;
    defaultLabel = 'Recovered';
  } else if (norm === 'written_off' || norm === 'dropped' || norm === 'abandoned') {
    badgeStyle = 'bg-slate-100 text-slate-600 border-slate-300';
    Icon = XCircle;
    defaultLabel = 'Written off';
  } else if (norm === 'active') {
    badgeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    Icon = ArrowUpRight;
    defaultLabel = 'Active';
  }

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[11px] gap-1'
      : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border ${badgeStyle} ${sizeClasses} ${className}`}
    >
      <Icon size={size === 'sm' ? 11 : 13} className="shrink-0" />
      <span className="capitalize">{label || defaultLabel}</span>
    </span>
  );
}
