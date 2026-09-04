import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface ActivityLogItem {
  id: string;
  event_type: string;
  description: string;
  created_at: any;
}

export const ActivityLog: React.FC<{ userId: string; token?: string }> = ({ userId, token }) => {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch(`/api/activity-log?userId=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.json() : [])
      .then((activityData: ActivityLogItem[]) => {
        if (!cancelled) setLogs(activityData);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });
    return () => { cancelled = true; };
  }, [userId, token]);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-5">
      <h3 className="text-sm font-mono uppercase tracking-wider text-white flex items-center gap-2 border-b border-zinc-800/80 pb-3">
        <Clock className="w-4 h-4 text-violet-400" />
        Aktywność w Czasie Rzeczywistym
      </h3>
      <div className="space-y-4">
        {logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className="text-xs text-zinc-300">
              <span className="font-mono text-zinc-500">{new Date(log.created_at?.toDate()).toLocaleTimeString()}</span>
              <p>{log.description}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-zinc-500">Brak aktywności.</p>
        )}
      </div>
    </div>
  );
};
