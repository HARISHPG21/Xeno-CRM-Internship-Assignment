import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  BarChart2, RefreshCw, Zap, Users, ShieldAlert, Award, 
  TrendingUp, Percent, DollarSign, Send, MessageSquare 
} from 'lucide-react';

export default function AnalyticsView() {
  const [campaigns, setCampaigns] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [personas, setPersonas] = useState([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isPersonasLoading, setIsPersonasLoading] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    setIsLoading(true);
    setIsPersonasLoading(true);
    try {
      // Fetch Campaigns for aggregates
      const camps = await api.getCampaigns();
      setCampaigns(camps);

      // Fetch Customers for Heatmap
      const custs = await api.getCustomers({ limit: 1000 });
      setCustomers(custs);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setIsLoading(false);
    }

    try {
      // Fetch dynamic personas from backend (calls Gemini under the hood)
      const pers = await api.getPersonas();
      setPersonas(pers);
    } catch (err) {
      console.error('Failed to fetch personas:', err);
    } finally {
      setIsPersonasLoading(false);
    }
  };

  const handleRecalculateRfm = async () => {
    setIsRecalculating(true);
    try {
      await api.recalculateRfm();
      alert('RFM segments and Customer Personas successfully updated!');
      await loadAnalyticsData();
    } catch (err) {
      alert(`Recalculation error: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  // 1. Aggregates math
  const totalCampaigns = campaigns.length;
  const launchedCampaigns = campaigns.filter(c => c.status === 'sent');
  
  let totalSent = 0;
  let totalDelivered = 0;
  let totalRead = 0;
  let totalOpened = 0;
  let totalClicked = 0;
  let totalConverted = 0;

  campaigns.forEach(c => {
    if (c.stats) {
      totalSent += c.stats.sent || 0;
      totalDelivered += c.stats.delivered || 0;
      totalRead += c.stats.read || 0;
      totalOpened += c.stats.opened || 0;
      totalClicked += c.stats.clicked || 0;
      totalConverted += c.stats.converted || 0;
    }
  });

  const avgReadRate = totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(1) : '0.0';
  const avgOpenRate = totalRead > 0 ? ((totalOpened / totalRead) * 100).toFixed(1) : '0.0';
  const avgCtr = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : '0.0';
  const overallConvRate = totalDelivered > 0 ? ((totalConverted / totalDelivered) * 100).toFixed(1) : '0.0';
  const attributedRevenue = totalConverted * 1500; // Formula: conversions * AOV (AOV assumed 1500)

  // 2. Channel Performance aggregation
  const channels = ['whatsapp', 'sms', 'email', 'rcs'];
  const channelData = channels.map(ch => {
    let sent = 0, delivered = 0, read = 0, opened = 0, clicked = 0, converted = 0;
    campaigns.forEach(c => {
      if (c.channel === ch && c.stats) {
        sent += c.stats.sent || 0;
        delivered += c.stats.delivered || 0;
        read += c.stats.read || 0;
        opened += c.stats.opened || 0;
        clicked += c.stats.clicked || 0;
        converted += c.stats.converted || 0;
      }
    });
    
    const readRate = delivered > 0 ? (read / delivered) * 100 : 0;
    const openRate = read > 0 ? (opened / read) * 100 : 0;
    const ctr = opened > 0 ? (clicked / opened) * 100 : 0;
    const convRate = sent > 0 ? (converted / sent) * 100 : 0;

    return {
      channel: ch.toUpperCase(),
      sent,
      readRate: readRate.toFixed(1),
      openRate: openRate.toFixed(1),
      ctr: ctr.toFixed(1),
      convRate: convRate.toFixed(1)
    };
  });

  // Find max value in channel performance for scaling SVG bars
  const maxConvRate = Math.max(...channelData.map(d => parseFloat(d.convRate)), 1);
  const maxCtr = Math.max(...channelData.map(d => parseFloat(d.ctr)), 1);

  // 3. 5x5 Heatmap logic (Recency vs Frequency)
  // Grid is 5 rows (R 5 down to 1) and 5 cols (F 1 to 5)
  const heatmap = Array(5).fill(0).map(() => Array(5).fill(0));
  customers.forEach(c => {
    const r = c.rfm_recency;
    const f = c.rfm_frequency;
    if (r >= 1 && r <= 5 && f >= 1 && f <= 5) {
      // R is Row: R=5 is top row (index 0), R=1 is bottom row (index 4)
      // F is Col: F=1 is left (index 0), F=5 is right (index 4)
      heatmap[5 - r][f - 1]++;
    }
  });

  // Find max cell count for heatmap opacity scaling
  let maxHeatmapCellCount = 1;
  heatmap.forEach(row => {
    row.forEach(count => {
      if (count > maxHeatmapCellCount) maxHeatmapCellCount = count;
    });
  });

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-200">System Analytics Dashboard</h2>
          <p className="text-xs text-slate-500 mt-0.5">Aggregate dispatch stats, channel conversion efficiency, and RFM heatmaps.</p>
        </div>
        <button
          onClick={handleRecalculateRfm}
          disabled={isRecalculating}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 shadow-lg shadow-blue-500/15 cursor-pointer transition-all"
        >
          <RefreshCw size={13} className={isRecalculating ? "animate-spin" : ""} />
          {isRecalculating ? "Recalculating..." : "Recalculate RFM segments"}
        </button>
      </div>

      {isLoading ? (
        <div className="glass-panel p-16 text-center text-slate-500 text-xs font-mono">
          <RefreshCw size={24} className="animate-spin text-blue-500 mx-auto mb-3" />
          <span>Aggregating CRM transactional data...</span>
        </div>
      ) : (
        <>
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Attributed Revenue</span>
                <DollarSign size={16} className="text-emerald-400" />
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-black text-slate-100 font-mono">₹{attributedRevenue.toLocaleString('en-IN')}</h3>
                <p className="text-[9px] text-slate-500 mt-1">From {totalConverted} converted orders (AOV ₹1,500)</p>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Conversations (Sent)</span>
                <Send size={16} className="text-blue-400" />
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-black text-slate-100 font-mono">{totalSent.toLocaleString()}</h3>
                <p className="text-[9px] text-slate-500 mt-1">Across {launchedCampaigns.length} launched campaigns</p>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Avg Click CTR</span>
                <TrendingUp size={16} className="text-violet-400" />
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-black text-slate-100 font-mono">{avgCtr}%</h3>
                <p className="text-[9px] text-slate-500 mt-1">Average Open-to-Click engagement</p>
              </div>
            </div>

            <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
              <div className="flex justify-between items-center text-slate-500">
                <span className="text-[10px] uppercase font-bold tracking-widest font-mono">Conversion rate</span>
                <Percent size={16} className="text-pink-400" />
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-black text-slate-100 font-mono">{overallConvRate}%</h3>
                <p className="text-[9px] text-slate-500 mt-1">Delivery-to-Purchase conversions</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* CHANNEL PERFORMANCE CHART */}
            <div className="lg:col-span-6 glass-panel p-6 rounded-2xl space-y-6">
              <div>
                <h4 className="font-bold text-slate-200 text-sm">Channel Efficiency Comparison</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Delivery-to-Click rate (CTR) and Conversion rate across communications channels.</p>
              </div>

              {/* Custom SVG Bar Chart */}
              <div className="space-y-4 pt-2">
                {channelData.map(ch => {
                  const ctrPct = parseFloat(ch.ctr);
                  const convPct = parseFloat(ch.convRate);
                  // Scale width percentage relative to max values
                  const scaledCtrWidth = maxCtr > 0 ? (ctrPct / maxCtr) * 100 : 0;
                  const scaledConvWidth = maxConvRate > 0 ? (convPct / maxConvRate) * 100 : 0;

                  return (
                    <div key={ch.channel} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                        <span>{ch.channel === 'WHATSAPP' ? 'WhatsApp' : ch.channel === 'SMS' ? 'SMS' : ch.channel === 'EMAIL' ? 'Email' : 'RCS'}</span>
                        <div className="flex gap-3 text-[9px] font-mono">
                          <span className="text-violet-400">CTR: {ch.ctr}%</span>
                          <span className="text-emerald-400">Conv: {ch.convRate}%</span>
                        </div>
                      </div>
                      
                      <div className="space-y-1 bg-slate-950/40 p-2 rounded-lg border border-slate-900/60">
                        {/* CTR Bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] font-bold text-slate-600 w-6 font-mono uppercase">CTR</span>
                          <div className="flex-1 bg-slate-950 h-2 rounded overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded transition-all duration-700" 
                              style={{ width: `${scaledCtrWidth}%` }}
                            />
                          </div>
                        </div>
                        {/* Conversion Rate Bar */}
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] font-bold text-slate-600 w-6 font-mono uppercase">CONV</span>
                          <div className="flex-1 bg-slate-950 h-2 rounded overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full rounded transition-all duration-700" 
                              style={{ width: `${scaledConvWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RFM SEGMENT ENGAGEMENT HEATMAP */}
            <div className="lg:col-span-6 glass-panel p-6 rounded-2xl flex flex-col justify-between gap-4">
              <div>
                <h4 className="font-bold text-slate-200 text-sm">RFM Segment Engagement Heatmap</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Density distribution grid mapping Customer Recency (R) against Order Frequency (F).</p>
              </div>

              {/* Heatmap Grid */}
              <div className="flex flex-col items-center justify-center py-2">
                <div className="grid grid-cols-6 gap-2 w-full max-w-[340px]">
                  {/* Empty corner cell */}
                  <div className="w-10 h-10 flex items-center justify-center text-[8px] font-mono text-slate-600 font-bold uppercase">R \ F</div>
                  {/* F labels (columns) */}
                  {[1, 2, 3, 4, 5].map(f => (
                    <div key={f} className="w-10 h-10 flex items-center justify-center text-[9px] font-mono text-slate-500 font-bold">F{f}</div>
                  ))}

                  {/* Rows */}
                  {[5, 4, 3, 2, 1].map((r, rIdx) => (
                    <React.Fragment key={r}>
                      {/* R label */}
                      <div className="w-10 h-10 flex items-center justify-center text-[9px] font-mono text-slate-500 font-bold">R{r}</div>
                      
                      {/* Cells */}
                      {[1, 2, 3, 4, 5].map((f, fIdx) => {
                        const count = heatmap[rIdx][fIdx];
                        // Calculate opacity based on max count
                        const opacity = maxHeatmapCellCount > 0 ? (count / maxHeatmapCellCount) : 0;
                        const bgStyle = count > 0 
                          ? { backgroundColor: `rgba(99, 102, 241, ${0.15 + opacity * 0.85})` }
                          : { backgroundColor: 'rgba(30, 41, 59, 0.2)' };

                        return (
                          <div 
                            key={f} 
                            style={bgStyle}
                            className={`w-10 h-10 rounded-lg border border-slate-900/60 flex flex-col items-center justify-center relative group transition-all duration-300 hover:scale-105 cursor-pointer ${
                              count > 0 ? 'text-indigo-100 font-black shadow-[0_0_8px_rgba(99,102,241,0.1)]' : 'text-slate-700'
                            }`}
                          >
                            <span className="text-[10px] font-mono">{count}</span>
                            
                            {/* Hover Tooltip */}
                            <div className="absolute bottom-11 scale-0 group-hover:scale-100 transition-all duration-200 bg-slate-950/95 border border-slate-800 text-[8px] text-slate-300 px-2 py-1 rounded shadow-xl whitespace-nowrap z-50 font-mono">
                              Recency: {r} | Freq: {f}<br />
                              Shoppers: <span className="font-extrabold text-blue-400">{count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono pt-2 border-t border-slate-900/60">
                <span>R5: Active within 14 Days</span>
                <span>F5: 9+ Orders Lifetime</span>
              </div>
            </div>
          </div>

          {/* AI PERSONAS IN-DEPTH NARRATIVE SUMMARY */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div>
              <h4 className="font-bold text-slate-200 text-sm">AI Marketing Personas Overview</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Gemini-generated narrative profiles of active buyer segments for messaging personalization.</p>
            </div>

            {isPersonasLoading ? (
              <div className="p-8 text-center text-slate-500 text-xs font-mono animate-pulse">Generating persona summaries via Gemini...</div>
            ) : personas.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No customer personas registered in database. Run Recalculate above.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {personas.map((pers, idx) => {
                  // Icon assignments based on persona name
                  const getIcon = (name) => {
                    if (name.includes('VIP') || name.includes('High-Spenders')) return <Award className="text-amber-400" size={16} />;
                    if (name.includes('Lapsed') || name.includes('Dormants')) return <ShieldAlert className="text-rose-400" size={16} />;
                    if (name.includes('Bargain') || name.includes('Hunters')) return <Zap className="text-violet-400" size={16} />;
                    return <Users className="text-sky-400" size={16} />;
                  };

                  return (
                    <div key={idx} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-2 flex flex-col justify-between hover:border-blue-500/30 transition-all duration-300">
                      <div>
                        <div className="flex items-center gap-2 justify-between border-b border-slate-950 pb-2 mb-2">
                          <span className="font-bold text-slate-200 text-xs truncate" title={pers.name}>{pers.name}</span>
                          {getIcon(pers.name)}
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed font-sans">{pers.description}</p>
                      </div>
                      
                      <div className="pt-2 flex justify-between items-center text-[9px] font-mono text-slate-500 border-t border-slate-950 mt-2">
                        <span>SHOPPERS:</span>
                        <span className="font-bold text-slate-300">{pers.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
