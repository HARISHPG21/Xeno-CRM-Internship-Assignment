import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Database, Eye, Users, ChevronRight, HelpCircle } from 'lucide-react';

export default function SegmentList() {
  const [segments, setSegments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Drawer/Modal preview states
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [activeSegmentName, setActiveSegmentName] = useState('');
  const [previewCustomers, setPreviewCustomers] = useState([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [overlaps, setOverlaps] = useState([]);
  const [isOverlapsLoading, setIsOverlapsLoading] = useState(false);
  const [drawerTab, setDrawerTab] = useState('customers'); // 'customers' or 'overlaps'

  useEffect(() => {
    loadSegments();
  }, []);

  const loadSegments = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSegments();
      setSegments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenPreview = async (segmentId, segmentName) => {
    setActiveSegmentId(segmentId);
    setActiveSegmentName(segmentName);
    setDrawerTab('customers');
    setIsPreviewLoading(true);
    setIsOverlapsLoading(true);
    
    try {
      const custs = await api.getSegmentCustomers(segmentId);
      setPreviewCustomers(custs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsPreviewLoading(false);
    }

    try {
      const overlapData = await api.getSegmentOverlap(segmentId);
      setOverlaps(overlapData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsOverlapsLoading(false);
    }
  };

  const handleClosePreview = () => {
    setActiveSegmentId(null);
    setPreviewCustomers([]);
    setOverlaps([]);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* SEGMENTS LIST */}
      <div className={`${activeSegmentId ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4 transition-all duration-300`}>
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="text-lg font-bold text-slate-200">Customer Segments</h3>
            <p className="text-xs text-slate-500 mt-0.5">Audiences filtered dynamically by transaction metrics and attributes.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs rounded-2xl">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs rounded-2xl">
            No segments created yet. Talk to Zeno AI Copilot to define custom segment criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {segments.map((seg) => (
              <div 
                key={seg.id}
                onClick={() => handleOpenPreview(seg.id, seg.name)}
                className={`glass-card p-5 rounded-2xl space-y-4 cursor-pointer flex flex-col justify-between hover:border-blue-500/40 transition-all ${
                  activeSegmentId === seg.id ? 'border-blue-500/80 ring-1 ring-blue-500/20 bg-slate-900/60' : ''
                }`}
              >
                <div>
                  <div className="flex justify-between items-start gap-3">
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-slate-200 text-sm">{seg.name}</h4>
                      <p className="text-[10px] text-slate-500 font-mono">ID: SEG-{seg.id} | Created by {seg.created_by.toUpperCase()}</p>
                    </div>
                    <span className="px-2.5 py-1 bg-slate-950/60 border border-slate-800 text-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0">
                      <Users size={12} className="text-slate-400" />
                      {seg.customer_count}
                    </span>
                  </div>
                  
                  {seg.description && (
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">{seg.description}</p>
                  )}
                </div>

                {/* Filter details */}
                <div className="space-y-2.5 border-t border-slate-800/60 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(seg.filter_config).map(([key, val]) => {
                      if (val === null || val === undefined || val === '') return null;
                      let label = '';
                      if (key === 'min_spend') label = `Spend ≥ ₹${val.toLocaleString('en-IN')}`;
                      if (key === 'max_spend') label = `Spend ≤ ₹${val.toLocaleString('en-IN')}`;
                      if (key === 'inactive_days') label = `Inactive for ${val} days`;
                      if (key === 'tier') label = `Tier: ${val}`;
                      if (key === 'city') label = `City: ${val}`;
                      if (key === 'min_orders') label = `Orders ≥ ${val}`;
                      return (
                        <span key={key} className="px-2 py-0.5 bg-slate-950/60 text-slate-400 border border-slate-900 text-[10px] rounded">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenPreview(seg.id, seg.name);
                    }}
                    className="w-full py-1.5 bg-blue-600/10 border border-blue-500/10 hover:border-blue-500/30 text-blue-400 font-semibold text-[10px] rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Eye size={11} /> Preview Audience
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AUDIENCE PREVIEW DRAWER (Slide in on right) */}
      {activeSegmentId && (
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col h-[600px] relative transition-all duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
            <div>
              <h4 className="font-bold text-slate-200 text-sm">Audience Explorer</h4>
              <p className="text-[10px] text-slate-500 truncate max-w-xs">{activeSegmentName}</p>
            </div>
            <button 
              onClick={handleClosePreview}
              className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1 rounded hover:bg-slate-800"
            >
              Close
            </button>
          </div>

          {/* Tab Buttons */}
          <div className="flex border-b border-slate-900 mb-4 p-1 bg-slate-950/40 rounded-lg">
            <button
              onClick={() => setDrawerTab('customers')}
              className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                drawerTab === 'customers' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Shoppers ({previewCustomers.length})
            </button>
            <button
              onClick={() => setDrawerTab('overlaps')}
              className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                drawerTab === 'overlaps' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Segment Overlaps
            </button>
          </div>

          {drawerTab === 'customers' ? (
            isPreviewLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono">
                Loading matching customers...
              </div>
            ) : previewCustomers.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                No matching customers.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {previewCustomers.map((cust) => (
                  <div key={cust.id} className="p-3 bg-slate-950/30 border border-slate-900 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-200 truncate">{cust.name}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate">{cust.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-slate-300 font-semibold">₹{cust.total_spend.toLocaleString('en-IN')}</p>
                      <span className={`inline-block px-1.5 py-0.5 text-[8px] rounded uppercase font-bold tracking-wider mt-1 ${
                        cust.tier === 'gold' 
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
                          : cust.tier === 'silver'
                          ? 'bg-slate-300/10 text-slate-300 border border-slate-300/20'
                          : 'bg-orange-700/10 text-orange-500 border border-orange-500/20'
                      }`}>
                        {cust.tier}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            isOverlapsLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs font-mono">
                Calculating overlaps...
              </div>
            ) : overlaps.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                No other segments available for overlap check.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3.5">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold px-1">Co-membership overlap:</p>
                {overlaps.map((overlap) => (
                  <div key={overlap.segment_id} className="p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl space-y-2">
                    <div className="flex justify-between items-start text-xs">
                      <div>
                        <p className="font-bold text-slate-300">{overlap.segment_name}</p>
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5">Overlap: {overlap.overlap_count} customer{overlap.overlap_count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-xs font-mono font-extrabold text-blue-400">
                        {overlap.percentage}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-900">
                      <div 
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${overlap.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
