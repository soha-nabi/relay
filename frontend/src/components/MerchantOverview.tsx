import React, { useEffect, useRef, useState } from 'react';
import type { DashboardData } from '../types';

// ─── Utilities ────────────────────────────────────────────────────────────────
const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n);

// ─── Animated Network Canvas ──────────────────────────────────────────────────
interface NodeData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: 'failure' | 'action' | 'customer' | 'recovered';
  label: string;
  pulse: number;
  opacity: number;
}

interface ParticleData {
  from: number;
  to: number;
  t: number;
  speed: number;
  color: string;
}

const NODE_COLORS = {
  failure: '#ef4444',
  action: '#3b82f6',
  customer: '#8b5cf6',
  recovered: '#10b981',
};

const NODE_LABELS = {
  failure: ['Card Declined', 'Insufficient Funds', 'Expired Card', 'UPI Failure', 'Network Error'],
  action: ['Smart Retry', 'Custom Schedule', 'Offer Alt. Payment', 'Automation'],
  customer: ['Customer Action', 'Pending', 'Awaiting'],
  recovered: ['Recovered', 'Payment Captured', 'Revenue Restored'],
};

function buildNodes(width: number, height: number): NodeData[] {
  const nodes: NodeData[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.28;
  const sequences: Array<{ type: NodeData['type']; label: string }> = [
    { type: 'failure', label: 'Card Declined' },
    { type: 'failure', label: 'Insufficient Funds' },
    { type: 'failure', label: 'Expired Card' },
    { type: 'failure', label: 'UPI Failure' },
    { type: 'action', label: 'Smart Retry' },
    { type: 'action', label: 'Custom Schedule' },
    { type: 'action', label: 'Automation' },
    { type: 'customer', label: 'Customer Action' },
    { type: 'customer', label: 'Pending' },
    { type: 'recovered', label: 'Recovered' },
    { type: 'recovered', label: 'Revenue Restored' },
  ];
  sequences.forEach((s, i) => {
    const angle = (i / sequences.length) * Math.PI * 2 - Math.PI / 2;
    const jitter = r * 0.25;
    nodes.push({
      x: cx + Math.cos(angle) * (r + (Math.random() - 0.5) * jitter),
      y: cy + Math.sin(angle) * (r + (Math.random() - 0.5) * jitter),
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      type: s.type,
      label: s.label,
      pulse: Math.random() * Math.PI * 2,
      opacity: 0.7 + Math.random() * 0.3,
    });
  });
  return nodes;
}

interface NetworkProps {
  width?: number;
  height?: number;
  calm?: boolean;
}

function NetworkCanvas({ width = 680, height = 420, calm = false }: NetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const nodesRef = useRef<NodeData[]>([]);
  const particlesRef = useRef<ParticleData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    nodesRef.current = buildNodes(width, height);

    // Seed particles along the "failure → action → customer → recovered" flow
    const edges: Array<[number, number]> = [
      [0, 4], [1, 4], [2, 5], [3, 6],
      [4, 7], [5, 8], [6, 7],
      [7, 9], [8, 10],
    ];

    const spawnParticle = () => {
      if (particlesRef.current.length >= 10) return;
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const fromNode = nodesRef.current[edge[0]];
      const toNode = nodesRef.current[edge[1]];
      if (!fromNode || !toNode) return;
      particlesRef.current.push({
        from: edge[0],
        to: edge[1],
        t: 0,
        speed: 0.003 + Math.random() * 0.003,
        color: NODE_COLORS[toNode.type],
      });
    };

    let spawnTimer = 0;

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, width, height);
      const nodes = nodesRef.current;
      const particles = particlesRef.current;

      // Drift nodes gently
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        n.pulse += 0.025;
        if (n.x < 30 || n.x > width - 30) n.vx *= -1;
        if (n.y < 30 || n.y > height - 30) n.vy *= -1;
      });

      // Draw edges
      edges.forEach(([a, b]) => {
        const from = nodes[a];
        const to = nodes[b];
        if (!from || !to) return;
        const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
        grad.addColorStop(0, `${NODE_COLORS[from.type]}22`);
        grad.addColorStop(1, `${NODE_COLORS[to.type]}22`);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = calm ? 1 : 1.5;
        ctx.stroke();
      });

      // Draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const from = nodes[p.from];
        const to = nodes[p.to];
        if (!from || !to) { particles.splice(i, 1); continue; }
        p.t += p.speed;
        if (p.t >= 1) { particles.splice(i, 1); continue; }
        const px = from.x + (to.x - from.x) * p.t;
        const py = from.y + (to.y - from.y) * p.t;
        ctx.beginPath();
        ctx.arc(px, py, calm ? 2 : 3, 0, Math.PI * 2);
        ctx.fillStyle = `${p.color}cc`;
        ctx.fill();
      }

      // Draw nodes
      nodes.forEach((n) => {
        const pulse = Math.sin(n.pulse) * 0.15 + 0.85;
        const baseR = calm ? 4 : 6;
        const r = baseR * pulse;

        // Glow
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, baseR * 3);
        glow.addColorStop(0, `${NODE_COLORS[n.type]}44`);
        glow.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(n.x, n.y, baseR * 3, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = NODE_COLORS[n.type];
        ctx.globalAlpha = n.opacity;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label (hero only, not calm)
        if (!calm) {
          ctx.font = '10px Inter, system-ui, sans-serif';
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + baseR * 3 + 10);
        }
      });

      // Spawn particles
      spawnTimer++;
      if (spawnTimer % 45 === 0) spawnParticle();

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [width, height, calm]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', maxWidth: '100%' }}
    />
  );
}

