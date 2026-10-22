import React from 'react';
import { Phone, Mail, MessageSquare, RefreshCw, CheckCircle2, XCircle, Clock, Link2, Zap } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export interface TimelineEvent {
  id?: string;
  timestamp: string;
  channel?: 'voice' | 'whatsapp' | 'email' | 'retry' | 'webhook' | 'checkout' | 'system' | string;
  title: string;
  description?: string;
  status?: 'success' | 'failed' | 'retrying' | 'contacted' | 'pending' | string;
  metadata?: Record<string, any>;
}

interface TimelineProps {
  events: TimelineEvent[];
  emptyMessage?: string;
  className?: string;
}

export function Timeline({ events, emptyMessage = 'No activity recorded yet.', className = '' }: TimelineProps) {
  if (!events || events.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-400">
        <Clock className="mx-auto mb-2 opacity-50" size={20} />
        {emptyMessage}
      </div>
    );
  }

  const getChannelIcon = (channel?: string) => {
    switch (channel?.toLowerCase()) {
      case 'voice':
      case 'call':
        return <Phone size={13} className="text-blue-600" />;
      case 'whatsapp':
        return <MessageSquare size={13} className="text-emerald-600" />;
      case 'email':
        return <Mail size={13} className="text-indigo-600" />;
      case 'retry':
      case 'smart_retry':
        return <RefreshCw size={13} className="text-amber-600" />;
      case 'checkout':
      case 'payment':
        return <Link2 size={13} className="text-purple-600" />;
      case 'webhook':
        return <Zap size={13} className="text-cyan-600" />;
      default:
        return <Clock size={13} className="text-slate-500" />;
    }
  };

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className={`relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 ${className}`}>
      {events.map((evt, idx) => (
        <div key={evt.id || idx} className="relative group">
          {/* Timeline node */}
          <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-slate-300 shadow-xs group-hover:border-blue-500 transition">
            {getChannelIcon(evt.channel)}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{evt.title}</span>
                {evt.status && <StatusBadge status={evt.status} size="sm" />}
              </div>
              <time className="text-[11px] font-medium text-slate-400">
                {formatTimestamp(evt.timestamp)}
              </time>
            </div>

            {evt.description && (
              <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                {evt.description}
              </p>
            )}

            {evt.metadata && Object.keys(evt.metadata).length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                {Object.entries(evt.metadata).map(([k, v]) => (
                  <span
                    key={k}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
