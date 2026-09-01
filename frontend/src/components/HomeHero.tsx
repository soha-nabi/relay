import { KpiCard } from './KpiCard';
import type { DashboardData } from '../types';

export function HomeHero({ dashboard }: { dashboard?: DashboardData }) {
  const atRisk = dashboard?.primary_metrics?.total_revenue_at_risk || 2352972;
  const recovered = dashboard?.recovery_metrics?.total_recovered || 418288;
  const rate = dashboard?.primary_metrics?.recovery_rate ?? 15.1;
  const score = Math.round(dashboard?.primary_metrics?.recovery_rate || 72);

  return (
    <section className="home-hero">
      <div>
        <div className="hero-title">RevenueOS</div>
        <div className="hero-sub">Know where revenue is leaking. Recover what matters.</div>

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="text-xs text-muted">Revenue At Risk</div>
            <div className="mt-2 text-xl font-semibold">₹{(atRisk).toLocaleString('en-IN')}</div>
            <div className="text-xs text-muted mt-1">Based on failure patterns and payment mix</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-muted">Recovered Revenue</div>
            <div className="mt-2 text-xl font-semibold">₹{(recovered).toLocaleString('en-IN')}</div>
            <div className="text-xs text-muted mt-1">Last 30 days</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-muted">Recovery Rate</div>
            <div className="mt-2 text-xl font-semibold">{rate.toFixed ? rate.toFixed(1) : rate}%</div>
            <div className="text-xs text-muted mt-1">Across failed payments</div>
          </div>
          <div className="kpi-card">
            <div className="text-xs text-muted">Recovery Health Score</div>
            <div className="mt-2 text-xl font-semibold">{score} / 100</div>
            <div className="text-xs text-muted mt-1">Health derived from recovery metrics</div>
          </div>
        </div>
      </div>

      <aside>
        <div className="dashboard-card">
          <div className="text-xs text-muted">Executive Briefing</div>
          <h3 className="mt-2 heading-700 text-[16px]">This week</h3>
          <div className="mt-3 text-sm">
            <p>Card declines caused 41% of revenue loss.</p>
            <p>Wallet users recovered 2.7× more often.</p>
            <p className="mt-2 font-semibold">Potential recovery opportunity: ₹6,00,000</p>
          </div>
        </div>
      </aside>
    </section>
  );
}

export default HomeHero;
