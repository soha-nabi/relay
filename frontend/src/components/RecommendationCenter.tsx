import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { getRecommendation } from '../lib/api';
import type { CustomerProfile, Recommendation } from '../types';

export function RecommendationCenter({ profile }: { profile?: CustomerProfile }) {
  const [result, setResult] = useState<Recommendation>(); const [loading, setLoading] = useState(false);
  async function recommend() { if (!profile) return; setLoading(true); try { setResult(await getRecommendation(profile.customer_id)); } finally { setLoading(false); } }
  return <section className="section split-section" id="recommendation"><div className="section-intro"><p className="eyebrow">RECOMMENDATION CENTER</p><h2>Turn risk into a recovery plan.</h2><p>Generate a focused, data-informed next step for the selected customer.</p><button className="button" onClick={recommend} disabled={!profile || loading}><Sparkles size={17} />{loading ? 'Generating…' : 'Generate recommendation'}</button>{!profile && <small className="hint">Analyze a customer first to unlock recommendations.</small>}</div><article className="panel insight-card">{result ? <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><span className="insight-label">RECOMMENDED ACTION</span><h3>{result.recommended_strategy}</h3><div className="confidence"><span>Confidence</span><b>{result.confidence}%</b><i><em style={{ width: `${result.confidence}%` }} /></i></div><p>{result.reason}</p><span className="view-detail">Customer recovery plan <ArrowUpRight size={16} /></span></motion.div> : <EmptyInsight />}</article></section>;
}
function EmptyInsight() { return <div className="empty-insight"><Sparkles size={21} /><p>Your recommended recovery action will appear here.</p></div>; }
