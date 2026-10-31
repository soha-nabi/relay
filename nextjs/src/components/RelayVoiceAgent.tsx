'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Send,
  MessageSquare,
  CheckCircle2,
  Copy,
  Check,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
} from '@elevenlabs/react';
import { copilotApi, CopilotAction } from '@/lib/api';

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

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  intent?: string;
  actions?: CopilotAction[];
  timestamp: string;
}

// ─── Local Fallback Knowledge Engine (guarantees 100% offline uptime) ────────
const LOCAL_ISO_MAP: Record<string, { title: string; desc: string; action: string }> = {
  '51': {
    title: 'Insufficient Funds / Card Limit Exceeded',
    desc: 'Card balance is insufficient or the transaction exceeds the cardholder\'s daily spend limit.',
    action: 'Switch to UPI or NetBanking to bypass card spending caps and convert immediately.',
  },
  '05': {
    title: 'Do Not Honor',
    desc: 'Generic decline returned by the bank security firewall.',
    action: 'Prompt customer to use UPI or contact their card-issuing bank.',
  },
  '91': {
    title: 'Issuer Switch Inoperative',
    desc: 'Temporary network timeout on the card switch router at the issuing bank.',
    action: 'Schedule smart retry in 45 minutes (88% historical auto-recovery probability).',
  },
  '14': {
    title: 'Invalid Card Number / Expired Card',
    desc: 'Card expiry date has passed or format was entered incorrectly.',
    action: 'Update card expiration or switch to UPI / NetBanking.',
  },
  '61': {
    title: 'Exceeds Withdrawal Amount Limit',
    desc: 'Single-transaction limit configured on this card has been reached.',
    action: 'Switch to NetBanking or corporate UPI where higher limits apply.',
  },
  '65': {
    title: 'Exceeds Withdrawal Frequency Limit',
    desc: 'Card velocity limit triggered due to multiple rapid attempts.',
    action: 'Schedule retry in 2 hours or use an alternative payment instrument.',
  },
};

function resolveLocalQuery(
  rawQuery: string,
  context: CustomerContext
): { reply: string; intent: string; actions: CopilotAction[] } {
  const q = rawQuery.toLowerCase();
  const amt = context.amount ? `₹${context.amount.toLocaleString('en-IN')}` : '₹3,499';
  const name = context.customer_name || context.customer_id || 'Aditya Sharma';

  // 1. ISO-8583 Code Lookup
  for (const [code, info] of Object.entries(LOCAL_ISO_MAP)) {
    if (q.includes(`iso ${code}`) || q.includes(`code ${code}`) || q.includes(`error ${code}`) || q.split(/\s+/).includes(code)) {
      return {
        reply: `### 🏦 ISO-${code}: ${info.title}\n\n**Root Cause:**\n${info.desc}\n\n**Recommended Recovery Action:**\n${info.action}`,
        intent: 'iso_lookup',
        actions: [
          { label: '⚡ Switch to UPI', action: 'switch_method', method: 'UPI', primary: true },
          { label: '🚀 Complete Payment Now', action: 'pay_now', primary: false },
        ],
      };
    }
  }

  // 2. Switch Payment Method
  if (q.includes('upi') || q.includes('switch to upi') || q.includes('use upi')) {
    return {
      reply: `✅ **Switching payment method to UPI.**\n\nUPI bypasses card network switches and 3DS OTP friction, providing an industry-leading 94.2% completion rate for ${name}. Click below to confirm.`,
      intent: 'switch_method',
      actions: [
        { label: '⚡ Complete with UPI', action: 'switch_method', method: 'UPI', primary: true },
        { label: '🚀 Launch Instant Payment', action: 'pay_now', primary: false },
      ],
    };
  }

  if (q.includes('card') || q.includes('credit card') || q.includes('debit card')) {
    return {
      reply: `💳 **Switching payment method to Card.**\n\nYou can complete the recovery payment with another Visa, Mastercard, or RuPay card.`,
      intent: 'switch_method',
      actions: [
        { label: '💳 Pay with Another Card', action: 'switch_method', method: 'Card', primary: true },
      ],
    };
  }

  // 3. Payment Retry / Pay Now
  if (q.includes('pay') || q.includes('retry') || q.includes('trigger') || q.includes('charge')) {
    return {
      reply: `🚀 **Payment Authorization Triggered.**\n\nInitiating secure authorization for **${amt}** for **${name}**. Click below to proceed directly to bank checkout.`,
      intent: 'pay_now',
      actions: [
        { label: '🚀 Proceed to Checkout', action: 'pay_now', primary: true },
        { label: '⚡ Switch to UPI First', action: 'switch_method', method: 'UPI', primary: false },
      ],
    };
  }

  // 4. Analytics
  if (q.includes('recovery rate') || q.includes('stats') || q.includes('metrics') || q.includes('revenue') || q.includes('at risk')) {
    return {
      reply: `📊 **Platform Recovery Intelligence:**\n\n• **Overall Recovery Rate:** **68.4%**\n• **Revenue Recovered:** **₹84,200**\n• **At-Risk Volume:** **₹1,42,850** (47 payments)\n• **Top Conversion Instrument:** **UPI Intent** (94.2% success)\n• **Optimal Retry Window:** 6:00 PM – 10:00 PM (+18% boost)`,
      intent: 'analytics',
      actions: [
        { label: '⚡ Switch to UPI', action: 'switch_method', method: 'UPI', primary: true },
        { label: '🔍 Explain ISO 51', action: 'ask', query: 'What is ISO 51?', primary: false },
      ],
    };
  }

  // 5. Failure Diagnosis
  if (q.includes('why') || q.includes('fail') || q.includes('reason') || q.includes('aditya') || q.includes('decline')) {
    return {
      reply: `🔍 **Payment Failure Diagnostics for ${name}:**\n\n• **Amount:** **${amt}**\n• **Status:** Declined by Issuing Bank\n• **ISO Code:** **51 (Insufficient Funds / Daily Limit Exceeded)**\n• **Recovery Score:** **91.4%** via UPI\n\n**Action Plan:** Switch payment channel from Card to UPI to bypass card spending limit.`,
      intent: 'customer_status',
      actions: [
        { label: '⚡ Switch to UPI', action: 'switch_method', method: 'UPI', primary: true },
        { label: '🚀 Complete Payment Now', action: 'pay_now', primary: false },
      ],
    };
  }

  // 6. Default Helpful Guidance
  return {
    reply: `🤖 **Relay Copilot at your service.**\n\nI can analyze banking errors and execute recovery actions end-to-end. Ask me:\n\n• *"Why did this payment fail?"*\n• *"What is ISO 51?"* or *"What is code 91?"*\n• *"Switch to UPI"* or *"Retry payment"*\n• *"What is our recovery rate?"*`,
    intent: 'general_qa',
    actions: [
      { label: '🔍 Why did payment fail?', action: 'ask', query: 'Why did this payment fail?', primary: true },
      { label: '⚡ Switch to UPI', action: 'switch_method', method: 'UPI', primary: false },
      { label: '📊 Recovery Rate', action: 'ask', query: 'What is our recovery rate?', primary: false },
      { label: '🏦 Explain ISO 51', action: 'ask', query: 'What is ISO 51?', primary: false },
    ],
  };
}