// ─── Pipeline Step ─────────────────────────────────────────────────────────────
const PIPELINE_STEPS = [
  {
    id: 'detect',
    label: 'Detect',
    icon: '⚡',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    description:
      'Relay receives payment failure signals via webhook in real time — before the customer even leaves the checkout page.',
  },
  {
    id: 'diagnose',
    label: 'Diagnose',
    icon: '🔍',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    description:
      'Each failure is classified by category — soft decline, hard decline, or permanent — to determine the right recovery path.',
  },
  {
    id: 'decide',
    label: 'Decide',
    icon: '🧠',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    description:
      'Relay selects a recovery strategy: Smart Retry, Custom Schedule, an Automation rule, or a direct customer instruction.',
  },
  {
    id: 'recover',
    label: 'Recover',
    icon: '🔄',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
    description:
      'The recovery workflow executes — retrying the payment at the right time, or guiding the customer through an alternative.',
  },
  {
    id: 'stop',
    label: 'Stop',
    icon: '✅',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    description:
      'When payment is captured, Relay closes the recovery session instantly — no duplicate retries, no stale automation.',
  },
];

// ─── Capability Cards ──────────────────────────────────────────────────────────
const CAPABILITIES = [
  {
    icon: '🔁',
    title: 'Smart Retry',
    tagline: 'Relay chooses the next retry window.',
    detail:
      'Our scoring engine analyses failure type, customer history, and payment method to schedule retries when success probability is highest.',
    href: '#recovery',
    color: '#3b82f6',
  },
  {
    icon: '📅',
    title: 'Custom Retry',
    tagline: 'Control exactly when Relay retries.',
    detail:
      'Define your own retry schedule — hourly, daily, multi-day — with full control over attempt spacing and limits.',
    href: '#recovery',
    color: '#8b5cf6',
  },
  {
    icon: '⚙️',
    title: 'Automations',
    tagline: 'Build recovery workflows without code.',
    detail:
      'Set WHEN → IF → THEN rules. Automations run the moment a failure arrives and stop automatically when payment is recovered.',
    href: '#automations',
    color: '#f59e0b',
  },
  {
    icon: '👤',
    title: 'Customer Recovery',
    tagline: 'Give customers a frictionless path to payment.',
    detail:
      'Relay generates a unique payment link per customer with their preferred alternative methods already surfaced.',
    href: '#customer',
    color: '#10b981',
  },
];

// ─── Activity Feed Item ───────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  { event: 'payment_failed', label: 'Payment failed', color: '#ef4444', dot: '#fee2e2' },
  { event: 'diagnosis_complete', label: 'Diagnosis complete', color: '#f59e0b', dot: '#fef3c7' },
  { event: 'smart_retry_scheduled', label: 'Smart Retry scheduled', color: '#3b82f6', dot: '#dbeafe' },
  { event: 'customer_action_required', label: 'Customer action required', color: '#8b5cf6', dot: '#ede9fe' },
  { event: 'payment_recovered', label: 'Payment recovered', color: '#10b981', dot: '#d1fae5' },
  { event: 'recovery_stopped', label: 'Recovery stopped', color: '#64748b', dot: '#f1f5f9' },
];

const SEED_FEED = [
  { event: 'payment_recovered', label: 'Payment recovered', color: '#10b981', dot: '#d1fae5', ago: '12s ago' },
  { event: 'smart_retry_scheduled', label: 'Smart Retry scheduled', color: '#3b82f6', dot: '#dbeafe', ago: '41s ago' },
  { event: 'customer_action_required', label: 'Customer action required', color: '#8b5cf6', dot: '#ede9fe', ago: '1m ago' },
  { event: 'diagnosis_complete', label: 'Diagnosis complete', color: '#f59e0b', dot: '#fef3c7', ago: '2m ago' },
  { event: 'payment_failed', label: 'Payment failed', color: '#ef4444', dot: '#fee2e2', ago: '3m ago' },
];

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  dashboard?: DashboardData;
  onNavigate?: (section: string) => void;
}

