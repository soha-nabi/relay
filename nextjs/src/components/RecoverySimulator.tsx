'use client';

import React, { useState } from 'react';
import { Play, Sparkles, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

export function RecoverySimulator({ onRun }: { onRun?: (strategy: string) => void }) {
  const [strategy, setStrategy] = useState('Smart Retry Window');
  const [result, setResult] = useState<{
    projectedRecovery: number;
    confidence: number;
    days: number;
  }>({
    projectedRecovery: 590000,
    confidence: 82,
    days: 3,
  });
  const [simulating, setSimulating] = useState(false);

  function run() {
    setSimulating(true);
    setTimeout(() => {
      let projected = 590000;
      let conf = 82;
      let days = 3;
      if (strategy.includes('Voice')) {
        projected = 740000;
        conf = 88;
        days = 1;
      } else if (strategy.includes('UPI')) {
        projected = 680000;
        conf = 85;
        days = 2;
      }
      setResult({ projectedRecovery: projected, confidence: conf, days });
      setSimulating(false);
      onRun?.(strategy);
    }, 400);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-blue-600" />
          <span className="text-xs font-bold text-slate-900">
            Strategy Simulation Engine
          </span>
        </div>
        <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
          Demo data
        </span>
      </div>

      <div className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Test Recovery Strategy
          </label>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
          >
            <option>Smart Retry Window (Gateway Off-peak)</option>
            <option>Autonomous ElevenLabs Voice Outreach</option>
            <option>Instant UPI Intent Direct Link</option>
            <option>Multi-Channel Fallback Cascade</option>
          </select>
        </div>

        {/* Projection KPI Matrix */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Projected</span>
            <span className="text-sm sm:text-base font-extrabold text-emerald-600">
              ₹{result.projectedRecovery.toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Confidence</span>
            <span className="text-sm sm:text-base font-extrabold text-blue-600">
              {result.confidence}%
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Time to Resolve</span>
            <span className="text-sm sm:text-base font-extrabold text-slate-800">
              &lt; {result.days} {result.days === 1 ? 'day' : 'days'}
            </span>
          </div>
        </div>

        <button
          onClick={run}
          disabled={simulating}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 transition shadow-sm"
        >
          <Play size={13} />
          {simulating ? 'Simulating Strategy…' : 'Run Strategy Simulation'}
        </button>
      </div>
    </div>
  );
}

export default RecoverySimulator;
