import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { RiskDistribution } from '@/types';

interface RiskDistributionChartProps {
  data: RiskDistribution;
  loading: boolean;
}

const COLORS = ['#14B8A6', '#F5B942', '#F05252', '#9B1C1C'];
const LABELS = ['Low Risk', 'Medium Risk', 'High Risk', 'Critical'];

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: string } }[] }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-teal-900/40 p-3 text-xs" style={{ background: 'var(--surface-bg)' }}>
      <div className="text-slate-200 font-medium">{p.name}</div>
      <div className="text-slate-400 mt-0.5">{p.value.toLocaleString()} emails · {p.payload.percent}</div>
    </div>
  );
};

export default function RiskDistributionChart({ data, loading }: RiskDistributionChartProps) {
  const total = data.low + data.medium + data.high + data.critical;
  const chartData = [
    { name: 'Low Risk', value: data.low, percent: ((data.low / total) * 100).toFixed(1) + '%' },
    { name: 'Medium Risk', value: data.medium, percent: ((data.medium / total) * 100).toFixed(1) + '%' },
    { name: 'High Risk', value: data.high, percent: ((data.high / total) * 100).toFixed(1) + '%' },
    { name: 'Critical', value: data.critical, percent: ((data.critical / total) * 100).toFixed(1) + '%' },
  ];

  return (
    <div className="rounded-xl border border-teal-900/30 p-5" style={{ background: 'var(--card-bg)' }}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-200">Risk Distribution</h3>
        <p className="text-xs text-slate-500 mt-0.5">Based on {total.toLocaleString()} analyzed emails</p>
      </div>

      {loading ? (
        <div className="h-56 rounded-lg animate-pulse" style={{ background: 'var(--surface-bg)' }} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx]} opacity={0.9} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            {chartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[idx] }} />
                <span className="text-slate-400 truncate">{LABELS[idx]}</span>
                <span className="text-slate-200 font-medium ml-auto">{item.percent}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