export default function MerchantOverview({ dashboard, onNavigate }: Props) {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [feed] = useState(SEED_FEED);
  const [heroVisible, setHeroVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  // Metrics from real data
  const atRisk = dashboard?.primary_metrics?.total_revenue_at_risk ?? 0;
  const recovered = dashboard?.recovery_metrics?.total_recovered ?? 0;
  const activeRecoveries = dashboard?.summary?.failed_transactions ?? 0;

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  const nav = (section: string) => {
    onNavigate?.(section);
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0f172a' }}>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="flex items-center justify-center py-6 sm:py-10 lg:py-14 animate-fadeInUp"
        style={{
          minHeight: 'auto',
          opacity: heroVisible ? 1 : 0,
          transform: heroVisible ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        <div style={{ width: '100%' }}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center">

            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/60 rounded-full px-3 py-1 text-xs font-semibold text-blue-600 mb-3 sm:mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Recovery engine active</span>
              </div>

              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.12] mb-3 sm:mb-4">
                Recover revenue<br />
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  before it disappears.
                </span>
              </h1>

              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-lg mb-5 sm:mb-7">
                Relay detects failed payments, chooses the right recovery action,
                and closes the loop when the money comes back.
              </p>

              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full sm:w-auto">
                <button
                  id="hero-cta-recoveries"
                  onClick={() => nav('recovery')}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold shadow-md hover:bg-slate-800 transition-all active:scale-[0.98]"
                  style={{ minHeight: '44px' }}
                >
                  View recoveries
                </button>
                <button
                  id="hero-cta-automations"
                  onClick={() => nav('automations')}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-xl bg-white text-slate-900 border border-slate-200 text-xs sm:text-sm font-semibold shadow-sm hover:border-blue-200 hover:bg-blue-50/50 transition-all active:scale-[0.98]"
                  style={{ minHeight: '44px' }}
                >
                  Explore automations
                </button>
              </div>
            </div>

            {/* Right: Network Visual */}
            <div className="flex justify-center bg-slate-50/80 border border-slate-200/80 rounded-2xl sm:rounded-3xl p-2 sm:p-4 shadow-sm overflow-hidden w-full max-h-[220px] sm:max-h-none">
              <NetworkCanvas width={460} height={280} />
            </div>
          </div>

          {/* ── LIVE STATUS BAR ─────────────────────────────────────────── */}
          <div className="mt-6 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-px sm:bg-slate-200 rounded-2xl overflow-hidden sm:border sm:border-slate-200">
            {[
              { label: 'Revenue at Risk', value: money(atRisk), color: '#ef4444', note: 'Active failed payments' },
              { label: 'Recovered', value: money(recovered), color: '#10b981', note: 'Closed recovery sessions' },
              { label: 'Active Recoveries', value: fmt(activeRecoveries), color: '#2563eb', note: 'In-progress sessions' },
            ].map((m, i) => (
              <div
                key={i}
                className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-none border border-slate-200 sm:border-0 shadow-sm sm:shadow-none"
              >
                <p className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-1">
                  {m.label}
                </p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight mb-0.5 leading-tight" style={{ color: m.color }}>
                  {m.value}
                </p>
                <p className="text-[11px] text-slate-400 m-0">{m.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE ACTIVITY FEED ──────────────────────────────────────────────── */}
      <section className="py-8 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Live status
            </p>
            <h2 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 12px', lineHeight: 1.15 }}>
              Relay is working.
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, maxWidth: '400px', margin: 0 }}>
              Every event in the recovery lifecycle is tracked in real time.
              The feed below reflects your actual recovery sessions.
            </p>
          </div>

          <div style={{
            background: 'white', border: '1px solid #f1f5f9',
            borderRadius: '20px', overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(15,23,42,0.04)',
            width: '100%',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)', animation: 'pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>Recovery activity</span>
            </div>
            <div>
              {feed.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 18px',
                  borderTop: i === 0 ? 'none' : '1px solid #f8fafc',
                  transition: 'background 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: item.dot, border: `2px solid ${item.color}`,
                      display: 'inline-block', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#334155' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>{item.ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── RECOVERY PIPELINE ───────────────────────────────────────────────── */}
      <section className="py-8 sm:py-16">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>How it works</p>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px', lineHeight: 1.15 }}>
            The recovery pipeline.
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
            From the moment a payment fails to the moment it is recovered — Relay handles every step.
          </p>
        </div>

        {/* Steps */}
        <div className="table-responsive">
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', minWidth: '600px', position: 'relative' }}>
            {PIPELINE_STEPS.map((step, i) => (
              <React.Fragment key={step.id}>
                <button
                  id={`pipeline-step-${step.id}`}
                  onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
                  style={{
                    flex: 1,
                    background: activeStep === step.id ? step.bg : 'white',
                    border: `1px solid ${activeStep === step.id ? step.color + '44' : '#f1f5f9'}`,
                    borderRadius: i === 0 ? '16px 0 0 16px' : i === PIPELINE_STEPS.length - 1 ? '0 16px 16px 0' : '0',
                    padding: '20px 14px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'background 0.2s ease, border-color 0.2s ease',
                    outline: 'none',
                    boxShadow: activeStep === step.id ? `0 4px 20px ${step.color}18` : '0 2px 8px rgba(15,23,42,0.04)',
                  }}
                  aria-pressed={activeStep === step.id}
                >
                  <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>{step.icon}</span>
                  <span style={{
                    fontSize: '13px', fontWeight: 700,
                    color: activeStep === step.id ? step.color : '#334155',
                    display: 'block',
                  }}>
                    {step.label}
                  </span>
                </button>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div style={{
                    width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#cbd5e1', fontSize: '14px', flexShrink: 0,
                    background: 'white', border: '1px solid #f1f5f9', borderLeft: 'none', borderRight: 'none',
                  }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Expanded description */}
        {activeStep && (() => {
          const step = PIPELINE_STEPS.find(s => s.id === activeStep)!;
          return (
            <div style={{
              marginTop: '16px',
              background: step.bg,
              border: `1px solid ${step.color}30`,
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', gap: '14px',
              animation: 'fadeIn 0.2s ease',
            }}>
              <span style={{ fontSize: '22px', flexShrink: 0 }}>{step.icon}</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: 1.6 }}>
                <strong style={{ color: step.color }}>{step.label}: </strong>{step.description}
              </p>
            </div>
          );
        })()}
      </section>

      {/* ── CAPABILITIES ────────────────────────────────────────────────────── */}
      <section className="py-8 sm:py-16">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>What Relay does</p>
          <h2 style={{ fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.15 }}>
            Four ways to recover revenue.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CAPABILITIES.map((cap, i) => (
            <a
              key={i}
              id={`cap-card-${cap.title.toLowerCase().replace(/\s+/g, '-')}`}
              href={cap.href}
              style={{ textDecoration: 'none' }}
              onClick={e => { e.preventDefault(); nav(cap.href.slice(1)); }}
            >
              <div style={{
                background: 'white',
                border: '1px solid #f1f5f9',
                borderRadius: '20px',
                padding: '24px 20px',
                height: '100%',
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                boxShadow: '0 2px 8px rgba(15,23,42,0.04)',
              }}
                onMouseEnter={e => {
                  const t = e.currentTarget;
                  t.style.transform = 'translateY(-4px)';
                  t.style.boxShadow = '0 12px 32px rgba(15,23,42,0.10)';
                  t.style.borderColor = `${cap.color}44`;
                }}
                onMouseLeave={e => {
                  const t = e.currentTarget;
                  t.style.transform = '';
                  t.style.boxShadow = '0 2px 8px rgba(15,23,42,0.04)';
                  t.style.borderColor = '#f1f5f9';
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: `${cap.color}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', marginBottom: '16px',
                }}>
                  {cap.icon}
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                  {cap.title}
                </h3>
                <p style={{ fontSize: '12px', fontWeight: 600, color: cap.color, margin: '0 0 8px' }}>
                  {cap.tagline}
                </p>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.55 }}>
                  {cap.detail}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── NETWORK SECTION (CALM) ───────────────────────────────────────────── */}
      <section className="my-6 sm:my-14 bg-slate-50 border border-slate-100 rounded-3xl p-6 sm:p-10 overflow-hidden relative">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Copy */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>Revenue recovery, continuously.</p>
            <h2 style={{ fontSize: 'clamp(22px, 4vw, 32px)', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 12px', lineHeight: 1.15 }}>
              Every failed payment<br />has a different path back.
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, margin: '0 0 20px' }}>
              Relay maps the right recovery route for each failure type — Card Declined, Insufficient Funds, Expired Card, UPI Failure — and routes them toward captured revenue.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { label: 'Card Declined', color: '#ef4444' },
                { label: 'Insufficient Funds', color: '#f59e0b' },
                { label: 'Expired Card', color: '#8b5cf6' },
                { label: 'UPI Failure', color: '#3b82f6' },
                { label: 'Network Error', color: '#64748b' },
              ].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>{f.label}</span>
                  <div style={{ flex: 1, minWidth: '40px', height: 1, background: '#e2e8f0' }} />
                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>→ Recovered Revenue</span>
                </div>
              ))}
            </div>
          </div>

          {/* Calm network visual */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', overflow: 'hidden' }}>
            <NetworkCanvas width={380} height={280} calm />
          </div>
        </div>
      </section>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 3px rgba(16,185,129,0.2); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0.08); } }
      `}</style>
    </div>
  );
}
