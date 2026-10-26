import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { TrendDataPoint } from '@/types';

type Period = '24h' | '7d' | '30d';

interface ThreatTrendsChartProps {
  data24h: TrendDataPoint[];
  data7d: TrendDataPoint[];
  data30d: TrendDataPoint[];
  loading: boolean;
}

const PERIOD_LABELS: Record<Period, string> = { '24h': '24 Hours', '7d': '7 Days', '30d': '30 Days' };

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-teal-900/40 p-3 text-xs" style={{ background: 'var(--surface-bg)' }}>
      <div className="text-slate-400 mb-2 font-medium">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 capitalize">{p.name}:</span>
          <span className="text-white font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function ThreatTrendsChart({ data24h, data7d, data30d, loading }: ThreatTrendsChartProps) {
  const [period, setPeriod] = useState<Period>('24h');

  const data = period === '24h' ? data24h : period === '7d' ? data7d : data30d;

  return (
    <div className="rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Email Threat Trends</h3>
          <p className="text-xs text-slate-500 mt-0.5">Demo data — sample threat simulation</p>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg border border-teal-900/30" style={{ background: 'var(--surface-bg)' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                period === p
                  ? 'text-teal-300 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              style={period === p ? { background: 'var(--card-bg)' } : {}}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-56 rounded-lg animate-pulse" style={{ background: 'var(--surface-bg)' }} />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="suspicious" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F5B942" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F5B942" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="highRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F05252" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F05252" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="confirmed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#14B8A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="time" tick={{ fill: 'var(--chart-label)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--chart-label)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(20,184,166,0.2)', strokeWidth: 1 }} />
            <Legend
              iconType="circle"
              iconSize={7}
              formatter={val => <span style={{ color: 'var(--chart-label)', fontSize: 11 }}>{val}</span>}
            />
            <Area type="monotone" dataKey="suspicious" name="Suspicious" stroke="#F5B942" strokeWidth={1.5} fill="url(#suspicious)" dot={false} />
            <Area type="monotone" dataKey="highRisk" name="High Risk" stroke="#F05252" strokeWidth={1.5} fill="url(#highRisk)" dot={false} />
            <Area type="monotone" dataKey="confirmed" name="Confirmed" stroke="#14B8A6" strokeWidth={1.5} fill="url(#confirmed)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
