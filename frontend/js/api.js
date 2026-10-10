/**
 * Enterprise API Client for Meta Ads Backend with Multi-Tenant Session Isolation.
 */

const API_BASE = '/api';

export const apiClient = {
  getSessionId() {
    let sid = localStorage.getItem('meta_ads_session_id');
    if (!sid) {
      sid = 'ws_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
      localStorage.setItem('meta_ads_session_id', sid);
    }
    return sid;
  },

  resetSessionId() {
    const sid = 'ws_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4);
    localStorage.setItem('meta_ads_session_id', sid);
    return sid;
  },

  async _fetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      'X-Session-ID': this.getSessionId(),
    };
    return fetch(url, { ...options, headers });
  },

  async getStatus() {
    const res = await this._fetch(`${API_BASE}/status`);
    if (!res.ok) throw new Error(`Status check failed: ${res.statusText}`);
    return res.json();
  },

  async getHistory() {
    const res = await this._fetch(`${API_BASE}/history`);
    if (!res.ok) throw new Error(`History fetch failed: ${res.statusText}`);
    return res.json();
  },

  async clearHistory() {
    const res = await this._fetch(`${API_BASE}/history`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`History clear failed: ${res.statusText}`);
    return res.json();
  },

  async searchAdvertisers(q, country = 'ALL') {
    const res = await this._fetch(`${API_BASE}/resolve/search?q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`);
    if (!res.ok) throw new Error(`Search failed: ${res.statusText}`);
    return res.json();
  },

  async scrapeAds({ targets, country = 'ALL', active_status = 'all', media_type = 'all', max_ads = 30 }) {
    const res = await this._fetch(`${API_BASE}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targets,
        country,
        active_status,
        media_type,
        max_ads: parseInt(max_ads, 10),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Scrape failed: ${res.statusText}`);
    }
    return res.json();
  },

  async generateCounterAd(ad) {
    const res = await this._fetch(`${API_BASE}/ai/counter-ad`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && err.detail) || `Counter-ad generation failed (${res.status})`);
    }
    return res.json();
  },

  async generateStrategyReport(ads) {
    const res = await this._fetch(`${API_BASE}/ai/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && err.detail) || `Strategy report failed (${res.status})`);
    }
    return res.json();
  },

  async generateDossier(ads) {
    const res = await this._fetch(`${API_BASE}/ai/dossier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && err.detail) || `Dossier generation failed (${res.status})`);
    }
    return res.json();
  },

  async queryCopilot(messagesOrQuestion, ads) {
    const payload = Array.isArray(messagesOrQuestion)
      ? { messages: messagesOrQuestion, ads }
      : { question: messagesOrQuestion, ads };

    const res = await this._fetch(`${API_BASE}/ai/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error((err && err.detail) || `Copilot query failed (${res.status})`);
    }
    return res.json();
  },
};
