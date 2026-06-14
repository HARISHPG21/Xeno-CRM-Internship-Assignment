import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  BarChart2, Play, Users, MessageSquare, RefreshCw, ChevronDown, 
  ChevronUp, CheckCircle, AlertTriangle, HelpCircle, Eye, Mail, MessageCircle
} from 'lucide-react';

export default function CampaignList() {
  const [campaigns, setCampaigns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Audit log panel states
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [selectedCampaignName, setSelectedCampaignName] = useState('');
  const [communications, setCommunications] = useState([]);
  const [isCommLoading, setIsCommLoading] = useState(false);

  // Scheduling states
  const [schedulingCampaignId, setSchedulingCampaignId] = useState(null);
  const [scheduleTime, setScheduleTime] = useState('');

  // AI analysis states
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);

  useEffect(() => {
    loadCampaigns();

    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!isLocalDev) {
      // Production (Vercel serverless): poll for live updates every 5s
      const pollInterval = setInterval(() => loadCampaigns(true), 5000);
      return () => clearInterval(pollInterval);
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//localhost:8000/api/ws/campaigns`;
    let ws;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        console.log('[WebSocket] Campaigns list connected');
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'stats_update') {
            console.log('[WebSocket] Campaigns received live stats update:', data.campaign_id);
            
            // Dynamic stats update
            setCampaigns(prev => prev.map(c => 
              c.id === data.campaign_id 
                ? { ...c, stats: data.stats, stats_a: data.stats_a, stats_b: data.stats_b } 
                : c
            ));
            
            // Reload transmission logs if actively viewed
            if (selectedCampaignId === data.campaign_id) {
              loadCommunications(data.campaign_id);
            }
          }
        } catch (e) {
          console.error('[WebSocket] campaigns listener parse error:', e);
        }
      };
      ws.onerror = (err) => {
        console.error('[WebSocket] campaigns listener connection error:', err);
      };
      ws.onclose = () => {
        if (!destroyed) {
          console.log('[WebSocket] campaigns connection closed. Reconnecting in 3s...');
          setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return () => {
      destroyed = true;
      if (ws) ws.close();
    };
  }, [selectedCampaignId]);

  const loadCampaigns = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await api.getCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const loadCommunications = async (campaignId) => {
    setIsCommLoading(true);
    try {
      const data = await api.getCampaignCommunications(campaignId);
      setCommunications(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCommLoading(false);
    }
  };

  const handleLaunchCampaign = async (campaignId, e) => {
    e.stopPropagation();
    try {
      const response = await api.launchCampaign(campaignId);
      alert('Campaign successfully launched! Channel simulation started.');
      loadCampaigns();
    } catch (err) {
      alert(`Launch error: ${err.message}`);
    }
  };

  const handleToggleAudit = (campaignId, campaignName, e) => {
    e.stopPropagation();
    if (selectedCampaignId === campaignId) {
      setSelectedCampaignId(null);
      setCommunications([]);
      setAiAnalysis(null);
    } else {
      setSelectedCampaignId(campaignId);
      setSelectedCampaignName(campaignName);
      loadCommunications(campaignId);
      loadAiAnalysis(campaignId);
    }
  };

  const loadAiAnalysis = async (campaignId) => {
    setIsAnalysisLoading(true);
    try {
      const data = await api.analyseCampaign(campaignId);
      setAiAnalysis(data);
    } catch (err) {
      console.error(err);
      setAiAnalysis({ narrative: "• Failed to fetch AI campaign narrative report." });
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  const handleScheduleCampaignSubmit = async (campaignId, e) => {
    e.stopPropagation();
    if (!scheduleTime) {
      alert('Please select a date and time.');
      return;
    }
    try {
      const isoStr = new Date(scheduleTime).toISOString();
      await api.scheduleCampaign(campaignId, isoStr);
      alert('Campaign schedule registered in the background scheduler!');
      setSchedulingCampaignId(null);
      setScheduleTime('');
      loadCampaigns();
    } catch (err) {
      alert(`Scheduling failed: ${err.message}`);
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* CAMPAIGN LIST PANEL (7 or 12 cols depending on details open) */}
      <div className={`${selectedCampaignId ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="text-lg font-bold text-slate-200">Marketing Campaigns</h3>
            <p className="text-xs text-slate-500 mt-0.5">Track real-time message delivery funnel, opens, and click tracking metrics.</p>
          </div>
          <button 
            onClick={() => loadCampaigns()}
            className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors"
            title="Refresh Campaigns"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {isLoading ? (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs rounded-2xl">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs rounded-2xl">
            No campaigns found. Use the Copilot in the Chat section to draft and configure a campaign.
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((camp) => {
              const total = camp.stats?.total || 0;
              const sent = camp.stats?.sent || 0;
              const delivered = camp.stats?.delivered || 0;
              const read = camp.stats?.read || 0;
              const opened = camp.stats?.opened || 0;
              const clicked = camp.stats?.clicked || 0;
              const converted = camp.stats?.converted || 0;
              const failed = camp.stats?.failed || 0;

              // Funnel math
              const delivPct = total > 0 ? ((delivered / total) * 100).toFixed(0) : 0;
              const readPct = delivered > 0 ? ((read / delivered) * 100).toFixed(0) : 0;
              const openPct = read > 0 ? ((opened / read) * 100).toFixed(0) : 0;
              const clickPct = opened > 0 ? ((clicked / opened) * 100).toFixed(0) : 0;
              const convPct = clicked > 0 ? ((converted / clicked) * 100).toFixed(0) : 0;
              const failPct = total > 0 ? ((failed / total) * 100).toFixed(0) : 0;

              const isDraft = camp.status === 'draft';

              return (
                <div 
                  key={camp.id}
                  onClick={(e) => !isDraft && handleToggleAudit(camp.id, camp.name, e)}
                  className={`glass-card p-5 rounded-2xl border transition-all duration-300 ${
                    selectedCampaignId === camp.id ? 'border-blue-500/80 bg-slate-900/60' : 'border-slate-800/80 hover:bg-slate-900/10'
                  } ${!isDraft ? 'cursor-pointer' : ''}`}
                >
                  {/* Top Row info */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-200 text-sm">{camp.name}</h4>
                        <span className={`px-2 py-0.5 text-[9px] rounded uppercase font-bold tracking-wider ${
                          camp.channel === 'whatsapp' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          camp.channel === 'sms' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                          camp.channel === 'email' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {camp.channel}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono">
                        CAMPAIGN-{camp.id} | Segment ID: {camp.segment_id} | Created by {camp.created_by.toUpperCase()}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {isDraft && (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => handleLaunchCampaign(camp.id, e)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1 shadow shadow-blue-500/10"
                          >
                            <Play size={11} fill="white" /> Launch
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSchedulingCampaignId(camp.id);
                            }}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg transition-colors border border-slate-700"
                          >
                            Schedule
                          </button>
                        </div>
                      )}
                      {camp.status === 'scheduled' && (
                        <span className="px-2.5 py-1 rounded bg-yellow-500/15 text-yellow-500 border border-yellow-500/20 text-[9px] font-bold uppercase tracking-wider">
                          Scheduled: {new Date(camp.scheduled_at).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {camp.status === 'sent' && (
                        <span className="px-2.5 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {camp.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline Schedule Date Picker */}
                  {schedulingCampaignId === camp.id && (
                    <div className="mt-3 p-3 bg-slate-900/40 border border-yellow-500/30 rounded-xl space-y-2" onClick={e => e.stopPropagation()}>
                      <p className="text-[10px] text-yellow-400 font-bold uppercase">Schedule Dispatch Datetime</p>
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={scheduleTime}
                          onChange={(e) => setScheduleTime(e.target.value)}
                          className="flex-1 px-3 py-1 bg-slate-950 text-slate-100 text-xs rounded border border-slate-800"
                        />
                        <button
                          onClick={(e) => handleScheduleCampaignSubmit(camp.id, e)}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-slate-950 text-xs font-bold rounded"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSchedulingCampaignId(null); }}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Template description */}
                  <div className="mt-3 bg-slate-950/40 p-3 rounded-lg border border-slate-900/60">
                    <p className="text-[10px] text-slate-400 font-mono line-clamp-2">{camp.message_template}</p>
                  </div>

                  {/* Campaign Stats and Funnel (only if launched) */}
                  {!isDraft && (
                    <div className="mt-5 space-y-4">
                      {/* Funnel Metrics */}
                      <div className="grid grid-cols-7 gap-1 text-center border-t border-slate-800/60 pt-4">
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Audience</p>
                          <p className="text-xs font-bold text-slate-300 font-mono mt-0.5">{total}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Delivered</p>
                          <p className="text-xs font-bold text-emerald-400 font-mono mt-0.5">
                            {delivered} <span className="text-[8px] text-slate-500 font-normal">({delivPct}%)</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Read</p>
                          <p className="text-xs font-bold text-teal-400 font-mono mt-0.5">
                            {read} <span className="text-[8px] text-slate-500 font-normal">({readPct}%)</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Opened</p>
                          <p className="text-xs font-bold text-violet-400 font-mono mt-0.5">
                            {opened} <span className="text-[8px] text-slate-500 font-normal">({openPct}%)</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Clicked</p>
                          <p className="text-xs font-bold text-blue-400 font-mono mt-0.5">
                            {clicked} <span className="text-[8px] text-slate-500 font-normal">({clickPct}%)</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Converted</p>
                          <p className="text-xs font-bold text-pink-400 font-mono mt-0.5">
                            {converted} <span className="text-[8px] text-slate-500 font-normal">({convPct}%)</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 truncate">Failed</p>
                          <p className="text-xs font-bold text-pink-500/90 font-mono mt-0.5">
                            {failed} <span className="text-[8px] text-slate-500 font-normal">({failPct}%)</span>
                          </p>
                        </div>
                      </div>

                      {/* Visual Funnel representation */}
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden flex">
                          <div style={{ width: `${(converted/total)*100}%` }} className="h-full bg-pink-500" title="Converted" />
                          <div style={{ width: `${((clicked - converted)/total)*100}%` }} className="h-full bg-blue-500" title="Clicked" />
                          <div style={{ width: `${((opened - clicked)/total)*100}%` }} className="h-full bg-violet-500" title="Opened" />
                          <div style={{ width: `${((read - opened)/total)*100}%` }} className="h-full bg-teal-500" title="Read" />
                          <div style={{ width: `${((delivered - read)/total)*100}%` }} className="h-full bg-emerald-500" title="Delivered" />
                          <div style={{ width: `${((sent - delivered)/total)*100}%` }} className="h-full bg-slate-600" title="Sent" />
                          <div style={{ width: `${(failed/total)*100}%` }} className="h-full bg-pink-600" title="Failed" />
                        </div>
                      </div>

                      {/* Revenue Attribution Badge */}
                      <div className="flex justify-between items-center text-[10px] text-slate-400 bg-slate-950/20 p-2 rounded-lg border border-slate-900/40">
                        <span className="font-semibold text-slate-500 uppercase tracking-widest text-[8px]">💰 Attributed Revenue</span>
                        <span className="font-mono font-bold text-emerald-400 text-xs">₹{(converted * 1500).toLocaleString('en-IN')}</span>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                        <span>Launched on {new Date(camp.launched_at).toLocaleString('en-IN')}</span>
                        <span className="text-blue-400 font-semibold flex items-center gap-1">
                          {selectedCampaignId === camp.id ? (
                            <>Hide Audit Log <ChevronUp size={11} /></>
                          ) : (
                            <>View Delivery Audit Logs <ChevronDown size={11} /></>
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DELIVERY AUDIT LOG PANEL (DRAWER on right) */}
      {selectedCampaignId && (
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col h-[650px] transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div>
              <h4 className="font-bold text-slate-200 text-sm">Delivery Audit Trail</h4>
              <p className="text-[10px] text-slate-500 truncate max-w-xs">{selectedCampaignName}</p>
            </div>
            <button 
              onClick={() => { setSelectedCampaignId(null); setCommunications([]); setAiAnalysis(null); }}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-1 rounded hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          {/* AI Narrative Performance Report */}
          <div className="bg-gradient-to-r from-blue-900/20 to-indigo-900/20 border border-blue-500/20 p-4 rounded-xl mb-4 space-y-2 shrink-0">
            <h5 className="text-[10px] font-bold uppercase tracking-widest text-blue-400 flex items-center gap-1">
              ✨ AI Campaign Performance Summary
            </h5>
            {isAnalysisLoading ? (
              <div className="text-[10px] text-slate-500 font-mono py-1 animate-pulse">Running analysis on dispatch data...</div>
            ) : aiAnalysis?.narrative ? (
              <div 
                className="text-xs text-slate-300 space-y-1.5 leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: aiAnalysis.narrative.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}
              />
            ) : (
              <p className="text-xs text-slate-500 font-mono">No narrative analysis available yet.</p>
            )}
          </div>

          {/* A/B Test comparative view */}
          {selectedCampaign && selectedCampaign.is_ab_test && (() => {
            const stats_a = selectedCampaign.stats_a || { read: 0, clicked: 0, converted: 0 };
            const stats_b = selectedCampaign.stats_b || { read: 0, clicked: 0, converted: 0 };
            const conv_pct_a = stats_a.clicked > 0 ? ((stats_a.converted / stats_a.clicked) * 100).toFixed(0) : 0;
            const conv_pct_b = stats_b.clicked > 0 ? ((stats_b.converted / stats_b.clicked) * 100).toFixed(0) : 0;
            
            let winner = null;
            if (parseFloat(conv_pct_a) > parseFloat(conv_pct_b) && stats_a.converted > 0) winner = 'A';
            else if (parseFloat(conv_pct_b) > parseFloat(conv_pct_a) && stats_b.converted > 0) winner = 'B';

            return (
              <div className="bg-slate-900/40 p-4 border border-slate-800 rounded-xl mb-4 space-y-3 shrink-0">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-300">A/B Testing Funnel Comparison</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Split 50/50</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Variant A Card */}
                  <div className={`p-2.5 bg-slate-950/60 border rounded-xl space-y-1 relative ${
                    winner === 'A' ? 'border-emerald-500/40 bg-emerald-950/5' : 'border-slate-800/80'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-blue-400">Variant A (Friendly)</span>
                      {winner === 'A' && (
                        <span className="px-1 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-bold rounded">
                          Winner
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-slate-500 italic truncate" title={selectedCampaign.message_template}>
                      "{selectedCampaign.message_template}"
                    </p>
                    <div className="grid grid-cols-4 gap-1 text-center pt-2 border-t border-slate-900 text-[8px] font-mono">
                      <div>
                        <p className="text-slate-500 text-[7px]">Read</p>
                        <p className="font-bold text-teal-400">{stats_a.read}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Clicks</p>
                        <p className="font-bold text-blue-400">{stats_a.clicked}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Conv</p>
                        <p className="font-bold text-pink-400">{stats_a.converted}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Conv%</p>
                        <p className="font-bold text-emerald-400">{conv_pct_a}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Variant B Card */}
                  <div className={`p-2.5 bg-slate-950/60 border rounded-xl space-y-1 relative ${
                    winner === 'B' ? 'border-emerald-500/40 bg-emerald-950/5' : 'border-slate-800/80'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold text-violet-400">Variant B (Urgent)</span>
                      {winner === 'B' && (
                        <span className="px-1 py-0.5 bg-emerald-500/10 text-emerald-400 text-[8px] font-bold rounded">
                          Winner
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-slate-500 italic truncate" title={selectedCampaign.message_template_b}>
                      "{selectedCampaign.message_template_b}"
                    </p>
                    <div className="grid grid-cols-4 gap-1 text-center pt-2 border-t border-slate-900 text-[8px] font-mono">
                      <div>
                        <p className="text-slate-500 text-[7px]">Read</p>
                        <p className="font-bold text-teal-400">{stats_b.read}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Clicks</p>
                        <p className="font-bold text-blue-400">{stats_b.clicked}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Conv</p>
                        <p className="font-bold text-pink-400">{stats_b.converted}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[7px]">Conv%</p>
                        <p className="font-bold text-emerald-400">{conv_pct_b}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {isCommLoading ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono">
              Loading audit logs...
            </div>
          ) : communications.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              No transmission logs found.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3">
              {communications.map((comm) => {
                const isFailed = comm.status === 'failed';
                const isClicked = comm.status === 'clicked';
                const isOpened = comm.status === 'opened';
                const isDelivered = comm.status === 'delivered';
                
                return (
                  <div key={comm.id} className="p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl space-y-2">
                    <div className="flex justify-between items-start text-xs">
                      <div>
                        <p className="font-semibold text-slate-200">{comm.customer?.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{comm.customer?.phone || comm.customer?.email}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                        comm.status === 'failed' ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' :
                        comm.status === 'converted' ? 'bg-pink-500/15 text-pink-500 border border-pink-500/30 shadow-[0_0_6px_rgba(236,72,153,0.1)]' :
                        comm.status === 'clicked' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        comm.status === 'opened' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' :
                        comm.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {comm.status}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed italic bg-slate-950/30 p-2 rounded border border-slate-900/30">
                      "{comm.message}"
                    </p>

                    {/* Timeline of events */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-mono text-slate-500 border-t border-slate-900 pt-2">
                      {comm.sent_at && <span>Sent: {new Date(comm.sent_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                      {comm.delivered_at && <span>➔ Deliv: {new Date(comm.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                      {comm.read_at && <span className="text-teal-400 font-semibold">➔ Read: {new Date(comm.read_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                      {comm.opened_at && <span className="text-violet-400 font-semibold">➔ Open: {new Date(comm.opened_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                      {comm.clicked_at && <span className="text-blue-400 font-semibold">➔ Click: {new Date(comm.clicked_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                      {comm.converted_at && <span className="text-pink-400 font-semibold">➔ Converted: {new Date(comm.converted_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
