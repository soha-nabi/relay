import React, { ChangeEvent, useState } from 'react';
import {
  Upload, Menu, LayoutDashboard, Zap, Mic2, Users,
  CreditCard, Settings2, BarChart3, FlaskConical,
} from 'lucide-react';
import MobileDrawer from './MobileDrawer';
import MerchantOverview from './MerchantOverview';
import RecoveryWorkflow from './RecoveryWorkflow';
import AutomationsCenter from './AutomationsCenter';
import CustomerPaymentExperience from './CustomerPaymentExperience';
import WebhookDemoWidget from './WebhookDemoWidget';
import MerchantDigitalTwin from './MerchantDigitalTwin';
import RevenueCopilot from './RevenueCopilot';
import RevenueInsights from './RevenueInsights';
import RecoveryOpportunities from './RecoveryOpportunities';
import RecoverySimulator from './RecoverySimulator';
import AtRiskTable from './AtRiskTable';
import LiveActivityFeed from './LiveActivityFeed';
import { CustomerIntelligence } from './CustomerIntelligence';
import RelayVoiceAgent from './RelayVoiceAgent';
import type { CustomerProfile, DashboardData } from '../types';

interface Props {
  dashboard?: DashboardData;
  onRefreshData?: () => void;
}

export default function MerchantShell({ dashboard, onRefreshData }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'recovery' | 'customers' | 'recoveries' | 'automations' | 'agent' | 'performance' | 'settings'>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | undefined>();
  const [paySessionId, setPaySessionId] = useState<string>('');

  const tabs = [
    { id: 'overview',    label: 'Overview',       icon: <LayoutDashboard size={15} /> },
    { id: 'recovery',   label: 'Recovery Intel',  icon: <Zap size={15} /> },
    { id: 'agent',      label: 'AI Voice Agent',  icon: <Mic2 size={15} /> },
    { id: 'customers',  label: 'Customers',       icon: <Users size={15} /> },
    { id: 'recoveries', label: 'Recoveries',      icon: <CreditCard size={15} /> },
    { id: 'automations',label: 'Automations',     icon: <Settings2 size={15} /> },
    { id: 'performance',label: 'Performance',     icon: <BarChart3 size={15} /> },
    { id: 'settings',   label: 'Testing & Logs',  icon: <FlaskConical size={15} /> },
  ];

  const handleTabClick = (tabId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setActiveTab(tabId as any);
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const drawerItems = tabs.map(t => ({ id: t.id, label: t.label, icon: t.icon }));

  return (
    <div className="w-full flex flex-col min-w-0 pb-16">

      {/* ── Mobile-only Header (hamburger) ─────────────────────────────────── */}
      <header className="mobile-header md:hidden">
        <span className="mobile-header-logo">Relay</span>
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <Menu size={20} />
        </button>
      </header>

      <MobileDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        navItems={drawerItems}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as any)}
        title="Merchant"
      />

      {/* ── Sticky Swipeable Tab Navigation (desktop: md+) ──────────────── */}
      <div className="hidden md:block sticky top-[64px] z-30 pt-2 pb-3 mb-6 sm:mb-8 bg-slate-50/95 backdrop-blur-xl border-b border-slate-200/60 shadow-sm -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="swipeable-tabs bg-white p-1 rounded-2xl border border-slate-200 shadow-sm">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`merchant-nav-${tab.id}`}
                onClick={(e) => handleTabClick(tab.id, e)}
                className={`swipe-item inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] sm:text-sm font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md transform scale-[1.02]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                style={{
                  minHeight: '44px',
                  whiteSpace: 'nowrap',
                  touchAction: 'pan-x pan-y',
                }}
              >
                <span className="nav-tab-icon">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 1. OVERVIEW ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          <MerchantOverview
            dashboard={dashboard}
            onNavigate={(section) => {
              if (section === 'recovery') setActiveTab('recovery');
              else if (section === 'automations') setActiveTab('automations');
              else if (section === 'customer') setActiveTab('customers');
            }}
          />
          {/* Top Opportunities preview */}
          <div className="mt-8 sm:mt-12 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
            <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
            <LiveActivityFeed />
          </div>
        </div>
      )}

      {/* ── 2. RECOVERY INTELLIGENCE ────────────────────────────────────── */}
      {activeTab === 'recovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <RecoveryWorkflow
            onOpenCustomerPayment={(sid) => {
              setPaySessionId(sid);
              setActiveTab('recoveries');
            }}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
            <RecoverySimulator />
          </div>
        </div>
      )}

      {/* ── 3. CUSTOMERS ────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <CustomerIntelligence onProfile={(p) => setSelectedProfile(p)} />
          {selectedProfile && (
            <RecoveryWorkflow
              onOpenCustomerPayment={(sid) => {
                setPaySessionId(sid);
                setActiveTab('recoveries');
              }}
            />
          )}
        </div>
      )}

      {/* ── 4. RECOVERIES / CHECKOUT DEMO ───────────────────────────────── */}
      {activeTab === 'recoveries' && (
        <div>
          <CustomerPaymentExperience sessionId={paySessionId} />
        </div>
      )}

      {/* ── 5. AUTOMATIONS ──────────────────────────────────────────────── */}
      {activeTab === 'automations' && (
        <div>
          <AutomationsCenter />
        </div>
      )}

      {/* ── AI VOICE AGENT STUDIO ───────────────────────────────────────── */}
      {activeTab === 'agent' && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 lg:gap-8 min-h-[80vh] overflow-x-hidden">
          <div>
            <div style={{ background: 'white', borderRadius: '24px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '24px' }} className="sm:p-8">
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ElevenLabs Conversational AI
              </span>
              <h2 style={{ fontSize: 'clamp(20px, 4vw, 24px)', fontWeight: 800, color: '#0f172a', margin: '6px 0 10px' }}>
                Voice Recovery Agent Studio
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                Relay uses autonomous ElevenLabs voice agents to reach out to customers immediately upon high-value transaction failure, troubleshoot the decline reason, and execute instant payment method fallbacks.
              </p>

              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Agent Tooling Capabilities</h4>
                  <ul style={{ fontSize: '12px', color: '#64748b', margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                    <li><code>open_payment_method_selector</code>: Dynamically switches the customer to UPI / Alternate Card</li>
                    <li><code>open_customer_payment_flow</code>: Completes and verifies the pending transaction in real time</li>
                    <li>Adaptive decline explanation for Insufficient Funds, 3DS Auth Timeouts, and Expired Cards</li>
                  </ul>
                </div>

                <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '14px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>
                    🎙️ Test Live Conversation
                  </div>
                  <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.5 }}>
                    Click <strong>Start Voice Recovery Agent</strong> to simulate a real customer recovery dialogue.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <RelayVoiceAgent
              variant="floating"
              customerContext={{
                customer_id: 'CUST_94821',
                customer_name: 'Aditya Sharma',
                amount: 3499.00,
                failure_reason: 'Card Limit Exceeded / Bank Timeout',
                recovery_session_id: 'REC_DEMO_01',
              }}
              onSelectMethod={(m) => alert(`Agent triggered method switch to: ${m}`)}
              onPayNow={() => alert('Agent triggered instant payment authorization!')}
            />
          </div>
        </div>
      )}

      {/* ── 6. PERFORMANCE / DIGITAL TWIN ───────────────────────────────── */}
      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          <div>
            <MerchantDigitalTwin dashboard={dashboard} />
            <div style={{ marginTop: '24px' }}>
              <AtRiskTable rows={[]} />
            </div>
          </div>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <RevenueCopilot />
            <RevenueInsights dashboard={dashboard} />
            <LiveActivityFeed />
          </aside>
        </div>
      )}

      {/* ── 7. SETTINGS & TESTING ───────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%' }}>
          <WebhookDemoWidget
            onWebhookReceived={() => {
              onRefreshData?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
