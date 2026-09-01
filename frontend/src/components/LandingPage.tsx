import { motion } from 'framer-motion';
import { Upload, ChevronRight, TrendingUp, Percent, CreditCard, Activity, Wallet, Clock, Target, CheckCircle2, Rocket, ArrowUpCircle, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

export function LandingPage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <main className="mx-auto container-max">
      {/* SECTION 1: Hero */}
      <section id="home" className="hero-gradient landing-hero relative overflow-hidden">
        
        {/* Animated Background Blobs */}
        <motion.div
          className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-300 rounded-full mix-blend-multiply filter blur-[120px] opacity-50 pointer-events-none z-0"
          animate={{
            x: mousePosition.x * 0.15,
            y: mousePosition.y * 0.15,
          }}
          transition={{ type: "tween", ease: "easeOut", duration: 1 }}
        />
        <motion.div
          className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-blue-300 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 pointer-events-none z-0"
          animate={{
            x: mousePosition.x * -0.1,
            y: mousePosition.y * -0.1,
          }}
          transition={{ type: "tween", ease: "easeOut", duration: 1.5 }}
        />
        <motion.div
          className="absolute bottom-[-20%] left-[30%] w-[400px] h-[400px] bg-pink-200 rounded-full mix-blend-multiply filter blur-[100px] opacity-40 pointer-events-none z-0"
          animate={{
            x: mousePosition.x * 0.05,
            y: mousePosition.y * 0.2,
          }}
          transition={{ type: "tween", ease: "easeOut", duration: 1.2 }}
        />

        <div className="landing-copy relative z-10">
          <div>
            <div className="hero-headline" style={{ fontSize: '64px', color: '#0F172A', marginTop: 0 }}>
              Relay
            </div>
            <div className="text-2xl font-bold text-slate-600 mt-2">Revenue Recovery Operating System</div>
            <div className="hero-sub text-lg mt-4">
              AI identifies revenue leaks, predicts recovery opportunities,<br/>
              and recommends actions that recover revenue.
            </div>
          </div>

          <div className="hero-ctas flex gap-3 mt-8">
            <button className="action-button flex items-center gap-2" style={{ backgroundColor: '#1D4ED8', color: 'white', padding: '12px 24px', fontSize: '15px' }}>
              <Upload size={18} /> Upload Data
            </button>
            <button className="ghost-outline flex items-center gap-2" style={{ backgroundColor: 'white', padding: '12px 24px', fontSize: '15px' }}>
              View Intelligence <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <motion.div className="glass-card card-pad hero-right-card system-status" style={{ backgroundColor: 'white' }} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <div className="card-head mb-4">
            <div className="font-bold text-ink text-base">System Status</div>
          </div>

          <div className="status-row py-3">
            <div className="status-label text-sm"><div className="icon-bg-blue p-1 rounded-md bg-blue-50 text-blue-500 mr-2"><Activity size={14}/></div> Connected Sources</div>
            <div className="status-value text-sm">3</div>
          </div>

          <div className="status-row py-3">
            <div className="status-label text-sm"><div className="icon-bg-green p-1 rounded-md bg-green-50 text-green-500 mr-2"><TrendingUp size={14}/></div> Recovery Score</div>
            <div className="status-value text-sm">72</div>
          </div>

          <div className="status-row py-3">
            <div className="status-label text-sm"><div className="icon-bg-green p-1 rounded-md bg-green-50 text-green-500 mr-2"><CheckCircle2 size={14}/></div> Data Status</div>
            <div className="text-sm font-medium text-green-500">Up to date</div>
          </div>
        </motion.div>
      </section>

      {/* SECTION 2: KPI row */}
      <section className="section">
        <div className="grid grid-cols-4 gap-4">
          <div className="glass-card card-pad flex items-start gap-4 p-6 bg-white">
            <div className="icon-bg-blue rounded-xl p-3 bg-blue-50 text-blue-600">
              <TrendingUp size={24} />
            </div>
            <div>
              <div className="text-sm text-muted font-medium">Revenue At Risk</div>
              <div className="mt-1 text-2xl font-bold">₹23,52,972</div>
              <div className="mt-1 text-xs font-semibold text-blue-600">+12.4% vs last 7 days</div>
            </div>
          </div>
          <div className="glass-card card-pad flex items-start gap-4 p-6 bg-white">
            <div className="icon-bg-green rounded-xl p-3 bg-green-50 text-green-600">
              <Percent size={24} />
            </div>
            <div>
              <div className="text-sm text-muted font-medium">Recovery Rate</div>
              <div className="mt-1 text-2xl font-bold">15.1%</div>
              <div className="mt-1 text-xs font-semibold text-green-600">+2.3% vs last 7 days</div>
            </div>
          </div>
          <div className="glass-card card-pad flex items-start gap-4 p-6 bg-white">
            <div className="icon-bg-orange rounded-xl p-3 bg-amber-50 text-amber-500">
              <CreditCard size={24} />
            </div>
            <div>
              <div className="text-sm text-muted font-medium">Failed Payments</div>
              <div className="mt-1 text-2xl font-bold">1,286</div>
              <div className="mt-1 text-xs font-semibold text-green-600">-8.7% vs last 7 days</div>
            </div>
          </div>
          <div className="glass-card card-pad flex items-start gap-4 p-6 bg-white">
            <div className="icon-bg-purple rounded-xl p-3 bg-purple-50 text-purple-600">
              <Activity size={24} />
            </div>
            <div>
              <div className="text-sm text-muted font-medium">Recovered Revenue</div>
              <div className="mt-1 text-2xl font-bold">₹4,18,288</div>
              <div className="mt-1 text-xs font-semibold text-blue-600">+18.6% vs last 7 days</div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Three-column grid */}
      <section className="section">
        <div className="grid grid-cols-3 gap-6">
          
          {/* AI Executive Brief */}
          <div className="glass-card card-pad bg-white p-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="text-blue-600"><Rocket size={20} /></div>
              <h3 className="text-lg font-bold">AI Executive Brief</h3>
            </div>
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-slate-400"><CreditCard size={18} /></div>
                <div className="text-sm text-slate-700">Card declines caused <strong>41%</strong> of revenue loss.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-slate-400"><Wallet size={18} /></div>
                <div className="text-sm text-slate-700">Wallet users recovered <strong>2.7x</strong> more often.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-slate-400"><Clock size={18} /></div>
                <div className="text-sm text-slate-700">Evening retries perform <strong>18%</strong> better.</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-blue-600"><Target size={18} /></div>
                <div className="text-sm font-medium text-slate-800">Potential additional recovery: ₹6,00,000</div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="glass-card card-pad bg-white p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Recent Activity</h3>
              <a href="#" className="text-sm font-medium text-blue-600 hover:underline">View all</a>
            </div>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-1.5 bg-green-50 text-green-600"><CheckCircle2 size={16} /></div>
                  <div className="text-sm text-slate-700">Recovered ₹12,000 via retries</div>
                </div>
                <div className="text-xs text-slate-400">2m ago</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-1.5 bg-purple-50 text-purple-600"><Rocket size={16} /></div>
                  <div className="text-sm text-slate-700 font-medium">Wallet recovery campaign launched</div>
                </div>
                <div className="text-xs text-slate-400">18m ago</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-1.5 bg-amber-50 text-amber-500"><ArrowUpCircle size={16} /></div>
                  <div className="text-sm text-slate-700">Recovery score increased by 2.1</div>
                </div>
                <div className="text-xs text-slate-400">1h ago</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-full p-1.5 bg-blue-50 text-blue-600"><Users size={16} /></div>
                  <div className="text-sm text-slate-700">18 customers recovered</div>
                </div>
                <div className="text-xs text-slate-400">2h ago</div>
              </div>
            </div>
          </div>

          {/* Featured Opportunity */}
          <div className="glass-card card-pad bg-white p-6 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Featured Opportunity</h3>
              <a href="#" className="text-sm font-medium text-blue-600 hover:underline">View all</a>
            </div>
            <div className="opportunity-card p-5 rounded-2xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-slate-900">Wallet Fallback</div>
                  <div className="badge-purple">High Impact</div>
                </div>
                <div className="text-sm text-slate-600 leading-relaxed mb-4">
                  Recover revenue from customers who have saved cards but paid via other methods.
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-2xl font-bold text-slate-900">+₹3.4L</div>
                  <div className="text-xs text-slate-500 mt-1">Potential Recovery</div>
                </div>
                <button className="bg-white border border-slate-200 text-slate-800 text-sm font-semibold py-2 px-4 rounded-lg flex items-center gap-2 hover:bg-slate-50 shadow-sm">
                  View Opportunity <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

    </main>
  );
}

export default LandingPage;
