import React, { useState } from 'react';
import {
  Mic,
  PhoneOff,
  Loader2,
  AlertCircle,
  Sparkles,
  X,
  Bot,
  Smartphone,
  CreditCard,
  Zap,
} from 'lucide-react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
} from '@elevenlabs/react';

export interface CustomerContext {
  customer_id?: string;
  recovery_session_id?: string;
  customer_name?: string;
  amount?: number;
  failure_reason?: string;
}

interface Props {
  customerContext?: CustomerContext;
  onSelectMethod?: (methodType: string) => void;
  onPayNow?: () => void;
  variant?: 'inline' | 'floating' | 'card';
  defaultOpen?: boolean;
}

// ─── Inner component (must live inside <ConversationProvider>) ────────────────

function RelayVoiceAgentInner({
  customerContext = {},
  onSelectMethod,
  onPayNow,
  variant = 'inline',
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState<boolean>(false);

  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  const requestMicrophoneAndStart = async () => {
    try {
      setError(null);
      await navigator.mediaDevices.getUserMedia({ audio: true });

      await startSession({
        onConnect: () => setError(null),
        onError: (message: string) => {
          console.error('Recovery Copilot Error:', message);
          setError(message || 'An error occurred during the voice conversation.');
        },
        dynamicVariables: {
          customer_id: customerContext.customer_id || 'CUST_DEMO',
          recovery_session_id: customerContext.recovery_session_id || 'SES_DEMO',
          customer_name: customerContext.customer_name || 'Customer',
          amount: customerContext.amount ? String(customerContext.amount) : '1500',
        },
        clientTools: {
          open_payment_method_selector: (params: { method: string }) => {
            if (onSelectMethod && params.method) onSelectMethod(params.method);
          },
          open_customer_payment_flow: () => {
            if (onPayNow) onPayNow();
          },
        },
      });
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Microphone access was denied. Please allow microphone permissions in your browser.');
      } else {
        setError(
          err.message ||
            'Could not connect to voice recovery agent. Showing interactive recovery demo mode.',
        );
        setDemoActive(true);
      }
    }
  };

  const endConversation = async () => {
    try {
      await endSession();
    } catch (err) {
      console.error('Error ending conversation:', err);
    }
    setDemoActive(false);
  };

  return (
    <div
      style={{
        background: 'white',
        borderRadius: '24px',
        padding: '20px',
        border: '1px solid #e2e8f0',
        boxShadow:
          variant === 'floating'
            ? '0 20px 40px -15px rgba(15,23,42,0.25)'
            : '0 4px 20px rgba(15,23,42,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minWidth: 0,
        width: '100%',
        maxWidth: variant === 'floating' ? '400px' : '100%',
        position: 'relative',
      }}
      className="p-4 sm:p-6"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0B1533 0%, #1e293b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(11, 21, 51, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} style={{ color: '#60a5fa' }} />
            <span
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #ffffff',
              }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0B1533', margin: 0, letterSpacing: '-0.02em' }}>
                Recovery Copilot
              </h3>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#16a34a',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22c55e' }} />
                AI Ready
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0', fontWeight: 500 }}>
              {status === 'connecting' ? 'Connecting to voice session...' : 'AI-powered recovery assistant'}
            </p>
          </div>
        </div>
        {status === 'connected' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '999px',
              padding: '4px 10px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isSpeaking ? '#2563eb' : '#16a34a',
                boxShadow: isSpeaking ? '0 0 10px #2563eb' : '0 0 6px #16a34a',
                animation: 'pulse 1.5s infinite',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534' }}>
              {isSpeaking ? 'Agent Speaking' : 'Listening…'}
            </span>
          </div>
        )}
      </div>

      {/* Customer Context Chip */}
      {(customerContext.customer_id || customerContext.amount) && (
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '10px 14px',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            color: '#475569',
          }}
        >
          <div>
            <span style={{ color: '#94a3b8' }}>Target: </span>
            <strong style={{ color: '#0f172a' }}>
              {customerContext.customer_name || customerContext.customer_id}
            </strong>
          </div>
          {customerContext.amount && (
            <div>
              <span style={{ color: '#94a3b8' }}>Amount: </span>
              <strong style={{ color: '#2563eb' }}>₹{customerContext.amount}</strong>
            </div>
          )}
        </div>
      )}

      {/* Visualizer Wave when active */}
      {(status === 'connected' || demoActive) && (
        <div
          style={{
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}>
            {[40, 70, 30, 90, 50, 80, 45, 65, 95, 35].map((h, i) => (
              <span
                key={i}
                style={{
                  width: '4px',
                  height: `${isSpeaking || demoActive ? h : 15}%`,
                  background: isSpeaking ? '#2563eb' : '#7c3aed',
                  borderRadius: '999px',
                  transition: 'height 0.15s ease',
                  animation:
                    isSpeaking || demoActive
                      ? `wave 0.8s ease-in-out infinite alternate ${i * 0.1}s`
                      : 'none',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: '12px', color: '#475569', textAlign: 'center', margin: 0, lineHeight: 1.4 }}>
            {isSpeaking
              ? 'Agent is speaking with customer...'
              : 'Speaking enabled. Say "Switch to UPI" or "Complete payment".'}
          </p>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '12px',
            color: '#b91c1c',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>{error}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px' }}>
        {status === 'disconnected' && !demoActive ? (
          <button
            onClick={requestMicrophoneAndStart}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              padding: '14px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 4px 14px rgba(15,23,42,0.15)',
              transition: 'all 0.15s ease',
            }}
            aria-label="Start Recovery Call"
          >
            <Mic size={18} style={{ color: '#60a5fa' }} />
            Start Recovery Call
          </button>
        ) : status === 'connecting' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '14px',
              background: '#f1f5f9',
              borderRadius: '14px',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Connecting to Recovery Copilot...
          </div>
        ) : (
          <button
            onClick={endConversation}
            style={{
              flex: 1,
              background: '#fef2f2',
              color: '#ef4444',
              border: '1px solid #fecaca',
              borderRadius: '14px',
              padding: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
            aria-label="End conversation"
          >
            <PhoneOff size={16} /> End Agent Session
          </button>
        )}
      </div>

      {/* Quick Trigger Tool Shortcuts */}
      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
        <p
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            margin: '0 0 8px',
          }}
        >
          Agent Trigger Tools
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Switch to UPI', icon: <Smartphone size={12} />, action: () => onSelectMethod?.('UPI') },
            { label: 'Switch to Card', icon: <CreditCard size={12} />, action: () => onSelectMethod?.('Card') },
            { label: 'Trigger Payment', icon: <Zap size={12} />, action: () => onPayNow?.(), green: true },
          ].map(({ label, icon, action, green }) => (
            <button
              key={label}
              onClick={action}
              style={{
                background: green ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${green ? '#bbf7d0' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: green ? '#166534' : '#334155',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes wave { 0% { height: 15%; } 100% { height: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Outer component: each instance owns its ConversationProvider ─────────────

export default function RelayVoiceAgent({
  customerContext = {},
  onSelectMethod,
  onPayNow,
  variant = 'inline',
  defaultOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  const agentId =
    (import.meta as any).env?.VITE_ELEVENLABS_AGENT_ID ||
    'agent_3701m1mhkvthfj8trka6n1vt436k';

  const inner = (
    <ConversationProvider agentId={agentId}>
      <RelayVoiceAgentInner
        customerContext={customerContext}
        onSelectMethod={onSelectMethod}
        onPayNow={onPayNow}
        variant={variant}
      />
    </ConversationProvider>
  );

  if (variant === 'floating') {
    return (
      <div className="floating-agent-container">
        {isOpen ? (
          <>
            {/* Mobile Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9998] sm:hidden bottom-sheet-backdrop"
              onClick={() => setIsOpen(false)}
            />

            {/* Mobile Bottom Sheet (<640px) / Desktop Floating Card (>=640px) */}
            <div className="fixed inset-x-0 bottom-0 z-[9999] sm:inset-auto sm:bottom-6 sm:right-6 sm:max-w-[420px] w-full bottom-sheet-content">
              <div className="bg-white rounded-t-[28px] sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[88vh] sm:max-h-[85vh] flex flex-col">
                {/* Mobile Pull Handle Bar */}
                <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                {/* Close Button Header */}
                <div className="px-4 sm:px-6 pt-2 pb-0 flex items-center justify-between">
                  <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                    Recovery Copilot
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                    aria-label="Close Voice Agent"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Scrollable Agent Body */}
                <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-60px)]">
                  {inner}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999]">
            <button
              onClick={() => setIsOpen(true)}
              id="btn-floating-voice-agent"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '999px',
                padding: '12px 18px',
                minHeight: '48px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 12px 30px -5px rgba(15,23,42,0.35)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
              aria-label="Open Recovery Copilot"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Mic size={18} style={{ color: '#93c5fd' }} />
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '2px solid #0f172a',
                  }}
                />
              </div>
              <span className="hidden xs:inline sm:inline">Talk to Recovery Copilot</span>
              <span className="inline xs:hidden sm:hidden">Recovery Copilot</span>
              <Sparkles size={14} style={{ color: '#fbbf24' }} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return inner;
}
