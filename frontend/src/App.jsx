import React, { useState } from 'react';
import ChatDashboard from './components/ChatDashboard';
import CustomerTable from './components/CustomerTable';
import SegmentList from './components/SegmentList';
import CampaignList from './components/CampaignList';
import AnalyticsView from './components/AnalyticsView';
import { Sparkles, Users, Database, BarChart2, MessageSquare, PieChart } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatDashboard />;
      case 'customers':
        return <CustomerTable />;
      case 'segments':
        return <SegmentList />;
      case 'campaigns':
        return <CampaignList />;
      case 'analytics':
        return <AnalyticsView />;
      default:
        return <ChatDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* HEADER NAV BAR */}
      <header className="px-6 py-4 bg-slate-900/40 backdrop-blur-md border-b border-slate-900 sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center gap-4">
        {/* LOGO */}
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('chat')}>
          <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Sparkles size={18} className="text-white fill-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-slate-100 tracking-tight text-md">Xeno <span className="text-blue-500 font-semibold">CRM</span></h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">AI-Native Engagement</p>
          </div>
        </div>

        {/* NAV TABS */}
        <nav className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-900 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'chat' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare size={13} />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'customers' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={13} />
            Customers
          </button>
          <button
            onClick={() => setActiveTab('segments')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'segments' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={13} />
            Segments
          </button>
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'campaigns' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 size={13} />
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'analytics' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieChart size={13} />
            Analytics
          </button>
        </nav>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {renderContent()}
      </main>

      {/* FOOTER */}
      <footer className="py-4 border-t border-slate-900/60 text-center text-[10px] text-slate-600">
        Xeno CRM Application — Built for Xeno Engineering Take-Home Assignment
      </footer>
    </div>
  );
}
