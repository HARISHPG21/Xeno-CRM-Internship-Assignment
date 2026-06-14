const getApiBaseUrl = () => {
  // If we have an explicit VITE_API_URL set in env
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`;
  }
  // In production (Vercel) or any non-localhost environment, use relative path
  // All /api/* requests are handled by the FastAPI serverless function
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return '/api';
  }
  // Local dev: Vite proxies /api -> http://localhost:8000
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

export const api = {
  // Seed Database
  async seedDatabase(numCustomers = 50) {
    const res = await fetch(`${API_BASE_URL}/seed?num_customers=${numCustomers}`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to seed database');
    return res.json();
  },

  // Customers
  async getCustomers(params = {}) {
    const query = new URLSearchParams();
    if (params.tier) query.append('tier', params.tier);
    if (params.city) query.append('city', params.city);
    if (params.limit) query.append('limit', params.limit);
    if (params.skip) query.append('skip', params.skip);
    const res = await fetch(`${API_BASE_URL}/customers?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch customers');
    return res.json();
  },

  // Segments
  async getSegments() {
    const res = await fetch(`${API_BASE_URL}/segments`);
    if (!res.ok) throw new Error('Failed to fetch segments');
    return res.json();
  },

  async createSegment(data) {
    const res = await fetch(`${API_BASE_URL}/segments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create segment');
    return res.json();
  },

  async getSegmentCustomers(segmentId) {
    const res = await fetch(`${API_BASE_URL}/segments/${segmentId}/customers`);
    if (!res.ok) throw new Error('Failed to fetch segment customers');
    return res.json();
  },

  // Campaigns
  async getCampaigns() {
    const res = await fetch(`${API_BASE_URL}/campaigns`);
    if (!res.ok) throw new Error('Failed to fetch campaigns');
    return res.json();
  },

  async createCampaign(data) {
    const res = await fetch(`${API_BASE_URL}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create campaign');
    return res.json();
  },

  async getCampaignDetail(campaignId) {
    const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}`);
    if (!res.ok) throw new Error('Failed to fetch campaign details');
    return res.json();
  },

  async getCampaignCommunications(campaignId) {
    const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/communications`);
    if (!res.ok) throw new Error('Failed to fetch communications');
    return res.json();
  },

  async launchCampaign(campaignId) {
    const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/launch`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to launch campaign');
    }
    return res.json();
  },

  // AI Chat
  async getChatHistory() {
    const res = await fetch(`${API_BASE_URL}/chat/history`);
    if (!res.ok) throw new Error('Failed to fetch chat history');
    return res.json();
  },

  async sendMessage(message, history, onChunk) {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) throw new Error('Failed to send message to Xeno');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // Hold remaining fragment

      for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned.startsWith('data: ')) {
          const dataStr = cleaned.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.token) {
              fullText += parsed.token;
              if (onChunk) onChunk(fullText);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (e) {
            console.error('Failed to parse SSE chunk:', cleaned, e);
          }
        }
      }
    }

    // Process remainder
    if (buffer.trim().startsWith('data: ')) {
      const dataStr = buffer.trim().slice(6);
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.token) {
            fullText += parsed.token;
            if (onChunk) onChunk(fullText);
          }
        } catch (e) {}
      }
    }

    return { id: Date.now(), role: 'assistant', content: fullText, created_at: new Date().toISOString() };
  },

  async clearChat() {
    const res = await fetch(`${API_BASE_URL}/chat/clear`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear chat history');
    return res.json();
  },

  async getCustomerDetail(customerId) {
    const res = await fetch(`${API_BASE_URL}/customers/${customerId}`);
    if (!res.ok) throw new Error('Failed to fetch customer details');
    return res.json();
  },

  async uploadCustomersCsv(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE_URL}/customers/upload`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to upload CSV');
    }
    return res.json();
  },

  async recalculateRfm() {
    const res = await fetch(`${API_BASE_URL}/rfm/recalculate`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to recalculate RFM scores');
    return res.json();
  },

  async getPersonas() {
    const res = await fetch(`${API_BASE_URL}/personas`);
    if (!res.ok) throw new Error('Failed to fetch personas');
    return res.json();
  },

  async getSegmentOverlap(segmentId) {
    const res = await fetch(`${API_BASE_URL}/segments/${segmentId}/overlap`);
    if (!res.ok) throw new Error('Failed to fetch segment overlap');
    return res.json();
  },

  async analyseCampaign(campaignId) {
    const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/analyse`);
    if (!res.ok) throw new Error('Failed to analyze campaign');
    return res.json();
  },

  async scheduleCampaign(campaignId, scheduledAt) {
    const res = await fetch(`${API_BASE_URL}/campaigns/${campaignId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: scheduledAt })
    });
    if (!res.ok) throw new Error('Failed to schedule campaign');
    return res.json();
  }
};
