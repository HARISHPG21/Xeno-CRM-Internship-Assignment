import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  Search, User, Filter, CreditCard, ShoppingBag, MapPin, X, 
  MessageSquare, Calendar, RefreshCw, ChevronRight, Activity, Upload 
} from 'lucide-react';

export default function CustomerTable() {
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [rfmFilter, setRfmFilter] = useState('');
  const [personaFilter, setPersonaFilter] = useState('');
  const [cities, setCities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);

  // Timeline detail states
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const handleCsvUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingCsv(true);
    try {
      const result = await api.uploadCustomersCsv(file);
      let alertMsg = `Import completed successfully!\n- ${result.message}`;
      if (result.errors && result.errors.length > 0) {
        alertMsg += `\n\nErrors encountered:\n` + result.errors.slice(0, 5).join('\n');
        if (result.errors.length > 5) {
          alertMsg += `\n...and ${result.errors.length - 5} more errors.`;
        }
      }
      alert(alertMsg);
      // Reload customers list
      loadCustomers();
    } catch (err) {
      console.error(err);
      alert(`CSV Import failed: ${err.message}`);
    } finally {
      setIsUploadingCsv(false);
      e.target.value = ''; // clear input
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [tierFilter, cityFilter]);

  const loadCustomers = async () => {
    setIsLoading(true);
    try {
      // Query up to 1000 customers for local search/filter options
      const data = await api.getCustomers({ tier: tierFilter, city: cityFilter, limit: 1000 });
      setCustomers(data);
      
      // Extract unique cities from all customers once
      if (cities.length === 0) {
        const allCusts = await api.getCustomers({ limit: 1000 });
        const uniqueCities = [...new Set(allCusts.map(c => c.city))];
        setCities(uniqueCities);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowClick = async (customerId) => {
    setSelectedCustomerId(customerId);
    setIsDetailLoading(true);
    try {
      const detail = await api.getCustomerDetail(customerId);
      setCustomerDetail(detail);
    } catch (err) {
      console.error('Failed to load customer profile details', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedCustomerId(null);
    setCustomerDetail(null);
  };

  // Filter customers locally by search query, RFM segment, and Persona
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery);
    const matchesRfm = rfmFilter === '' || c.rfm_segment === rfmFilter;
    const matchesPersona = personaFilter === '' || c.persona === personaFilter;
    return matchesSearch && matchesRfm && matchesPersona;
  });

  // Calculate Aggregates
  const totalSpend = filteredCustomers.reduce((acc, c) => acc + c.total_spend, 0);
  const totalOrders = filteredCustomers.reduce((acc, c) => acc + c.order_count, 0);
  const averageAov = totalOrders > 0 ? (totalSpend / totalOrders).toFixed(2) : 0;

  // Build combined chronological timeline for active profile
  const getTimelineItems = () => {
    if (!customerDetail) return [];
    
    const items = [];
    
    // 1. Add Orders
    (customerDetail.orders || []).forEach(order => {
      // Safely parse order items string
      let parsedItems = [];
      try {
        parsedItems = JSON.parse(order.items);
      } catch (e) {
        parsedItems = [];
      }
      
      items.push({
        type: 'order',
        date: new Date(order.created_at),
        timestamp: order.created_at,
        id: order.id,
        amount: order.amount,
        status: order.status,
        channel: order.channel,
        products: parsedItems
      });
    });

    // 2. Add Communications (Campaign sends)
    (customerDetail.communications || []).forEach(comm => {
      items.push({
        type: 'communication',
        date: comm.sent_at ? new Date(comm.sent_at) : new Date(),
        timestamp: comm.sent_at || new Date().toISOString(),
        id: comm.id,
        message: comm.message,
        channel: comm.channel,
        status: comm.status,
        campaignName: comm.campaignName || 'Campaign Message'
      });
    });

    // Sort newest first
    return items.sort((a, b) => b.date - a.date);
  };

  const timelineItems = getTimelineItems();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT: Customers List Table (7 or 12 cols) */}
      <div className={`${selectedCustomerId ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-6 transition-all duration-300`}>
        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center border border-blue-500/20">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Revenue</p>
              <h3 className="text-xl font-bold mt-0.5 text-slate-200">₹{totalSpend.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
            </div>
          </div>
          <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/10 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/20">
              <ShoppingBag size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total Purchase Count</p>
              <h3 className="text-xl font-bold mt-0.5 text-slate-200">{totalOrders} Orders</h3>
            </div>
          </div>
          <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
            <div className="w-10 h-10 bg-pink-500/10 text-pink-400 rounded-xl flex items-center justify-center border border-pink-500/20">
              <User size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Average Order Value (AOV)</p>
              <h3 className="text-xl font-bold mt-0.5 text-slate-200">₹{parseFloat(averageAov).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</h3>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
            <input
              type="text"
              placeholder="Search name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 glass-input text-xs text-slate-100 placeholder-slate-500"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
            {/* Tier filter */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 rounded-lg px-2.5 py-1">
              <Filter size={12} className="text-slate-500" />
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-950 text-slate-300">All Tiers</option>
                <option value="gold" className="bg-slate-950 text-slate-300">Gold</option>
                <option value="silver" className="bg-slate-950 text-slate-300">Silver</option>
                <option value="bronze" className="bg-slate-950 text-slate-300">Bronze</option>
              </select>
            </div>

            {/* City filter */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 rounded-lg px-2.5 py-1">
              <MapPin size={12} className="text-slate-500" />
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-950 text-slate-300">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city} className="bg-slate-950 text-slate-300">{city}</option>
                ))}
              </select>
            </div>

            {/* RFM Segment Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 rounded-lg px-2.5 py-1">
              <Activity size={12} className="text-slate-500" />
              <select
                value={rfmFilter}
                onChange={(e) => setRfmFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-950 text-slate-300">All RFM Segments</option>
                <option value="Champions" className="bg-slate-950 text-slate-300">Champions</option>
                <option value="Loyal Customers" className="bg-slate-950 text-slate-300">Loyal Customers</option>
                <option value="Potential Loyalists" className="bg-slate-950 text-slate-300">Potential Loyalists</option>
                <option value="Recent Customers" className="bg-slate-950 text-slate-300">Recent Customers</option>
                <option value="Can't Lose Them" className="bg-slate-950 text-slate-300">Can't Lose Them</option>
                <option value="At Risk" className="bg-slate-950 text-slate-300">At Risk</option>
                <option value="Lost High Value" className="bg-slate-950 text-slate-300">Lost High Value</option>
                <option value="Lost" className="bg-slate-950 text-slate-300">Lost</option>
              </select>
            </div>

            {/* Persona Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 rounded-lg px-2.5 py-1">
              <User size={12} className="text-slate-500" />
              <select
                value={personaFilter}
                onChange={(e) => setPersonaFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-950 text-slate-300">All Personas</option>
                <option value="VIP Dormants" className="bg-slate-950 text-slate-300">VIP Dormants</option>
                <option value="Loyal High-Spenders" className="bg-slate-950 text-slate-300">Loyal High-Spenders</option>
                <option value="Lapsed Buyers" className="bg-slate-950 text-slate-300">Lapsed Buyers</option>
                <option value="New Shoppers" className="bg-slate-950 text-slate-300">New Shoppers</option>
                <option value="Bargain Hunters" className="bg-slate-950 text-slate-300">Bargain Hunters</option>
              </select>
            </div>

            {/* CSV Customer Import */}
            <div className="relative">
              <label className="flex items-center gap-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs cursor-pointer font-semibold transition-all">
                <Upload size={12} className={isUploadingCsv ? "animate-bounce" : ""} />
                <span>{isUploadingCsv ? "Importing..." : "Import CSV"}</span>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleCsvUpload} 
                  className="hidden" 
                  disabled={isUploadingCsv}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Table container */}
        <div className="glass-panel rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs">Loading customer list...</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">No customers found. Try resetting filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900/40 text-slate-500 border-b border-slate-800 font-semibold font-mono uppercase tracking-wider text-[10px]">
                    <th className="p-4">Customer Name</th>
                    <th className="p-4">City</th>
                    <th className="p-4">Tier / Persona</th>
                    <th className="p-4 text-center">RFM Segment</th>
                    <th className="p-4 text-right">Orders</th>
                    <th className="p-4 text-right">Total Spent</th>
                    <th className="p-4 text-right">Last Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredCustomers.map((cust) => {
                    // RFM Color helper
                    const getRfmColor = (seg) => {
                      switch (seg) {
                        case 'Champions': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        case 'Loyal Customers': return 'bg-green-500/10 text-green-400 border border-green-500/20';
                        case 'Potential Loyalists': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                        case 'Recent Customers': return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
                        case "Can't Lose Them": return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                        case 'At Risk': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
                        case 'Lost High Value': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                        case 'Lost': return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
                        default: return 'bg-slate-700/10 text-slate-400 border border-slate-700/20';
                      }
                    };

                    // Persona Color helper
                    const getPersonaColor = (pers) => {
                      switch (pers) {
                        case 'VIP Dormants': return 'bg-pink-500/10 text-pink-400 border border-pink-500/20';
                        case 'Loyal High-Spenders': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
                        case 'Lapsed Buyers': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                        case 'New Shoppers': return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
                        case 'Bargain Hunters': return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
                        default: return 'bg-slate-700/10 text-slate-400 border border-slate-700/20';
                      }
                    };

                    return (
                      <tr 
                        key={cust.id} 
                        onClick={() => handleRowClick(cust.id)}
                        className={`hover:bg-slate-900/30 transition-colors cursor-pointer ${
                          selectedCustomerId === cust.id ? 'bg-slate-900/40' : ''
                        }`}
                      >
                        <td className="p-4 font-semibold text-slate-200">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-800/80 flex items-center justify-center text-[10px] text-slate-400 uppercase font-bold border border-slate-700/50">
                              {cust.name.substring(0, 2)}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-semibold text-slate-200">{cust.name}</p>
                                {cust.opted_out && (
                                  <span className="px-1.5 py-0.2 text-[8px] bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded font-bold tracking-tight">DNC</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 font-normal mt-0.5">{cust.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-400">{cust.city}</td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`inline-block px-1.5 py-0.2 text-[8px] rounded uppercase font-bold tracking-wider ${
                              cust.tier === 'gold' 
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                                : cust.tier === 'silver'
                                ? 'bg-slate-300/10 text-slate-300 border border-slate-300/20'
                                : 'bg-orange-700/10 text-orange-500 border border-orange-500/20'
                            }`}>
                              {cust.tier}
                            </span>
                            {cust.persona && (
                              <span className={`inline-block px-1.5 py-0.2 text-[8px] rounded uppercase font-bold tracking-wider ${getPersonaColor(cust.persona)}`}>
                                {cust.persona}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-block px-2 py-0.5 text-[9px] rounded-full uppercase font-bold tracking-wider ${getRfmColor(cust.rfm_segment)}`}>
                            {cust.rfm_segment || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono text-slate-400 font-semibold">{cust.order_count}</td>
                        <td className="p-4 text-right font-mono text-slate-200 font-bold">₹{cust.total_spend.toLocaleString('en-IN')}</td>
                        <td className="p-4 text-right text-slate-500 font-mono text-[11px]">
                          {cust.last_order_date 
                            ? new Date(cust.last_order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'Never'
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Slide-over detailed timeline profile panel (5 cols) */}
      {selectedCustomerId && (
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col h-[700px] transition-all duration-300 relative">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-800 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-slate-200 text-sm">Shopper Profile Card</h4>
                {customerDetail && (
                  <span className={`px-2 py-0.5 text-[8px] font-bold rounded uppercase tracking-wider ${
                    customerDetail.tier === 'gold' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                    customerDetail.tier === 'silver' ? 'bg-slate-300/15 text-slate-300 border border-slate-300/20' :
                    'bg-orange-700/15 text-orange-500 border border-orange-500/20'
                  }`}>
                    {customerDetail.tier}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: CUST-{selectedCustomerId}</p>
            </div>
            <button 
              onClick={handleCloseDetail}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer animate-fade-in"
            >
              <X size={15} />
            </button>
          </div>

          {isDetailLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs font-mono">
              <RefreshCw size={18} className="animate-spin text-blue-500 mb-2" />
              <span>Fetching shopper profile...</span>
            </div>
          ) : !customerDetail ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Failed to load profile.
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              {/* Profile Details */}
              <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-xl space-y-2.5 text-xs">
                <div className="flex justify-between items-start">
                  <p className="font-bold text-slate-200 text-sm">{customerDetail.name}</p>
                  {customerDetail.opted_out && (
                    <span className="px-2 py-0.5 text-[8px] bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded font-bold uppercase tracking-wider">Do Not Contact (DNC)</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] pt-1 border-t border-slate-900">
                  <span className="flex items-center gap-1.5"><MapPin size={11} className="text-slate-500" /> {customerDetail.city}</span>
                  <span className="text-right truncate">{customerDetail.email}</span>
                  <span className="flex items-center gap-1.5"><Calendar size={11} className="text-slate-500" /> Joined {new Date(customerDetail.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                  <span className="text-right font-mono text-[10px] text-slate-500">{customerDetail.phone}</span>
                </div>
              </div>

              {/* RFM segment & Persona Breakdown */}
              <div className="p-4 bg-slate-900/30 border border-slate-800/80 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400 font-semibold font-mono text-[10px] uppercase">RFM Segment:</span>
                  <span className="px-2.5 py-0.5 text-[9px] rounded-full uppercase font-bold tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {customerDetail.rfm_segment || 'Potential Loyalist'}
                  </span>
                </div>
                {customerDetail.persona && (
                  <div className="flex justify-between items-center text-xs border-t border-slate-800/40 pt-2">
                    <span className="text-slate-400 font-semibold font-mono text-[10px] uppercase">AI Persona:</span>
                    <span className="px-2.5 py-0.5 text-[9px] rounded-full uppercase font-bold tracking-wider bg-pink-500/10 text-pink-400 border border-pink-500/20">
                      {customerDetail.persona}
                    </span>
                  </div>
                )}

                {/* Score Indicators */}
                <div className="grid grid-cols-3 gap-2 border-t border-slate-800/40 pt-2 text-[10px]">
                  <div className="text-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                    <p className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">Recency (R)</p>
                    <p className="text-sm font-black text-slate-200 mt-1 font-mono">{customerDetail.rfm_recency || 3} <span className="text-[10px] text-slate-500 font-normal">/ 5</span></p>
                  </div>
                  <div className="text-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                    <p className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">Frequency (F)</p>
                    <p className="text-sm font-black text-slate-200 mt-1 font-mono">{customerDetail.rfm_frequency || 3} <span className="text-[10px] text-slate-500 font-normal">/ 5</span></p>
                  </div>
                  <div className="text-center bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                    <p className="text-slate-500 uppercase tracking-widest text-[8px] font-bold">Monetary (M)</p>
                    <p className="text-sm font-black text-slate-200 mt-1 font-mono">{customerDetail.rfm_monetary || 3} <span className="text-[10px] text-slate-500 font-normal">/ 5</span></p>
                  </div>
                </div>
              </div>

              {/* Spend Stats */}
              <div className="grid grid-cols-3 gap-2 bg-slate-950/20 p-2.5 rounded-lg border border-slate-900/60 text-center">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Total Revenue</p>
                  <p className="text-xs font-bold text-slate-200 font-mono mt-0.5">₹{customerDetail.total_spend.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Order Count</p>
                  <p className="text-xs font-bold text-slate-200 font-mono mt-0.5">{customerDetail.order_count}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">AOV</p>
                  <p className="text-xs font-bold text-blue-400 font-mono mt-0.5">
                    ₹{customerDetail.order_count > 0 ? (customerDetail.total_spend / customerDetail.order_count).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 0}
                  </p>
                </div>
              </div>

              {/* Combined Timeline */}
              <div className="flex-1 flex flex-col min-h-0">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <Activity size={10} /> Chronological Timeline
                </h5>
                
                {timelineItems.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-slate-500 text-[11px]">
                    No activity registered for this customer.
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 space-y-4 relative pl-3 border-l border-slate-900">
                    {timelineItems.map((item, index) => {
                      const isOrder = item.type === 'order';
                      return (
                        <div key={index} className="relative">
                          {/* Timeline dot marker */}
                          <div className={`absolute -left-[16px] top-1.5 w-2 h-2 rounded-full border ${
                            isOrder 
                              ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]' 
                              : 'bg-blue-500 border-blue-400 shadow-[0_0_6px_rgba(59,130,246,0.3)]'
                          }`} />

                          <div className="bg-slate-900/30 border border-slate-900/80 hover:border-slate-800/80 p-3 rounded-xl space-y-1.5 transition-colors">
                            {/* Title & timestamp */}
                            <div className="flex justify-between items-start gap-3">
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(item.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${
                                isOrder 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                {isOrder ? 'Order placed' : 'Campaign Received'}
                              </span>
                            </div>

                            {/* Details body */}
                            {isOrder ? (
                              <div className="text-xs space-y-1.5">
                                <p className="font-semibold text-slate-300">Placed Order #{item.id} via {item.channel.toUpperCase()}</p>
                                <p className="font-bold text-emerald-400 font-mono">₹{item.amount.toLocaleString('en-IN')}</p>
                                {item.products.length > 0 && (
                                  <div className="text-[10px] text-slate-400 space-y-0.5 bg-slate-950/50 p-1.5 rounded border border-slate-900">
                                    {item.products.map((p, idx) => (
                                      <p key={idx} className="truncate">🛒 {p.name || p.product_name || 'Product'} <span className="text-slate-600 font-bold">x{p.qty || p.quantity || 1}</span></p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs space-y-1.5">
                                <p className="font-semibold text-slate-300">Campaign: "{item.campaignName}"</p>
                                <p className="text-[10px] text-slate-400 italic bg-slate-950/20 p-2 rounded border border-slate-900/30">
                                  "{item.message}"
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  Channel: <span className="font-semibold">{item.channel.toUpperCase()}</span> | Status: <span className={`font-semibold uppercase ${
                                    item.status === 'clicked' ? 'text-blue-400' :
                                    item.status === 'opened' ? 'text-violet-400' :
                                    item.status === 'delivered' ? 'text-emerald-400' :
                                    item.status === 'failed' ? 'text-pink-500' : 'text-slate-400'
                                  }`}>{item.status}</span>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
