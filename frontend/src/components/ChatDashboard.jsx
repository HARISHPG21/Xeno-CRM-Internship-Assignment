import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { 
  Send, Sparkles, Database, Users, MessageSquare, BarChart2, 
  RefreshCw, CheckCircle, ArrowRight, Eye, ShieldAlert, AlertCircle, Info
} from 'lucide-react';

export default function ChatDashboard() {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Dashboard states
  const [stats, setStats] = useState({
    totalCustomers: 50,
    activeSegmentsCount: 0,
    campaignsCount: 0,
    averageCtr: 0
  });
  const [lastSegment, setLastSegment] = useState(null);
  const [lastSegmentCustomers, setLastSegmentCustomers] = useState([]);
  const [recentCampaigns, setRecentCampaigns] = useState([]);
  const [dbSeeded, setDbSeeded] = useState(true);
  const [seedCount, setSeedCount] = useState(50);
  const [customers, setCustomers] = useState([]);

  const messagesEndRef = useRef(null);

  // Load initial history and dashboard stats
  useEffect(() => {
    loadChatHistory();
    refreshDashboardData();

    // Setup live polling every 3 seconds for real-time receipt progress!
    const interval = setInterval(() => {
      refreshDashboardData();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket live stats listener for instant callback stats refresh!
  // On Vercel serverless, WebSocket is not supported — use polling fallback instead.
  useEffect(() => {
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocalDev) {
      // Production: poll every 5s for live stats updates instead of WebSocket
      const pollInterval = setInterval(() => refreshDashboardData(), 5000);
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
        console.log('[WebSocket] Connected to Xeno live stats broadcaster');
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'stats_update') {
            console.log('[WebSocket] Live stats update for campaign:', data.campaign_id);
            refreshDashboardData();
          }
        } catch (err) {
          console.error('[WebSocket] Parsing error:', err);
        }
      };
      ws.onerror = (err) => {
        console.error('[WebSocket] Connection error:', err);
      };
      ws.onclose = () => {
        if (!destroyed) {
          console.log('[WebSocket] Connection closed. Reconnecting in 3s...');
          setTimeout(connect, 3000);
        }
      };
    }
    
    connect();
    return () => {
      destroyed = true;
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatHistory = async () => {
    try {
      const history = await api.getChatHistory();
      setMessages(history);
    } catch (err) {
      console.error('Failed to load chat history', err);
    }
  };

  const refreshDashboardData = async () => {
    try {
      const custData = await api.getCustomers({ limit: 1000 });
      setCustomers(custData);
      const segments = await api.getSegments();
      const campaigns = await api.getCampaigns();

      // Calculate averages and counts
      const totalCust = custData.length;
      const activeSegs = segments.length;
      const launchedCamps = campaigns.length;

      let totalClicks = 0;
      let totalDelivered = 0;
      campaigns.forEach(c => {
        if (c.stats) {
          totalClicks += c.stats.clicked;
          totalDelivered += c.stats.delivered;
        }
      });
      const avgCtr = totalDelivered > 0 ? ((totalClicks / totalDelivered) * 100).toFixed(1) : 0;

      setStats({
        totalCustomers: totalCust,
        activeSegmentsCount: activeSegs,
        campaignsCount: launchedCamps,
        averageCtr: avgCtr
      });

      // Update campaigns queue
      setRecentCampaigns(campaigns.slice(0, 3));

      // Get last active segment preview
      if (segments.length > 0) {
        const latestSeg = segments.find(s => s.customer_count > 0) || segments[0];
        setLastSegment(latestSeg);
        const segCust = await api.getSegmentCustomers(latestSeg.id);
        setLastSegmentCustomers(segCust.slice(0, 5));
      }
      
      // If customer database is empty, mark as not seeded
      if (totalCust === 0) {
        setDbSeeded(false);
      } else {
        setDbSeeded(true);
      }
    } catch (err) {
      console.error('Failed to refresh dashboard data', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue;
    setInputValue('');
    setIsLoading(true);

    // Optimistically update chat with user's message locally
    const tempUserMsg = { id: Date.now(), role: 'user', content: userText, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempUserMsg]);

    // Create a temporary placeholder for streaming assistant response
    const aiMsgId = Date.now() + 1;
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', created_at: new Date().toISOString() }]);

    try {
      const chatHistoryForBackend = messages.map(m => ({ role: m.role, content: m.content }));
      
      // Send message and stream response content dynamically
      await api.sendMessage(userText, chatHistoryForBackend, (currentText) => {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: currentText } : m));
      });
      
      refreshDashboardData();
    } catch (err) {
      console.error(err);
      // Replace or update streaming message with error details
      setMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m,
        content: '❌ **Error**: Failed to connect to Xeno Agent. Please make sure the CRM Backend is running.'
      } : m));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedDatabase = async (count = 50) => {
    setIsLoading(true);
    try {
      await api.seedDatabase(count);
      alert(`Database successfully seeded with ${count} customers and matching order records!`);
      refreshDashboardData();
    } catch (err) {
      alert('Failed to seed database');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Clear chat history?')) return;
    try {
      await api.clearChat();
      setMessages([]);
    } catch (err) {
      alert('Failed to clear chat');
    }
  };

  // Safe basic markdown rendering helper
  // Safe basic markdown rendering helper
  const renderMessageContent = (content) => {
    // 1. Separate tool trace from assistant content if present
    const toolTraceIndex = content.indexOf('⚙️ Tool Executed:');
    let mainContent = content;
    let toolTrace = null;

    if (toolTraceIndex !== -1) {
      mainContent = content.substring(0, toolTraceIndex).trim();
      toolTrace = content.substring(toolTraceIndex).trim();
    }

    const formatText = (text) => {
      // Bold formatting
      let formatted = text.split('**').map((part, index) => {
        return index % 2 === 1 ? <strong key={index} className="text-blue-400 font-semibold">{part}</strong> : part;
      });

      // Simple bullet points format
      const lines = text.split('\n');
      return lines.map((line, idx) => {
        if (line.trim().startsWith('- ')) {
          return (
            <li key={idx} className="ml-4 list-disc text-slate-300 my-1">
              {line.replace('- ', '')}
            </li>
          );
        }
        if (line.trim().startsWith('### ')) {
          return (
            <h4 key={idx} className="text-md font-bold text-slate-200 mt-3 mb-1">
              {line.replace('### ', '')}
            </h4>
          );
        }
        return (
          <p key={idx} className="my-1.5 leading-relaxed text-slate-300">
            {line}
          </p>
        );
      });
    };

    const parseToolTrace = (trace) => {
      const toolMatch = trace.match(/⚙️ \*\*Tool Executed:\*\* `(.*?)`/);
      const argsMatch = trace.match(/👉 \*\*Arguments:\*\* `(.*?)`/);
      const resultMatch = trace.match(/📊 \*\*Result:\*\* `(.*?)`/);

      const toolName = toolMatch ? toolMatch[1] : 'Unknown Tool';
      const args = argsMatch ? argsMatch[1] : '{}';
      const result = resultMatch ? resultMatch[1] : '{}';

      return (
        <details className="mt-3 bg-slate-950/80 border border-slate-800/80 rounded-lg overflow-hidden transition-all duration-300 text-xs">
          <summary className="px-3 py-2 bg-slate-900/80 text-blue-400 font-mono flex items-center justify-between cursor-pointer select-none hover:bg-slate-900">
            <span className="flex items-center gap-2">
              <Database size={13} className="animate-pulse" />
              <span>Inspector: System Called `{toolName}`</span>
            </span>
            <span className="text-[10px] text-slate-500 font-sans">Click to inspect</span>
          </summary>
          <div className="p-3 font-mono space-y-2 text-slate-400 max-h-48 overflow-y-auto">
            <div>
              <span className="text-emerald-500">arguments:</span>
              <pre className="mt-1 bg-slate-950 p-1.5 rounded border border-slate-900 text-[11px] overflow-x-auto whitespace-pre-wrap">{args}</pre>
            </div>
            <div>
              <span className="text-pink-500">response:</span>
              <pre className="mt-1 bg-slate-950 p-1.5 rounded border border-slate-900 text-[11px] overflow-x-auto whitespace-pre-wrap">{result}</pre>
            </div>
          </div>
        </details>
      );
    };

    const hasOptions = mainContent.includes('🅰️ **Option A') && mainContent.includes('🅱️ **Option B');
    if (hasOptions) {
      const optAMatch = mainContent.match(/🅰️ \*\*Option A.*?\*\*:\n```text\n([\s\S]*?)\n```/);
      const optBMatch = mainContent.match(/🅱️ \*\*Option B.*?\*\*:\n```text\n([\s\S]*?)\n```/);
      const optA = optAMatch ? optAMatch[1] : '';
      const optB = optBMatch ? optBMatch[1] : '';
      
      const beforeIndex = mainContent.indexOf('🅰️ **Option A');
      const introText = mainContent.substring(0, beforeIndex).trim();
      
      const outroIndex = mainContent.indexOf('📂 Draft campaign');
      let outroText = '';
      if (outroIndex !== -1) {
        outroText = mainContent.substring(outroIndex).trim();
      }

      return (
        <div className="space-y-4">
          <div>{formatText(introText)}</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {/* Option A card */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded uppercase">
                  Option A (Friendly)
                </span>
                <p className="text-[11px] text-slate-300 font-mono mt-2 bg-slate-950 p-2.5 rounded border border-slate-900 leading-relaxed italic">
                  "{optA}"
                </p>
              </div>
              <button 
                onClick={() => setInputValue('Launch Option A')}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md shadow-blue-500/5 cursor-pointer"
              >
                Select Option A
              </button>
            </div>

            {/* Option B card */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3 flex flex-col justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 bg-violet-500/10 text-violet-400 text-[10px] font-bold rounded uppercase">
                  Option B (FOMO / Urgent)
                </span>
                <p className="text-[11px] text-slate-300 font-mono mt-2 bg-slate-950 p-2.5 rounded border border-slate-900 leading-relaxed italic">
                  "{optB}"
                </p>
              </div>
              <button 
                onClick={() => setInputValue('Launch Option B')}
                className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md shadow-violet-500/5 cursor-pointer"
              >
                Select Option B
              </button>
            </div>
          </div>
          
          {outroText && <div className="border-t border-slate-800/40 pt-3">{formatText(outroText)}</div>}
          {toolTrace && parseToolTrace(toolTrace)}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div>{formatText(mainContent)}</div>
        {toolTrace && parseToolTrace(toolTrace)}
      </div>
    );
  };

  // Calculate RFM Distribution for Donut Chart
  const rfmCounts = {};
  customers.forEach(c => {
    const seg = c.rfm_segment || 'Other';
    rfmCounts[seg] = (rfmCounts[seg] || 0) + 1;
  });

  const totalScored = Object.values(rfmCounts).reduce((a, b) => a + b, 0);
  
  const rfmColors = {
    'Champions': '#10B981',
    'Loyal Customers': '#3B82F6',
    'Potential Loyalists': '#6366F1',
    'Recent Customers': '#06B6D4',
    "Can't Lose Them": '#EC4899',
    'At Risk': '#F59E0B',
    'Lost High Value': '#EF4444',
    'Lost': '#64748B',
    'Other': '#475569'
  };

  const donutSegments = Object.entries(rfmCounts)
    .map(([name, count]) => ({
      name,
      count,
      percent: totalScored > 0 ? (count / totalScored) * 100 : 0,
      color: rfmColors[name] || '#64748B'
    }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-130px)]">
      {/* LEFT PANEL: Chat Window (5 cols or 7 cols depending on view) */}
      <div className="lg:col-span-5 flex flex-col glass-panel rounded-2xl overflow-hidden h-full">
        {/* Chat Header */}
        <div className="px-6 py-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600/20 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Sparkles size={18} className="animate-pulse-soft" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100">Xeno AI Copilot</h3>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                Active and Listening
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleClearChat}
              className="px-2.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              title="Clear Conversation"
            >
              Clear Chat
            </button>
          </div>
        </div>

        {/* Database Alert when not seeded */}
        {!dbSeeded && (
          <div className="bg-slate-900/80 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-blue-300">
              <Info size={14} className="text-blue-400 shrink-0" />
              <span>CRM database is empty. Customize and seed your mock campaign data:</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Count:</span>
                <input 
                  type="number" 
                  min="10" 
                  max="200" 
                  value={seedCount}
                  onChange={(e) => setSeedCount(Math.max(10, Math.min(200, parseInt(e.target.value) || 50)))}
                  className="w-12 bg-transparent border-none outline-none text-xs text-slate-300 font-mono text-center"
                />
              </div>
              <button 
                onClick={() => handleSeedDatabase(seedCount)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded transition-colors shrink-0 shadow-lg shadow-blue-500/10"
              >
                Generate Data
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-blue-400 border border-slate-800">
                <MessageSquare size={20} />
              </div>
              <div>
                <h4 className="font-semibold text-slate-200">Start a Campaign Conversation</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Describe the segment of customers you want to reach, and Xeno will build the segment, draft personal messaging templates, and queue delivery simulations.
                </p>
              </div>
              <div className="text-[11px] text-left w-full space-y-1.5 bg-slate-900/40 border border-slate-800/40 rounded-xl p-3">
                <p className="font-semibold text-slate-300 mb-1">Try typing:</p>
                <code className="block bg-slate-950/80 p-1.5 rounded text-blue-400 select-all cursor-pointer hover:bg-slate-950">
                  "Find customers who spent over 5000 and haven't ordered in 90 days"
                </code>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  msg.role === 'user' 
                    ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' 
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}>
                  {msg.role === 'user' ? <Users size={14} /> : <Sparkles size={14} />}
                </div>
                <div className={`px-4 py-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-slate-900/60 border border-slate-800/60 text-slate-100 rounded-tl-none'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    renderMessageContent(msg.content)
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-slate-400 flex items-center justify-center border border-slate-800">
                <Sparkles size={14} className="animate-spin text-blue-400" />
              </div>
              <div className="px-4 py-3 bg-slate-900/30 border border-slate-800/60 rounded-2xl rounded-tl-none">
                <div className="flex gap-1 items-center py-1.5 px-1">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSendMessage} className="p-4 bg-slate-900/50 border-t border-slate-800/80 flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Talk to Xeno (e.g. 'Draft a WhatsApp campaign for high spenders')"
            className="flex-1 px-4 py-2.5 glass-input text-sm text-slate-100 placeholder-slate-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="w-10 h-10 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center text-white transition-colors shadow-lg shadow-blue-500/10 focus:outline-none"
            disabled={isLoading || !inputValue.trim()}
          >
            <Send size={15} />
          </button>
        </form>
      </div>

      {/* RIGHT PANEL: Live Dashboard Monitor (7 cols) */}
      <div className="lg:col-span-7 flex flex-col gap-6 h-full overflow-y-auto">
        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="glass-card p-4 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <Users size={10} /> Database Customers
            </span>
            <span className="text-xl font-bold mt-1 text-slate-200">{stats.totalCustomers}</span>
          </div>
          <div className="glass-card p-4 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <Database size={10} /> Active Segments
            </span>
            <span className="text-xl font-bold mt-1 text-slate-200">{stats.activeSegmentsCount}</span>
          </div>
          <div className="glass-card p-4 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <BarChart2 size={10} /> Campaigns Run
            </span>
            <span className="text-xl font-bold mt-1 text-slate-200">{stats.campaignsCount}</span>
          </div>
          <div className="glass-card p-4 rounded-xl flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1.5">
              <Sparkles size={10} /> Avg Click Rate
            </span>
            <span className="text-xl font-bold mt-1 text-blue-400">{stats.averageCtr}%</span>
          </div>
        </div>

        {/* Row Grid: Segment Inspector & RFM Donut chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch shrink-0">
          {/* Live Segment Inspector */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col min-h-[220px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs uppercase tracking-wider font-mono">
                <Database size={13} className="text-blue-400" />
                Active Segment
              </h4>
              {lastSegment && (
                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[9px] font-bold uppercase rounded">
                  {lastSegment.customer_count} Matches
                </span>
              )}
            </div>
            
            {lastSegment ? (
              <div className="flex-1 flex flex-col justify-between">
                <div className="mb-3">
                  <p className="text-xs font-semibold text-slate-300 truncate">{lastSegment.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{lastSegment.description}</p>
                </div>

                {/* Mini Table */}
                <div className="overflow-x-auto flex-1 max-h-36">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-800/60 pb-1 font-semibold font-mono text-[9px] uppercase">
                        <th className="pb-1">Name</th>
                        <th className="pb-1">City</th>
                        <th className="pb-1 text-right">Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {lastSegmentCustomers.map((cust) => (
                        <tr key={cust.id} className="text-slate-300 hover:bg-slate-900/30">
                          <td className="py-1.5 font-medium truncate max-w-[80px]">{cust.name}</td>
                          <td className="py-1.5 text-slate-400 truncate max-w-[60px]">{cust.city}</td>
                          <td className="py-1.5 text-right font-mono text-slate-400">₹{cust.total_spend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-6 text-center">
                <Users size={24} className="stroke-[1.5] mb-2 text-slate-600" />
                <p className="text-xs font-medium">No segment active</p>
                <p className="text-[10px] text-slate-600 max-w-xs mt-0.5">Filter the database via Copilot chat to preview audience details.</p>
              </div>
            )}
          </div>

          {/* RFM Segment Donut Chart */}
          <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between min-h-[220px]">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-200 flex items-center gap-1.5 text-xs uppercase tracking-wider font-mono">
                <BarChart2 size={13} className="text-indigo-400" />
                RFM Distribution
              </h4>
            </div>

            {totalScored > 0 ? (
              <div className="flex items-center gap-4 flex-1">
                {/* SVG Donut Chart */}
                <div className="relative w-20 h-20 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 42 42">
                    {/* Background Circle */}
                    <circle cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(30, 41, 59, 0.2)" strokeWidth="4" />
                    
                    {/* Loop segments */}
                    {(() => {
                      let currentOffset = 0;
                      return donutSegments.map((seg, idx) => {
                        const strokeDasharray = `${seg.percent} ${100 - seg.percent}`;
                        const strokeDashoffset = 100 - currentOffset + 25; // 25 adds offset to start at top (12 o'clock)
                        currentOffset += seg.percent;

                        return (
                          <circle
                            key={idx}
                            cx="21"
                            cy="21"
                            r="15.91549430918954"
                            fill="transparent"
                            stroke={seg.color}
                            strokeWidth="4"
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            className="transition-all duration-500 hover:stroke-[5px]"
                          />
                        );
                      });
                    })()}
                  </svg>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xs font-black text-slate-200 font-mono">{totalScored}</span>
                    <span className="text-[7px] text-slate-500 font-bold uppercase">Scored</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 overflow-y-auto max-h-36 pr-1 space-y-1.5 text-[9px]">
                  {donutSegments.slice(0, 4).map((seg, idx) => (
                    <div key={idx} className="flex items-center justify-between text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="truncate max-w-[90px]" title={seg.name}>{seg.name}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-300">{seg.count}</span>
                    </div>
                  ))}
                  {donutSegments.length > 4 && (
                    <p className="text-[8px] text-slate-500 text-right font-bold uppercase font-mono">+{donutSegments.length - 4} More Segments</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-6 text-center">
                <BarChart2 size={24} className="stroke-[1.5] mb-2 text-slate-600" />
                <p className="text-xs font-medium">No scoring data</p>
                <p className="text-[10px] text-slate-600 max-w-xs mt-0.5">Seeded database customer profiles are required to construct RFM donuts.</p>
              </div>
            )}
          </div>
        </div>

        {/* Live Campaigns Monitor Queue (Right bottom-half) */}
        <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col min-h-[260px]">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <h4 className="font-bold text-slate-200 flex items-center gap-2 text-sm">
              <BarChart2 size={15} className="text-blue-400" />
              Live Campaign Queue Tracker
            </h4>
            <span className="text-[10px] text-slate-500 flex items-center gap-1.5 animate-pulse-soft">
              <RefreshCw size={9} className="animate-spin" /> Live Updates (3s)
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto">
            {recentCampaigns.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-6 text-center">
                <BarChart2 size={28} className="stroke-[1.5] mb-2 text-slate-600" />
                <p className="text-xs font-medium">No campaigns run yet</p>
                <p className="text-[10px] text-slate-600 max-w-xs mt-0.5">Create a campaign template with Xeno AI and launch it to see simulated webhooks.</p>
              </div>
            ) : (
              recentCampaigns.map((camp) => {
                const total = camp.stats?.total || 0;
                const sent = camp.stats?.sent || 0;
                const delivered = camp.stats?.delivered || 0;
                const read = camp.stats?.read || 0;
                const opened = camp.stats?.opened || 0;
                const clicked = camp.stats?.clicked || 0;
                const converted = camp.stats?.converted || 0;

                // Calculate progress percents relative to total audience
                const sentPct = total > 0 ? (sent / total) * 100 : 0;
                const delivPct = total > 0 ? (delivered / total) * 100 : 0;
                const readPct = total > 0 ? (read / total) * 100 : 0;
                const openPct = total > 0 ? (opened / total) * 100 : 0;
                const clickPct = total > 0 ? (clicked / total) * 100 : 0;
                const convPct = total > 0 ? (converted / total) * 100 : 0;

                return (
                  <div key={camp.id} className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs font-bold text-slate-200">{camp.name}</h5>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${
                            camp.channel === 'whatsapp' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            camp.channel === 'sms' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' :
                            camp.channel === 'email' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {camp.channel}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Status: <span className="font-semibold text-blue-400 uppercase">{camp.status}</span>
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Total: {total}</span>
                    </div>

                    {/* Progress stacked bar */}
                    {total > 0 && (
                      <div className="space-y-1">
                        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                          <div style={{ width: `${convPct}%` }} className="h-full bg-pink-500" title="Converted" />
                          <div style={{ width: `${Math.max(0, clickPct - convPct)}%` }} className="h-full bg-blue-500" title="Clicked" />
                          <div style={{ width: `${Math.max(0, openPct - clickPct)}%` }} className="h-full bg-violet-500" title="Opened" />
                          <div style={{ width: `${Math.max(0, readPct - openPct)}%` }} className="h-full bg-teal-500" title="Read" />
                          <div style={{ width: `${Math.max(0, delivPct - readPct)}%` }} className="h-full bg-emerald-500" title="Delivered" />
                          <div style={{ width: `${Math.max(0, sentPct - delivPct)}%` }} className="h-full bg-slate-600" title="Sent" />
                        </div>

                        {/* Legend row */}
                        <div className="grid grid-cols-6 gap-0.5 text-[8px] font-mono mt-1 text-slate-500">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-600" /> Sent: {sent}</span>
                          <span className="flex items-center gap-1 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Deliv: {delivered}</span>
                          <span className="flex items-center gap-1 text-teal-400"><span className="w-1.5 h-1.5 rounded-full bg-teal-500" /> Read: {read}</span>
                          <span className="flex items-center gap-1 text-violet-400"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Open: {opened}</span>
                          <span className="flex items-center gap-1 text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Click: {clicked}</span>
                          <span className="flex items-center gap-1 text-pink-400"><span className="w-1.5 h-1.5 rounded-full bg-pink-500" /> Conv: {converted}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
