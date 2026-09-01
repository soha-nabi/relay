import React, { ChangeEvent, useState } from 'react';
import { Upload } from 'lucide-react';
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
  const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | undefined>();
  const [paySessionId, setPaySessionId] = useState<string>('');

  return (
    <div>
      {/* ── Merchant Tab Navigation ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', background: 'white', padding: '6px', borderRadius: '16px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'recovery', label: 'Recovery Intelligence' },
          { id: 'agent', label: '🎙️ AI Voice Agent' },
          { id: 'customers', label: 'Customers' },
          { id: 'recoveries', label: 'Recoveries' },
          { id: 'automations', label: 'Automations' },
          { id: 'performance', label: 'Performance' },
          { id: 'settings', label: 'Settings & Testing' },
        ].map((tab) => (
          <button
            key={tab.id}
            id={`merchant-nav-${tab.id}`}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === tab.id ? '#0f172a' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748b',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
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
          <div style={{ marginTop: '48px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
            <LiveActivityFeed />
          </div>
        </div>
      )}

      {/* ── 2. RECOVERY INTELLIGENCE ────────────────────────────────────── */}
      {activeTab === 'recovery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <RecoveryWorkflow
            onOpenCustomerPayment={(sid) => {
              setPaySessionId(sid);
              setActiveTab('recoveries');
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <RecoveryOpportunities opportunities={dashboard?.recommendations || []} />
            <RecoverySimulator />
          </div>
        </div>
      )}

      {/* ── 3. CUSTOMERS ────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <div>
            <div style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ElevenLabs Conversational AI
              </span>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '6px 0 10px' }}>
                Voice Recovery Agent Studio
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: 0 }}>
                Relay uses autonomous ElevenLabs voice agents to reach out to customers immediately upon high-value transaction failure, troubleshoot the decline reason, and execute instant payment method fallbacks.
              </p>

              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    Click <strong>Start Voice Recovery Agent</strong> on the right to simulate a real customer recovery dialogue.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <RelayVoiceAgent
              variant="card"
              defaultOpen={true}
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
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
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
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
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
