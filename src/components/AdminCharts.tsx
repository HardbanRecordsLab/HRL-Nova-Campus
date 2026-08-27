import React, { useMemo } from 'react';
import { ActivityLog } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie, Legend } from 'recharts';

export const AdminCharts: React.FC<{ logs: ActivityLog[] }> = ({ logs }) => {
  const methodData = useMemo(() => {
    const counts = logs.reduce((acc, log) => {
      const type = log.event_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 5);
  }, [logs]);

  const COLORS = ['#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl">
        <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Top 5 Najczęstszych Zdarzeń (Live)</h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={methodData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickFormatter={(val) => val.length > 10 ? val.substring(0, 10) + '...' : val} />
              <YAxis stroke="#52525b" fontSize={10} />
              <Tooltip 
                cursor={{fill: '#27272a', opacity: 0.4}}
                contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', fontSize: '12px', color: '#e4e4e7' }} 
                itemStyle={{ color: '#a78bfa' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {methodData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-xl flex items-center justify-center relative">
         <h4 className="absolute top-4 left-4 text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-4">Udział Zdarzeń</h4>
         <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={methodData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {methodData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', fontSize: '12px', color: '#e4e4e7' }} 
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{fontSize: '10px', color: '#a1a1aa'}} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
