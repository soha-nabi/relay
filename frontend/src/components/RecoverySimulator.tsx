import { useState } from 'react';

export function RecoverySimulator({ onRun }: { onRun?: (strategy: string) => void }) {
  const [strategy, setStrategy] = useState('Offer Wallet');
  const [result, setResult] = useState<any>();

  function run() {
    // lightweight simulation mock
    const res = { projectedRecovery: 590000, confidence: 82, days: 12 };
    setResult(res);
    onRun?.(strategy);
  }

  return (
    <section className="dashboard-card">
      <p className="section-label">Recovery Simulator</p>
      <div className="mt-3">
        <select value={strategy} onChange={e => setStrategy(e.target.value)} className="w-full">
          <option>Offer Wallet</option>
          <option>Retry Payment</option>
          <option>Alternative Method</option>
          <option>Recovery Campaign</option>
        </select>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted">Projected Recovery</div>
            <div className="metric-600">₹{result?.projectedRecovery?.toLocaleString ? result.projectedRecovery.toLocaleString('en-IN') : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Confidence</div>
            <div className="metric-600">{result?.confidence ?? '—'}%</div>
          </div>
          <div>
            <div className="text-xs text-muted">Time to recovery</div>
            <div className="metric-600">{result?.days ?? '—'} days</div>
          </div>
        </div>
        <div className="mt-3"><button className="button" onClick={run}>Run Simulation</button></div>
      </div>
    </section>
  );
}

export default RecoverySimulator;

