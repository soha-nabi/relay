'use client';

import React from 'react';
import { DataTable, type Column } from './ui/DataTable';
import { StatusBadge } from './ui/StatusBadge';

export interface AtRiskRow {
  customer_id: string;
  risk_score: number;
  failures: number;
  preferred: string;
  predicted: number;
  action: string;
}

const DEFAULT_SAMPLE_ROWS: AtRiskRow[] = [
  { customer_id: 'CUST00052', risk_score: 85, failures: 3, preferred: 'Card Limit Timeout', predicted: 3200, action: 'Trigger Voice Agent' },
  { customer_id: 'CUST00123', risk_score: 72, failures: 2, preferred: '3DS Dropoff', predicted: 1500, action: 'Smart Retry' },
  { customer_id: 'CUST00088', risk_score: 64, failures: 2, preferred: 'Bank Downtime', predicted: 4200, action: 'Reroute UPI' },
  { customer_id: 'CUST00015', risk_score: 58, failures: 1, preferred: 'Expired Card', predicted: 2800, action: 'Send Payment Link' },
  { customer_id: 'CUST00210', risk_score: 45, failures: 1, preferred: 'Network Glitch', predicted: 1950, action: 'Smart Retry' },
];

export function AtRiskTable({ rows = [] }: { rows?: AtRiskRow[] }) {
  const isDemo = rows.length === 0;
  const data = rows.length ? rows : DEFAULT_SAMPLE_ROWS;

  const columns: Column<AtRiskRow>[] = [
    {
      key: 'customer_id',
      header: 'Customer ID',
      sortable: true,
      render: (r) => (
        <span className="font-bold text-slate-900 font-mono text-xs">
          {r.customer_id}
        </span>
      ),
    },
    {
      key: 'risk_score',
      header: 'Recovery Risk',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <StatusBadge
            status={r.risk_score >= 80 ? 'failed' : r.risk_score >= 60 ? 'retrying' : 'recovered'}
            label={r.risk_score >= 80 ? 'High' : r.risk_score >= 60 ? 'Medium' : 'Low'}
            size="sm"
          />
          <span className="text-[11px] font-semibold text-slate-500">{r.risk_score}</span>
        </div>
      ),
    },
    {
      key: 'predicted',
      header: 'Revenue At Risk',
      sortable: true,
      render: (r) => (
        <span className="font-extrabold text-rose-600">
          ₹{(r.predicted || 0).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'preferred',
      header: 'Decline Trigger',
      render: (r) => <span className="text-slate-600 font-medium">{r.preferred}</span>,
    },
    {
      key: 'action',
      header: 'Recommended Action',
      render: (r) => (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          {r.action}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {isDemo && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs text-slate-500">
            Real-time heuristic ranking of transactions requiring immediate intervention
          </span>
          <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            Demo data
          </span>
        </div>
      )}
      <DataTable
        data={data}
        columns={columns}
        searchKeys={['customer_id', 'preferred', 'action']}
        searchPlaceholder="Filter customers or decline triggers…"
        pageSize={5}
        emptyTitle="No at-risk transactions"
        emptyDescription="All recent transactions are currently settled or resolved."
      />
    </div>
  );
}

export default AtRiskTable;
