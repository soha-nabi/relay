'use client';

import React, { useState } from 'react';
import {
  Menu, LayoutDashboard, Zap, Mic2, Users,
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
import RelayHero from './RelayHero';
import { PageHeader } from './ui/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import type { CustomerProfile, DashboardData } from '@/types';

interface Props {
  dashboard?: DashboardData;
  onRefreshData?: () => void;
}

type TabId = 'overview' | 'recovery' | 'customers' | 'recoveries' | 'automations' | 'agent' | 'performance' | 'settings';

export default function MerchantShell({ dashboard, onRefreshData }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | undefined>();
  const [paySessionId, setPaySessionId] = useState<string>('');

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',     label: 'Overview',        icon: <LayoutDashboard size={15} /> },
    { id: 'recovery',    label: 'Recovery Intel',   icon: <Zap size={15} /> },
    { id: 'agent',       label: 'AI Voice Agent',   icon: <Mic2 size={15} /> },
    { id: 'customers',   label: 'Customers',        icon: <Users size={15} /> },
    { id: 'recoveries',  label: 'Recoveries',       icon: <CreditCard size={15} /> },
    { id: 'automations', label: 'Automations',      icon: <Settings2 size={15} /> },
    { id: 'performance', label: 'Performance',      icon: <BarChart3 size={15} /> },
    { id: 'settings',    label: 'Testing & Logs',   icon: <FlaskConical size={15} /> },
  ];

  const handleTabClick = (tabId: TabId, e: React.MouseEvent<HTMLButtonElement>) => {
    setActiveTab(tabId);
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const drawerItems = tabs.map(t => ({ id: t.id, label: t.label, icon: t.icon }));

  return (
    <div className="w-full flex flex-col min-w-0 pb-16">

      <MobileDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        navItems={drawerItems}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as TabId)}
        title="Merchant Console"
      />

      {/* ── Single Consolidated Tab Bar (No duplicate mobile header!) ─── */}
      <nav
        aria-label="Merchant navigation"
        className="sticky top-[56px] z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-xs"
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-2 py-2">
            <div
              className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5"
              role="tablist"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`merchant-nav-${tab.id}`}
                    role="tab"
                    aria-selected={isActive}
                    onClick={(e) => handleTabClick(tab.id, e)}
                    className={[
                      'inline-flex shrink-0 items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-[13px] font-semibold transition-all duration-200 whitespace-nowrap',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
                    ].join(' ')}
                    style={{ minHeight: '38px' }}
                  >
                    <span aria-hidden>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile menu drawer trigger */}
            <button
              onClick={() => setMenuOpen(true)}
              className="md:hidden shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
              aria-label="All Navigation Tabs"
              aria-expanded={menuOpen}
            >
              <Menu size={16} />
              <span className="text-xs font-semibold">Tabs</span>
            </button>
          </div>
        </div>
      </nav>

      {/* ── 1. OVERVIEW ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-0">
          {/* Hero — contained ONLY on Overview */}
          <RelayHero
            dashboard={dashboard}
            onNavigate={(section) => {
              if (section === 'recoveries') setActiveTab('recoveries');
              else if (section === 'automations') setActiveTab('automations');
            }}
          />

          {/* Dashboard body */}
          <div className="mt-6 flex flex-col gap-6">
            <MerchantOverview
              dashboard={dashboard}
              onNavigate={(section) => {
                if (section === 'recovery') setActiveTab('recovery');
                else if (section === 'automations') setActiveTab('automations');
                else if (section === 'customer') setActiveTab('customers');
              }}
            />

            {/* Recovery Opportunities + Live Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1.2fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Recovery Opportunities</CardTitle>
                </CardHeader>
                <CardContent>
                  <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Live Activity Stream</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiveActivityFeed />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. RECOVERY INTELLIGENCE ────────────────────────────────────── */}
      {activeTab === 'recovery' && (
        <div className="flex flex-col gap-6 mt-6">
          <PageHeader
            eyebrow="Diagnostic Engine"
            title="Recovery Intelligence & Workflows"
            description="Machine-learning root cause failure diagnosis, algorithmic strategy selection, and automated recovery orchestration."
          />

          <RecoveryWorkflow
            onOpenCustomerPayment={(sid) => {
              setPaySessionId(sid);
              setActiveTab('recoveries');
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Prioritized Recovery Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recovery Simulator</CardTitle>
              </CardHeader>
              <CardContent>
                <RecoverySimulator />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── 3. CUSTOMERS ────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="flex flex-col gap-6 mt-6">
          <CustomerIntelligence
            onProfile={(p) => setSelectedProfile(p)}
            onStartRecovery={(cid) => {
              setActiveTab('recovery');
            }}
          />
        </div>
      )}

      {/* ── 4. RECOVERIES / CHECKOUT ─────────────────────────────────────── */}
      {activeTab === 'recoveries' && (
        <div className="mt-6">
          <CustomerPaymentExperience sessionId={paySessionId} />
        </div>
      )}

      {/* ── 5. AUTOMATIONS ──────────────────────────────────────────────── */}
      {activeTab === 'automations' && (
        <div className="mt-6">
          <PageHeader
            eyebrow="Workflow Studio"
            title="Autonomous Recovery Automations"
            description="Construct trigger rules that initiate immediate multi-channel recovery upon payment failure and terminate on resolution."
          />
          <AutomationsCenter />
        </div>
      )}

      {/* ── 6. AI VOICE AGENT ───────────────────────────────────────────── */}
      {activeTab === 'agent' && (
        <div className="mt-6 flex flex-col gap-6">
          <PageHeader
            eyebrow="Conversational AI Studio"
            title="Voice Recovery Agent"
            description="Autonomous ElevenLabs voice recovery orchestration for immediate high-value payment rescue and telephone assistance."
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
            <Card>
              <CardHeader>
                <CardTitle>Voice Agent Triage Capabilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Relay deploys conversational AI agents to contact customers immediately upon high-value transaction drop-off, diagnose bank declines in plain English, and execute real-time payment switches over the phone.
                </p>

                <div className="rounded-xl p-4 bg-slate-50 border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-900">Supported In-Call Function Calls:</h4>
                  <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
                    <li><code className="text-blue-600 font-mono">open_payment_method_selector</code> — instant switch to UPI / Alternate Card</li>
                    <li><code className="text-blue-600 font-mono">open_customer_payment_flow</code> — authorizes pending transaction checkout</li>
                    <li>Adaptive decline explanation for card limits, 3DS timeouts, and expired cards</li>
                  </ul>
                </div>

                <div className="rounded-xl p-4 bg-blue-50/60 border border-blue-200">
                  <span className="text-xs font-bold text-blue-900 block mb-1">
                    Strict Telephony Honesty Rule:
                  </span>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Voice calls are verified through ElevenLabs WebSockets. When running without live credentials, the console operates in interactive simulation mode.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div>
              <RelayVoiceAgent
                variant="floating"
                customerContext={{
                  customer_id: 'CUST000052',
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
        </div>
      )}

      {/* ── 7. PERFORMANCE / DIGITAL TWIN ───────────────────────────────── */}
      {activeTab === 'performance' && (
        <div className="mt-6 flex flex-col gap-6">
          <PageHeader
            eyebrow="Analytics & Monitoring"
            title="Recovery Performance & At-Risk Queue"
            description="Continuous machine-learning recovery metrics, root cause failure breakdown, and live at-risk transactions."
          />

          <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1.2fr] gap-6 items-start">
            <div className="flex flex-col gap-6">
              <MerchantDigitalTwin dashboard={dashboard} />
              
              <Card>
                <CardHeader>
                  <CardTitle>At-Risk Payment Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  <AtRiskTable rows={[]} />
                </CardContent>
              </Card>
            </div>

            <aside className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>AI Recovery Copilot Insights</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueCopilot dashboard={dashboard} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Leaks & Failures</CardTitle>
                </CardHeader>
                <CardContent>
                  <RevenueInsights dashboard={dashboard} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Live Activity Stream</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiveActivityFeed />
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      )}

      {/* ── 8. SETTINGS & TESTING ────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="mt-6 max-w-3xl mx-auto w-full flex flex-col gap-6">
          <PageHeader
            eyebrow="Developer Sandbox"
            title="Testing & Webhook Simulator"
            description="Trigger simulated gateway failure and capture events to test autonomous recovery pipelines in real time."
          />
          <WebhookDemoWidget onWebhookReceived={() => onRefreshData?.()} />
        </div>
      )}
    </div>
  );
}
