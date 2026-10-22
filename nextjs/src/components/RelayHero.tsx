'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, Zap, ShieldCheck, TrendingUp, CheckCircle2, PhoneCall, RefreshCw } from 'lucide-react';
import { WebGLShader } from '@/components/ui/web-gl-shader';
import { GlassFilterPortal, LiquidButton } from '@/components/ui/liquid-glass-button';
import { api } from '@/lib/api';
import type { DashboardData } from '@/types';

interface HeroProps {
  onNavigate?: (tab: string) => void;
  dashboard?: DashboardData;
}

function StatusPill({ dashboard }: { dashboard?: DashboardData }) {
  const [status, setStatus] = useState<'loading' | 'live' | 'demo'>('loading');

  useEffect(() => {
    // If dashboard data was passed from parent and contains real metrics
    const hasRealMetrics =
      (dashboard?.primary_metrics?.total_revenue_at_risk ?? 0) > 0 ||
      (dashboard?.recovery_metrics?.total_recovered ?? 0) > 0;

    if (hasRealMetrics) {
      setStatus('live');
      return;
    }

    const checkEngine = async () => {
      try {
        const res = await api.get('/dashboard');
        // Honesty rule: ONLY claim "Recovery engine active" if real recovery data exists
        const live =
          (res.data?.primary_metrics?.total_revenue_at_risk ?? 0) > 0 ||
          (res.data?.recovery_metrics?.total_recovered ?? 0) > 0;
        if (live) {
          setStatus('live');
        } else {
          setStatus('demo');
        }
      } catch {
        // Backend not returning live data -> honestly show Demo mode
        setStatus('demo');
      }
    };

    checkEngine();
  }, [dashboard]);

  if (status === 'loading') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80 border border-white/15 backdrop-blur-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-white/60 animate-pulse" />
        Checking recovery engine…
      </div>
    );
  }

  if (status === 'live') {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-400/30 backdrop-blur-md">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Recovery engine active
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-300 border border-amber-400/30 backdrop-blur-md">
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      Demo mode (Simulation Active)
    </div>
  );
}

export default function RelayHero({ onNavigate, dashboard }: HeroProps) {
  return (
    <>
      {/* GlassFilter SVG — rendered once in the hero, shared by all LiquidButtons */}
      <GlassFilterPortal />

      <section
        className="relative w-full overflow-hidden"
        style={{ minHeight: 'clamp(400px, 48vw, 540px)', borderRadius: '0 0 24px 24px' }}
        aria-label="Relay hero"
      >
        {/* WebGL Shader background — absolute inset, pointer-events-none (contained ONLY in Overview Hero) */}
        <WebGLShader />

        {/* Dark overlay to ensure WCAG AA contrast for hero text */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-slate-950/30 to-slate-950/70 pointer-events-none z-[1]" aria-hidden />

        {/* Content Container */}
        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-12 py-12 sm:py-16 flex items-center justify-between min-h-[inherit]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-10 items-center w-full">
            
            {/* Left Column: Value Prop & CTAs */}
            <div className="max-w-2xl">
              {/* Status pill with strict honesty */}
              <div className="mb-5">
                <StatusPill dashboard={dashboard} />
              </div>

              {/* Headline */}
              <h1
                className="text-white font-extrabold tracking-tight leading-[1.08]"
                style={{ fontSize: 'clamp(2.1rem, 5vw, 3.4rem)' }}
              >
                Recover revenue before<br className="hidden sm:block" />
                {' '}it disappears.
              </h1>

              {/* Sub-copy with AA contrast */}
              <p
                className="mt-4 text-slate-200/90 max-w-xl leading-relaxed text-sm sm:text-base font-normal"
              >
                Relay autonomously diagnoses payment failures, orchestrates smart retries and real-time AI outreach, and recovers at-risk merchant volume before churn happens.
              </p>

              {/* CTAs */}
              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <LiquidButton
                  size="lg"
                  onClick={() => onNavigate?.('recoveries')}
                  id="hero-cta-recoveries"
                  aria-label="View recoveries"
                >
                  <Zap size={16} />
                  View recoveries
                </LiquidButton>

                <button
                  onClick={() => onNavigate?.('automations')}
                  id="hero-cta-automations"
                  className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 backdrop-blur-md px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/20 hover:border-white/50 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  aria-label="Explore automations"
                >
                  Explore automations
                  <ArrowRight size={14} />
                </button>
              </div>

              {/* Feature pills */}
              <div className="mt-8 flex flex-wrap gap-2.5">
                {[
                  { icon: <ShieldCheck size={13} className="text-blue-300" />, label: 'AI Failure Diagnosis' },
                  { icon: <TrendingUp size={13} className="text-emerald-300" />, label: 'Smart Retry Timing' },
                  { icon: <Zap size={13} className="text-amber-300" />, label: 'Instant Multi-channel Fallback' },
                ].map(({ icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md"
                  >
                    {icon}
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Column: Small Product Preview filling empty area */}
            <div className="hidden lg:flex flex-col gap-3 justify-center">
              <div className="rounded-2xl border border-white/20 bg-slate-900/60 backdrop-blur-xl p-5 shadow-2xl text-white">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-white/90">
                      Live Recovery In-Flight
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10">
                    ID #REC-9824
                  </span>
                </div>

                {/* Micro Recovery Pipeline */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-white/70">
                    <span>Customer</span>
                    <span className="font-semibold text-white">Ananya Verma</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70">
                    <span>Amount at Risk</span>
                    <span className="font-extrabold text-amber-300">₹3,499.00</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70">
                    <span>Decline Reason</span>
                    <span className="font-mono text-[11px] text-rose-300">3DS_AUTH_TIMEOUT</span>
                  </div>

                  {/* Recovery Steps Trail */}
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-medium">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span>Smart retry executed (Bank gateway switched)</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-blue-300 font-medium">
                      <PhoneCall size={13} className="shrink-0" />
                      <span>Autonomous voice fallback completed</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-emerald-400 font-bold bg-emerald-500/20 px-2.5 py-1.5 rounded-lg border border-emerald-400/30">
                      <RefreshCw size={13} className="shrink-0" />
                      <span>Payment successfully recovered via UPI</span>
                    </div>
                  </div>
                </div>

                {/* Footer Micro stats */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/60">
                  <span>Latency: <strong className="text-white/90">42s</strong></span>
                  <span>Intervention: <strong className="text-emerald-300">Zero-touch</strong></span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
}
