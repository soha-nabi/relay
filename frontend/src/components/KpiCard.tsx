import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface Props { label: string; value: number; format: (value: number) => string; detail: string; icon?: LucideIcon; tone?: 'blue' | 'green' | 'red'; }
export function KpiCard({ label, value, format, detail }: Props) {
  const display = useCountUp(value);
  return <motion.article className="dashboard-card min-h-[120px] p-5" whileHover={{ y: -3 }}>
    <div>
      <p className="label-400 text-[12px] text-muted">{label}</p>
      <h2 className="mt-3 metric-600 text-[20px]">{format(display)}</h2>
      <small className="mt-2 block text-[11px] text-muted">{detail}</small>
    </div>
  </motion.article>;
}
function useCountUp(target: number) { const [value, setValue] = useState(0); useEffect(() => { let frame = 0; const start = performance.now(); const tick = (time: number) => { const progress = Math.min(1, (time - start) / 650); setValue(target * (1 - Math.pow(1 - progress, 3))); if (progress < 1) frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [target]); return value; }
