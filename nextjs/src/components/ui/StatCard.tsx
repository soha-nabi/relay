import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | number;
  delta?: {
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
  };
  isDemo?: boolean;
  subtext?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  isDemo = false,
  subtext,
  icon,
  variant = 'default',
  className = '',
}: StatCardProps) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'border-blue-200 bg-blue-50/30';
      case 'success':
        return 'border-emerald-200 bg-emerald-50/30';
      case 'warning':
        return 'border-amber-200 bg-amber-50/30';
      case 'danger':
        return 'border-rose-200 bg-rose-50/30';
      default:
        return 'border-slate-200 bg-white';
    }
  };

  return (
    <div
      className={`relative rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${getVariantStyles()} ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {label}
            </span>
            {isDemo && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                Demo data
              </span>
            )}
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1 truncate">
            {value}
          </div>
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
            {icon}
          </div>
        )}
      </div>

      {(delta || subtext) && (
        <div className="mt-3 flex items-center gap-2 text-xs flex-wrap pt-2 border-t border-slate-100">
          {delta && (
            <span
              className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded ${
                delta.trend === 'up'
                  ? 'bg-emerald-50 text-emerald-700'
                  : delta.trend === 'down'
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {delta.trend === 'up' && <TrendingUp size={12} />}
              {delta.trend === 'down' && <TrendingDown size={12} />}
              {delta.trend === 'neutral' && <Minus size={12} />}
              {delta.value}
            </span>
          )}
          {delta?.label && <span className="text-slate-500">{delta.label}</span>}
          {subtext && <span className="text-slate-500">{subtext}</span>}
        </div>
      )}
    </div>
  );
}