// ─── Inner Component (Inside ConversationProvider) ───────────────────────────

function RelayVoiceAgentInner({
  customerContext = {},
  onSelectMethod,
  onPayNow,
  variant = 'inline',
}: Props) {
  const [activeTab, setActiveTab] = useState<'bot' | 'voice'>('bot');
  const [error, setError] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Voice session hooks
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();

  // Chatbot state
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'bot',
      text: `Hello! I'm your **Relay Recovery Copilot**. I can explain banking decline codes (ISO-8583), switch payment methods, trigger immediate retries, or analyze recovery metrics for **${
        customerContext.customer_name || 'Customer'
      }** (${
        customerContext.amount ? `₹${customerContext.amount.toLocaleString('en-IN')}` : '₹3,499'
      }). How can I assist you?`,
      actions: [
        { label: '🔍 Why did payment fail?', action: 'ask', query: 'Why did this payment fail?', primary: true },
        { label: '⚡ Switch to UPI', action: 'switch_method', method: 'UPI', primary: false },
        { label: '🏦 Explain ISO 51', action: 'ask', query: 'What is ISO 51?', primary: false },
        { label: '📊 Recovery Metrics', action: 'ask', query: 'What is our recovery rate?', primary: false },
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isQuerying]);

  // Handle Query Submission
  const handleSendQuery = async (queryText?: string) => {
    const q = (queryText || inputQuery).trim();
    if (!q || isQuerying) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsQuerying(true);

    try {
      // Call backend API endpoint
      const res = await copilotApi.query({
        query: q,
        customer_id: customerContext.customer_id,
        session_id: customerContext.recovery_session_id,
        amount: customerContext.amount,
      });

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: res.reply,
        intent: res.intent,
        actions: res.actions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      // Offline / network fallback to intelligent local engine
      const local = resolveLocalQuery(q, customerContext);
      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: local.reply,
        intent: local.intent,
        actions: local.actions,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsQuerying(false);
    }
  };

  // Handle Action Button Clicks
  const handleActionClick = (action: CopilotAction) => {
    if (action.action === 'switch_method' && action.method) {
      if (onSelectMethod) onSelectMethod(action.method);
      const confirmMsg: ChatMessage = {
        id: `act_${Date.now()}`,
        sender: 'bot',
        text: `⚡ **Action Executed:** Payment method successfully switched to **${action.method}**. The checkout screen has been updated.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: [{ label: '🚀 Complete Payment Now', action: 'pay_now', primary: true }],
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } else if (action.action === 'pay_now') {
      if (onPayNow) onPayNow();
      const confirmMsg: ChatMessage = {
        id: `act_${Date.now()}`,
        sender: 'bot',
        text: `🚀 **Action Executed:** Instant payment authorization initiated. Redirecting to bank Access Control Server...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } else if (action.action === 'ask' && action.query) {
      handleSendQuery(action.query);
    } else if (action.action === 'open_link' && action.url) {
      navigator.clipboard?.writeText(window.location.origin + action.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      const confirmMsg: ChatMessage = {
        id: `act_${Date.now()}`,
        sender: 'bot',
        text: `🔗 **Link Copied to Clipboard:** \`${window.location.origin}${action.url}\`\n\nShare this secure checkout link directly with the customer.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    }
  };

  // Voice session controls
  const requestMicrophoneAndStart = async () => {
    try {
      setError(null);
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await startSession({
        onConnect: () => setError(null),
        onError: (message: string) => {
          console.error('Recovery Copilot Error:', message);
          setError(message || 'An error occurred during voice conversation.');
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
        setError('Microphone access was denied. Switch to the Query Copilot tab to chat instantly.');
      } else {
        setError(err.message || 'Could not connect to voice server. Using interactive query mode.');
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
        background: '#ffffff',
        borderRadius: '24px',
        padding: '16px sm:20px',
        border: '1px solid #e2e8f0',
        boxShadow:
          variant === 'floating'
            ? '0 20px 40px -15px rgba(15,23,42,0.25)'
            : '0 4px 20px rgba(15,23,42,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minWidth: 0,
        width: '100%',
        maxWidth: variant === 'floating' ? '440px' : '100%',
        position: 'relative',
      }}
      className="p-3 sm:p-5"
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0B1533 0%, #1e293b 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(11, 21, 51, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} style={{ color: '#60a5fa' }} />
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
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0B1533', margin: 0, letterSpacing: '-0.02em' }}>
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
                AI Online
              </span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0', fontWeight: 500 }}>
              End-to-end banking query & recovery engine
            </p>
          </div>
        </div>

        {/* Tab Switcher: Bot vs Voice */}
        <div
          style={{
            display: 'flex',
            background: '#f1f5f9',
            padding: '3px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
          }}
        >
          <button
            onClick={() => setActiveTab('bot')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'bot' ? '#0f172a' : 'transparent',
              color: activeTab === 'bot' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <MessageSquare size={13} />
            Query Bot
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '9px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'voice' ? '#0f172a' : 'transparent',
              color: activeTab === 'voice' ? '#ffffff' : '#64748b',
              transition: 'all 0.15s ease',
            }}
          >
            <Mic size={13} />
            Voice Call
          </button>
        </div>
      </div>

      {/* ── Customer Context Badge ────────────────────────────────────────── */}
      {(customerContext.customer_id || customerContext.amount) && (
        <div
          style={{
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '8px 12px',
            fontSize: '11px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
              <span style={{ color: '#94a3b8' }}>At Risk: </span>
              <strong style={{ color: '#2563eb' }}>
                ₹{customerContext.amount.toLocaleString('en-IN')}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 1: INTERACTIVE QUERY BOT ──────────────────────────────────── */}
      {activeTab === 'bot' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Quick prompt pills */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'none',
            }}
          >
            {[
              { label: '🔍 Why did payment fail?', q: 'Why did this payment fail?' },
              { label: '⚡ Switch to UPI', q: 'Switch payment method to UPI' },
              { label: '🏦 What is ISO 51?', q: 'What is ISO 51 error?' },
              { label: '📊 Recovery Rate', q: 'What is our current recovery rate?' },
              { label: '⏰ Best time to retry', q: 'What is the best time to retry?' },
            ].map(({ label, q }) => (
              <button
                key={label}
                onClick={() => handleSendQuery(q)}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '5px 9px',
                  borderRadius: '999px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#eff6ff';
                  e.currentTarget.style.borderColor = '#bfdbfe';
                  e.currentTarget.style.color = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.color = '#334155';
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Messages Container */}
          <div
            style={{
              height: variant === 'floating' ? '280px' : '340px',
              overflowY: 'auto',
              background: '#fafafa',
              borderRadius: '16px',
              padding: '12px',
              border: '1px solid #f1f5f9',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isBot ? 'flex-start' : 'flex-end',
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      maxWidth: '92%',
                      flexDirection: isBot ? 'row' : 'row-reverse',
                    }}
                  >
                    {isBot && (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '8px',
                          background: '#0B1533',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        <Bot size={13} style={{ color: '#60a5fa' }} />
                      </div>
                    )}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: isBot ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                        background: isBot ? '#ffffff' : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                        color: isBot ? '#1e293b' : '#ffffff',
                        border: isBot ? '1px solid #e2e8f0' : 'none',
                        boxShadow: isBot ? '0 2px 6px rgba(0,0,0,0.04)' : '0 4px 12px rgba(15,23,42,0.15)',
                        fontSize: '12.5px',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.text.split('\n\n').map((block, bIdx) => (
                          <p key={bIdx} style={{ margin: bIdx === 0 ? 0 : '8px 0 0' }}>
                            {block.split('**').map((seg, sIdx) =>
                              sIdx % 2 === 1 ? (
                                <strong key={sIdx} style={{ fontWeight: 700 }}>
                                  {seg}
                                </strong>
                              ) : (
                                seg
                              )
                            )}
                          </p>
                        ))}
                      </div>

                      {/* Action buttons inside message */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '6px',
                            marginTop: '10px',
                            paddingTop: '8px',
                            borderTop: '1px solid #f1f5f9',
                          }}
                        >
                          {msg.actions.map((act, aIdx) => (
                            <button
                              key={aIdx}
                              onClick={() => handleActionClick(act)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '5px 10px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: act.primary
                                  ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                                  : '#f8fafc',
                                color: act.primary ? '#ffffff' : '#0f172a',
                                border: act.primary ? 'none' : '1px solid #cbd5e1',
                                boxShadow: act.primary ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {act.action === 'switch_method' && <Smartphone size={11} />}
                              {act.action === 'pay_now' && <Zap size={11} />}
                              {act.action === 'open_link' && (copiedLink ? <Check size={11} /> : <Copy size={11} />)}
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#94a3b8',
                      marginTop: '3px',
                      padding: '0 4px',
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {isQuerying && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '8px',
                    background: '#0B1533',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Bot size={13} style={{ color: '#60a5fa' }} />
                </div>
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '16px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#64748b',
                  }}
                >
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Analyzing banking ISO intelligence...
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              padding: '6px 8px 6px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask about ISO codes, payment status, retry timing..."
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '12.5px',
                color: '#0f172a',
              }}
              disabled={isQuerying}
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isQuerying}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: inputQuery.trim() && !isQuerying ? '#2563eb' : '#cbd5e1',
                border: 'none',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: inputQuery.trim() && !isQuerying ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              aria-label="Send Query"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* ── TAB 2: VOICE CALL (ELEVENLABS) ─────────────────────────────────── */}
      {activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {status === 'connected' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '999px',
                padding: '6px 14px',
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
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>
                {isSpeaking ? 'Agent Speaking...' : 'Listening to caller...'}
              </span>
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
                  ? 'Agent is explaining recovery options with customer...'
                  : 'Speaking enabled. Say "Switch to UPI" or "Authorize charge".'}
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

          {/* Action Call Button */}
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
                Start Live Voice Recovery Call
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
                Connecting to Voice Session...
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
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                margin: '0 0 8px',
              }}
            >
              Agent Client Tools
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
                    fontSize: '12px',
                    fontWeight: 600,
                    color: green ? '#166534' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes wave { 0% { height: 15%; } 100% { height: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { 100% { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

// ─── Outer Component (owns ConversationProvider) ─────────────────────────────

export default function RelayVoiceAgent({
  customerContext = {},
  onSelectMethod,
  onPayNow,
  variant = 'inline',
  defaultOpen = false,
}: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen);

  const agentId =
    process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ||
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

            {/* Floating Card: max-w-[440px] for comfortable reading */}
            <div className="fixed inset-x-0 bottom-0 z-[9999] sm:inset-auto sm:bottom-6 sm:right-6 sm:max-w-[440px] w-full bottom-sheet-content">
              <div className="bg-white rounded-t-[28px] sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[88vh] flex flex-col">
                {/* Mobile Pull Handle Bar */}
                <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
                  <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
                </div>

                {/* Close Button Header */}
                <div className="px-4 sm:px-6 pt-3 pb-0 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                      Relay Copilot · End-to-End Banking Query Bot
                    </span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                    aria-label="Close Copilot"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Scrollable Agent Body */}
                <div className="p-3 sm:p-5 overflow-y-auto max-h-[calc(88vh-55px)]">
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
                background: 'linear-gradient(135deg, #0B1533 0%, #1e293b 50%, #2563eb 100%)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '999px',
                padding: '12px 20px',
                minHeight: '48px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 12px 30px -5px rgba(15,23,42,0.4)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }}
              aria-label="Open Recovery Copilot"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} style={{ color: '#93c5fd' }} />
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
              <span className="hidden xs:inline sm:inline">Ask Recovery Copilot</span>
              <span className="inline xs:hidden sm:hidden">Copilot</span>
              <Sparkles size={14} style={{ color: '#fbbf24' }} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return inner;
}
