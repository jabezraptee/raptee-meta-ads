import { apiClient } from './api.js';
import { createAdCard } from './components/ad_card.js';
import { SearchBarComponent } from './components/search_bar.js';

class AppController {
  constructor() {
    this.ads = [];
    this.activeTab = 'gallery';
    this.filterText = '';
    this.sortMode = 'longevity';
    this.init();
  }

  async init() {
    this.initElements();
    this.bindEvents();
    await this.loadInitialData();
  }

  initElements() {
    // Scraper elements
    this.scrapeForm = document.getElementById('scrape-form');
    this.statusSelect = document.getElementById('status-select');
    this.countrySelect = document.getElementById('country-select');
    this.maxAdsInput = document.getElementById('max-ads-input');
    this.submitBtn = document.getElementById('submit-btn');
    this.btnSpinner = document.getElementById('btn-spinner');
    this.btnText = document.getElementById('btn-text');

    // Official Meta Ad Library Brand Page ID Search Bar
    this.searchBar = new SearchBarComponent({
      containerId: 'search-bar-container',
      onTargetsChanged: () => {},
      getCountry: () => this.countrySelect?.value || 'IN',
    });

    // Tabs
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.galleryCount = document.getElementById('gallery-count');

    // Toolbars
    this.sortSelect = document.getElementById('sort-select');
    this.filterInput = document.getElementById('filter-input');
    this.btnDossier = document.getElementById('btn-dossier');
    this.btnStrategy = document.getElementById('btn-strategy');

    // Views
    this.adsGrid = document.getElementById('ads-grid');
    this.emptyState = document.getElementById('empty-state');
    this.scrapeStatusBanner = document.getElementById('scrape-status-banner');
    this.emptyStateTitle = document.getElementById('empty-state-title');
    this.emptyStateSubtitle = document.getElementById('empty-state-subtitle');
    this.emptyStateLogs = document.getElementById('empty-state-logs');
    this.comparisonContainer = document.getElementById('comparison-container');
    this.velocityContainer = document.getElementById('velocity-container');
    this.gapsContainer = document.getElementById('gaps-container');

    // Floating Chatbot Widget
    this.floatingCopilotBtn = document.getElementById('btn-floating-copilot');
    this.chatWidget = document.getElementById('copilot-chat-widget');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatForm = document.getElementById('chat-form');
    this.chatInput = document.getElementById('chat-input');
    this.chatSendBtn = document.getElementById('chat-send-btn');
    this.chatSubtitle = document.getElementById('chat-subtitle');
    this.btnClearChat = document.getElementById('btn-clear-chat');
    this.btnCloseChat = document.getElementById('btn-close-chat');
    this.chatHistory = [];

    // Dedicated Beat This Ad Modal
    this.beatAdModal = document.getElementById('beat-ad-modal');
    this.beatAdBody = document.getElementById('beat-ad-body');
    this.btnCloseBeatAd = document.getElementById('btn-close-beat-ad');

    this.dossierModal = document.getElementById('dossier-modal');
    this.dossierBody = document.getElementById('dossier-body');
    this.btnCloseDossier = document.getElementById('btn-close-dossier');

    this.strategyModal = document.getElementById('strategy-modal');
    this.strategyBody = document.getElementById('strategy-body');
    this.btnCloseStrategy = document.getElementById('btn-close-strategy');
    this.aiStatusBadge = document.getElementById('ai-status');

    // Private Workspace Session Controls
    this.workspaceIdText = document.getElementById('workspace-id-text');
    this.btnResetWorkspace = document.getElementById('btn-reset-workspace');
  }

  bindEvents() {
    // Form Scrape
    this.scrapeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleScrape();
    });

    // Private Workspace Reset
    if (this.btnResetWorkspace) {
      this.btnResetWorkspace.addEventListener('click', async () => {
        if (confirm('Start a fresh private workspace? Your current search history will be cleared.')) {
          await apiClient.clearHistory().catch(() => {});
          apiClient.resetSessionId();
          this.updateWorkspaceBadge();
          this.ads = [];
          this.renderCurrentView();
          if (this.searchBar) {
            this.searchBar.targets = [];
            this.searchBar.updateChips();
          }
        }
      });
    }

    // Tabs switching
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Sort & Filter
    this.sortSelect.addEventListener('change', (e) => {
      this.sortMode = e.target.value;
      this.renderCurrentView();
    });

    this.filterInput.addEventListener('input', (e) => {
      this.filterText = e.target.value.trim().toLowerCase();
      this.renderCurrentView();
    });


    // Intelligence Modals & Chatbot
    this.btnDossier.addEventListener('click', () => this.openDossierModal());
    this.btnStrategy.addEventListener('click', () => this.openStrategyModal());
    this.floatingCopilotBtn.addEventListener('click', () => this.toggleChatWidget());

    // Chatbot Widget Actions
    this.btnCloseChat.addEventListener('click', () => this.closeChatWidget());
    this.btnClearChat.addEventListener('click', () => this.clearChat());
    this.chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));

    // Modal Close buttons
    this.btnCloseBeatAd.addEventListener('click', () => this.beatAdModal.style.display = 'none');
    this.btnCloseDossier.addEventListener('click', () => this.dossierModal.style.display = 'none');
    this.btnCloseStrategy.addEventListener('click', () => this.strategyModal.style.display = 'none');

    // Close modal on overlay click
    [this.beatAdModal, this.dossierModal, this.strategyModal].forEach(m => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.style.display = 'none';
      });
    });
  }

  updateWorkspaceBadge() {
    if (this.workspaceIdText) {
      const sid = apiClient.getSessionId();
      const shortId = sid.replace('ws_', '').toUpperCase();
      this.workspaceIdText.textContent = `Workspace #${shortId}`;
    }
  }

  async loadInitialData() {
    this.updateWorkspaceBadge();
    try {
      const [history, status] = await Promise.all([
        apiClient.getHistory().catch(() => []),
        apiClient.getStatus().catch(() => null),
      ]);
      this.ads = history || [];
      if (status && this.aiStatusBadge) {
        const isLive = status.llm_configured;
        this.aiStatusBadge.innerHTML = `<span class="status-dot" style="background:${isLive ? '#10b981' : '#f59e0b'};"></span> AI: ${this.escape(status.llm_model || 'Mistral')} ${isLive ? '(Live)' : '(Demo Mode)'}`;
        this.aiStatusBadge.title = isLive
          ? `Active LLM: ${status.llm_model}`
          : 'Using intelligent deterministic fallback. Add LLM_API_KEY in .env to activate live completions.';
        this.llmModel = status.llm_model || 'Mistral';
      }
      this.renderCurrentView();
    } catch (err) {
      console.warn('Initial load:', err);
    }
  }

  async handleScrape() {
    let targets = this.searchBar.getTargets();
    if (!targets || targets.length === 0) {
      const raw = this.searchBar.input?.value.trim();
      if (raw) {
        this.searchBar.commitDirectInput();
        targets = this.searchBar.getTargets();
      }
    }

    if (!targets || targets.length === 0) {
      alert('Please find and select at least one official brand Meta Page ID (e.g. Ultraviolette, Raptee.HV).');
      return;
    }

    this.setLoading(true);

    try {
      const response = await apiClient.scrapeAds({
        targets,
        country: this.countrySelect.value,
        active_status: this.statusSelect.value,
        media_type: 'all',
        max_ads: parseInt(this.maxAdsInput.value, 10) || 30,
      });

      this.lastScrapeResponse = response;

      if (response && response.items) {
        this.ads = response.items;
      } else {
        this.ads = [];
      }
      this.renderCurrentView();
      this.renderScrapeStatus(response);
    } catch (err) {
      this.lastScrapeResponse = {
        success: false,
        total_ads: 0,
        logs: [`System Request Error: ${err.message}`],
        error: err.message,
      };
      this.renderCurrentView();
      this.renderScrapeStatus(this.lastScrapeResponse);
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(isLoading) {
    this.submitBtn.disabled = isLoading;
    if (this.btnSpinner) this.btnSpinner.style.display = isLoading ? 'inline-block' : 'none';
    if (this.btnText) {
      this.btnText.textContent = isLoading ? 'Scraping Meta Ad Library...' : 'Start Scraper';
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    this.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    this.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
    this.renderCurrentView();
  }

  renderCurrentView() {
    // Update count badge
    if (this.galleryCount) {
      this.galleryCount.textContent = this.ads.length;
    }
    this.updateChatStatus();

    if (this.activeTab === 'gallery') {
      this.renderGallery();
    } else if (this.activeTab === 'comparison') {
      this.renderComparison();
    } else if (this.activeTab === 'velocity') {
      this.renderVelocity();
    } else if (this.activeTab === 'gaps') {
      this.renderMarketGaps();
    }
  }

  getFilteredAndSortedAds() {
    let list = [...this.ads];

    if (this.filterText) {
      list = list.filter(a => {
        const text = `${a.pageName || ''} ${a.adContent || ''} ${a.adTitle || ''} ${a.adCallToActionText || ''} ${a.adArchiveId || ''}`.toLowerCase();
        return text.includes(this.filterText);
      });
    }

    if (this.sortMode === 'longevity') {
      list.sort((a, b) => (b.daysRunning || 0) - (a.daysRunning || 0));
    } else if (this.sortMode === 'newest') {
      list.sort((a, b) => (new Date(b.startDate || 0)) - (new Date(a.startDate || 0)));
    } else if (this.sortMode === 'copies') {
      list.sort((a, b) => (b.collationCount || 1) - (a.collationCount || 1));
    } else if (this.sortMode === 'oldest') {
      list.sort((a, b) => (new Date(a.startDate || 0)) - (new Date(b.startDate || 0)));
    }

    return list;
  }

  renderGallery() {
    this.adsGrid.innerHTML = '';
    const ads = this.getFilteredAndSortedAds();

    if (ads.length === 0) {
      this.emptyState.style.display = 'block';
      this.adsGrid.style.display = 'none';

      const resp = this.lastScrapeResponse;
      if (resp && resp.logs && resp.logs.length > 0) {
        if (this.emptyStateTitle) {
          this.emptyStateTitle.textContent = resp.total_ads === 0 
            ? '0 Ads Fetched From Meta Ad Library' 
            : 'No Ads Match Current Filters';
        }
        if (this.emptyStateSubtitle) {
          this.emptyStateSubtitle.textContent = 'Exact system diagnostic output from Meta scraper:';
        }
        if (this.emptyStateLogs) {
          this.emptyStateLogs.innerHTML = `
            <div class="empty-logs-box">
              <div class="empty-logs-title">
                <span>📋 System Diagnostic Log Details</span>
                <span style="font-family: monospace; font-size: 0.75rem; font-weight: normal; color: #94a3b8;">${resp.duration_seconds ? resp.duration_seconds + 's execution' : ''}</span>
              </div>
              <ul class="empty-log-list">
                ${resp.logs.map(log => `
                  <li class="log-item">
                    <span class="log-bullet">•</span>
                    <span class="log-text">${this.escape(log)}</span>
                  </li>
                `).join('')}
              </ul>
              ${resp.error ? `<div class="banner-error-detail">System Error: <code>${this.escape(resp.error)}</code></div>` : ''}
            </div>
          `;
          this.emptyStateLogs.style.display = 'block';
        }
      }
      return;
    }

    this.emptyState.style.display = 'none';
    this.adsGrid.style.display = 'grid';

    ads.forEach(ad => {
      const card = createAdCard(ad, (clickedAd) => this.handleBeatThisAd(clickedAd));
      this.adsGrid.appendChild(card);
    });
  }

  renderComparison() {
    // Aggregate by pageName
    const brands = {};
    this.ads.forEach(ad => {
      const name = ad.pageName || 'Unknown';
      if (!brands[name]) {
        brands[name] = {
          name,
          total: 0,
          active: 0,
          video: 0,
          carousel: 0,
          totalDays: 0,
          evergreens: 0,
          totalCopies: 0,
          maxCopies: 0,
        };
      }
      brands[name].total += 1;
      if (ad.isActive !== false) brands[name].active += 1;
      if (ad.adFormat === 'video' || (ad.videoUrls && ad.videoUrls.length > 0)) brands[name].video += 1;
      if (ad.cards && ad.cards.length > 1) brands[name].carousel += 1;
      brands[name].totalDays += (ad.daysRunning || 1);
      if ((ad.daysRunning || 1) >= 30) brands[name].evergreens += 1;
      const copies = ad.collationCount || 1;
      brands[name].totalCopies += copies;
      if (copies > brands[name].maxCopies) brands[name].maxCopies = copies;
    });

    const rows = Object.values(brands);
    if (rows.length === 0) {
      this.comparisonContainer.innerHTML = '<p style="color:#64748b;text-align:center;padding:2rem;">No competitor data to compare yet. Run a scrape first!</p>';
      return;
    }

    this.comparisonContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3 style="margin:0;color:#fff;">Competitor Creative & Longevity Comparison</h3>
        <span style="font-size:0.75rem;padding:4px 10px;border-radius:4px;background:#142247;color:#38bdf8;font-weight:600;">
          ${rows.length} Competitors Tracked
        </span>
      </div>
      <table class="analytics-table">
        <thead>
          <tr>
            <th>Competitor Brand</th>
            <th>Total Ads</th>
            <th>Active %</th>
            <th>Videos</th>
            <th>Carousels</th>
            <th>Avg Longevity</th>
            <th>Scaling Intensity (Copies)</th>
            <th>Evergreen Winners (30+d)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const avgCopies = Math.round((r.totalCopies / r.total) * 10) / 10;
            return `
            <tr>
              <td style="font-weight:600;color:#fff;">${this.escape(r.name)}</td>
              <td>${r.total}</td>
              <td style="color:#10b981;">${Math.round((r.active / r.total) * 100)}%</td>
              <td>${r.video} (${Math.round((r.video / r.total) * 100)}%)</td>
              <td>${r.carousel}</td>
              <td>${Math.round(r.totalDays / r.total)} days</td>
              <td style="color:#38bdf8;">Avg ${avgCopies} • Max ${r.maxCopies}</td>
              <td style="color:#fb7185;font-weight:700;">🔥 ${r.evergreens} ads</td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    `;
  }

  renderVelocity() {
    if (!this.ads || this.ads.length === 0) {
      this.velocityContainer.innerHTML = `
        <div style="text-align:center;padding:3rem;">
          <div style="font-size:2rem;margin-bottom:0.75rem;">📈</div>
          <h3 style="color:#fff;margin-bottom:0.5rem;">No Competitor Ads Loaded</h3>
          <p style="color:#94a3b8;font-size:0.85rem;">Scrape competitor brands above to view their live launch cadence, creative test batches, and evergreen winner timeline.</p>
        </div>
      `;
      return;
    }

    const totalAds = this.ads.length;

    // Parse dates and sort chronologically (newest first)
    const adsWithDates = this.ads.map(ad => {
      let time = 0;
      if (ad.startDate) {
        const d = new Date(ad.startDate);
        time = isNaN(d.getTime()) ? 0 : d.getTime();
      }
      return { ad, time };
    });
    adsWithDates.sort((a, b) => b.time - a.time);

    // Date range & velocity calculations
    const validTimes = adsWithDates.map(x => x.time).filter(t => t > 0);
    const earliestTime = validTimes.length ? Math.min(...validTimes) : 0;
    const latestTime = validTimes.length ? Math.max(...validTimes) : 0;
    const spanDays = earliestTime && latestTime ? Math.max(1, Math.round((latestTime - earliestTime) / (1000 * 60 * 60 * 24))) : 30;
    const spanWeeks = Math.max(1, Math.round((spanDays / 7) * 10) / 10);
    const cadencePerWeek = Math.round((totalAds / spanWeeks) * 10) / 10;

    // Strategic Performance Segments
    const evergreens = this.ads.filter(a => (a.daysRunning || 1) >= 30);
    const recentTests = this.ads.filter(a => (a.daysRunning || 1) <= 14);
    const evergreenPct = Math.round((evergreens.length / totalAds) * 100);

    // Format metrics
    const videoCount = this.ads.filter(a => a.adFormat === 'video').length;
    const carouselCount = this.ads.filter(a => a.adFormat === 'carousel').length;
    const imageCount = this.ads.filter(a => a.adFormat === 'image').length;

    // Format longevity averages
    const formatDurations = { video: [], carousel: [], image: [] };
    this.ads.forEach(a => {
      const fmt = (a.adFormat || 'image').toLowerCase();
      if (formatDurations[fmt]) formatDurations[fmt].push(a.daysRunning || 1);
    });
    const avgDuration = arr => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    const maxDuration = arr => arr.length ? Math.max(...arr) : 0;
    const avgVidDays = avgDuration(formatDurations.video);
    const avgCarDays = avgDuration(formatDurations.carousel);
    const avgImgDays = avgDuration(formatDurations.image);

    // Longest-running winner
    const sortedByLongevity = [...this.ads].sort((a, b) => (b.daysRunning || 1) - (a.daysRunning || 1));
    const topWinner = sortedByLongevity[0];

    // Max copies running (horizontal scaling)
    const maxCopies = Math.max(...this.ads.map(a => a.collationCount || 1));

    // Dynamic Live Takeaway
    let formatInsight = '';
    if (carouselCount >= videoCount && carouselCount >= imageCount) {
      formatInsight = `Carousels dominate competitor testing volume (${carouselCount} ads), sustaining an average of ${avgCarDays} days running.`;
    } else if (videoCount >= carouselCount && videoCount >= imageCount) {
      formatInsight = `Video leads testing experiments (${videoCount} ads), holding an average longevity of ${avgVidDays} days.`;
    } else {
      formatInsight = `Static images represent ${imageCount} ads, averaging ${avgImgDays} days in market.`;
    }

    const winnerSummary = topWinner
      ? `Top active evergreen benchmark is from <strong>${this.escape(topWinner.pageName)}</strong> running for <strong>${topWinner.daysRunning || 1} days</strong>.`
      : '';

    // -------------------------------------------------------------
    // 1. Grouping by Launch Cohort for Bar Chart
    // -------------------------------------------------------------
    const cohortsMap = new Map();
    adsWithDates.forEach(({ ad, time }) => {
      let key = 'Recent';
      if (time > 0) {
        const d = new Date(time);
        key = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      }
      if (!cohortsMap.has(key)) {
        cohortsMap.set(key, []);
      }
      cohortsMap.get(key).push(ad);
    });

    // Sort cohorts chronologically (earliest to latest for chart display)
    const cohortEntries = Array.from(cohortsMap.entries()).reverse();
    const maxCohortCount = Math.max(...cohortEntries.map(([_, list]) => list.length), 1);

    const barsHtml = cohortEntries.map(([cohortName, cohortAds]) => {
      const cTotal = cohortAds.length;
      const cVideos = cohortAds.filter(a => a.adFormat === 'video').length;
      const cCarousels = cohortAds.filter(a => a.adFormat === 'carousel').length;
      const cImages = cohortAds.filter(a => a.adFormat === 'image').length;

      const barHeightPx = Math.max(28, Math.round((cTotal / maxCohortCount) * 170));
      const vidPct = Math.round((cVideos / cTotal) * 100);
      const carPct = Math.round((cCarousels / cTotal) * 100);
      const imgPct = 100 - vidPct - carPct;

      const vidHeight = Math.round((cVideos / cTotal) * barHeightPx);
      const carHeight = Math.round((cCarousels / cTotal) * barHeightPx);
      const imgHeight = barHeightPx - vidHeight - carHeight;

      return `
        <div class="velocity-bar-col">
          <span class="velocity-bar-val-badge">${cTotal}</span>
          <div class="velocity-bar-pill" style="height: ${barHeightPx}px;" title="${this.escape(cohortName)}: ${cTotal} total (${cVideos} Video, ${cCarousels} Carousel, ${cImages} Image)">
            ${cImages > 0 ? `<div class="velocity-segment-image" style="height: ${imgHeight}px;"></div>` : ''}
            ${cCarousels > 0 ? `<div class="velocity-segment-carousel" style="height: ${carHeight}px;"></div>` : ''}
            ${cVideos > 0 ? `<div class="velocity-segment-video" style="height: ${vidHeight}px;"></div>` : ''}
          </div>
          <div class="velocity-bar-footer">
            <div class="velocity-bar-label">${this.escape(cohortName)}</div>
            <div class="velocity-bar-subtext">${cVideos}v · ${cCarousels}c · ${cImages}i</div>
          </div>
        </div>
      `;
    }).join('');

    // -------------------------------------------------------------
    // 2. Longevity Spectrum Distribution
    // -------------------------------------------------------------
    const spectrumTiers = [
      {
        id: 'fresh',
        name: '⚡ Fresh Tests (1–7 Days)',
        desc: 'Rapid exploratory probes in early learning phase',
        filter: a => (a.daysRunning || 1) <= 7,
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.15)',
      },
      {
        id: 'validation',
        name: '🔄 Early Validation (8–14 Days)',
        desc: 'Testing iterations that cleared initial CPA gates',
        filter: a => (a.daysRunning || 1) >= 8 && (a.daysRunning || 1) <= 14,
        color: '#a78bfa',
        bg: 'rgba(167, 139, 250, 0.15)',
      },
      {
        id: 'scaling',
        name: '📈 Scaling Contenders (15–30 Days)',
        desc: 'Proven stable assets sustaining ongoing budget allocations',
        filter: a => (a.daysRunning || 1) >= 15 && (a.daysRunning || 1) <= 30,
        color: '#fbbf24',
        bg: 'rgba(251, 191, 36, 0.15)',
      },
      {
        id: 'winner',
        name: '🔥 Scaled Winners (31–60 Days)',
        desc: 'High-ROAS evergreen workhorses with confirmed profitability',
        filter: a => (a.daysRunning || 1) >= 31 && (a.daysRunning || 1) <= 60,
        color: '#fb7185',
        bg: 'rgba(251, 113, 133, 0.15)',
      },
      {
        id: 'heavyweight',
        name: '💎 Ironclad Heavyweights (60+ Days)',
        desc: 'Unshakable core brand pillars with zero ad fatigue',
        filter: a => (a.daysRunning || 1) > 60,
        color: '#34d399',
        bg: 'rgba(52, 211, 153, 0.15)',
      },
    ];

    const spectrumHtml = spectrumTiers.map(tier => {
      const adsInTier = this.ads.filter(tier.filter);
      const count = adsInTier.length;
      const pct = Math.round((count / totalAds) * 100);
      const brandsInTier = [...new Set(adsInTier.map(a => a.pageName))].slice(0, 3);
      const brandStr = brandsInTier.length ? `Active Brands: ${brandsInTier.map(b => this.escape(b)).join(', ')}` : 'None in this window';

      return `
        <div class="velocity-spectrum-item">
          <div class="velocity-spectrum-top">
            <span class="velocity-spectrum-tier-name" style="color:${tier.color};">
              ${tier.name}
            </span>
            <span class="velocity-spectrum-count-badge" style="background:${tier.bg};color:${tier.color};">
              ${count} ads (${pct}%)
            </span>
          </div>
          <div class="velocity-spectrum-track">
            <div class="velocity-spectrum-fill" style="width: ${pct}%; background: ${tier.color};"></div>
          </div>
          <div class="velocity-spectrum-footer">
            <span>${tier.desc}</span>
            <span>${brandStr}</span>
          </div>
        </div>
      `;
    }).join('');

    // -------------------------------------------------------------
    // 3. Competitor Velocity Benchmark Matrix (Per Brand)
    // -------------------------------------------------------------
    const brandsMap = new Map();
    this.ads.forEach(ad => {
      const bName = ad.pageName || 'Unknown';
      if (!brandsMap.has(bName)) {
        brandsMap.set(bName, []);
      }
      brandsMap.get(bName).push(ad);
    });

    const brandRows = Array.from(brandsMap.entries()).map(([brandName, brandAds]) => {
      const bTotal = brandAds.length;
      const bVids = brandAds.filter(a => a.adFormat === 'video').length;
      const bCars = brandAds.filter(a => a.adFormat === 'carousel').length;
      const bImgs = brandAds.filter(a => a.adFormat === 'image').length;

      const vidPct = Math.round((bVids / bTotal) * 100);
      const carPct = Math.round((bCars / bTotal) * 100);
      const imgPct = 100 - vidPct - carPct;

      const bEvergreens = brandAds.filter(a => (a.daysRunning || 1) >= 30).length;
      const bEvergreenPct = Math.round((bEvergreens / bTotal) * 100);

      const daysList = brandAds.map(a => a.daysRunning || 1);
      const bAvgDays = Math.round(daysList.reduce((s, d) => s + d, 0) / bTotal);
      const bMaxDays = Math.max(...daysList);
      const bMaxCopies = Math.max(...brandAds.map(a => a.collationCount || 1));

      // Calculate brand velocity
      const bTimes = brandAds.map(a => a.startDate ? new Date(a.startDate).getTime() : 0).filter(t => t > 0);
      const bEarliest = bTimes.length ? Math.min(...bTimes) : 0;
      const bLatest = bTimes.length ? Math.max(...bTimes) : 0;
      const bSpanDays = bEarliest && bLatest ? Math.max(1, Math.round((bLatest - bEarliest) / (86400000))) : 30;
      const bSpanWeeks = Math.max(1, Math.round((bSpanDays / 7) * 10) / 10);
      const bVelocity = Math.round((bTotal / bSpanWeeks) * 10) / 10;

      // Strategy Profile
      let stratBadge = '<span class="velocity-strategy-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;">⚡ High Velocity</span>';
      if (bEvergreenPct >= 40) {
        stratBadge = '<span class="velocity-strategy-badge" style="background:rgba(251,113,133,0.15);color:#fb7185;">🔥 Evergreen Scaler</span>';
      } else if (bVids > bCars && bVids > bImgs) {
        stratBadge = '<span class="velocity-strategy-badge" style="background:rgba(167,139,250,0.15);color:#a78bfa;">🎬 Video Focused</span>';
      } else if (bCars >= bVids && bCars >= bImgs) {
        stratBadge = '<span class="velocity-strategy-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;">📱 Carousel Heavy</span>';
      } else {
        stratBadge = '<span class="velocity-strategy-badge" style="background:rgba(52,211,153,0.15);color:#34d399;">🎯 Static Testing</span>';
      }

      return `
        <tr>
          <td>
            <div class="velocity-brand-cell">
              <span>🏢</span>
              <span>${this.escape(brandName)}</span>
            </div>
          </td>
          <td><strong style="color:#fff;">${bTotal}</strong></td>
          <td><span style="color:#38bdf8;font-weight:700;">~${bVelocity}</span> <span style="font-size:0.7rem;color:#64748b;">ads/wk</span></td>
          <td>
            <div style="display:flex;flex-direction:column;gap:3px;">
              <div class="velocity-mini-stack" title="${bVids} Videos (${vidPct}%), ${bCars} Carousels (${carPct}%), ${bImgs} Images (${imgPct}%)">
                <div style="width:${vidPct}%;background:#a78bfa;"></div>
                <div style="width:${carPct}%;background:#38bdf8;"></div>
                <div style="width:${imgPct}%;background:#34d399;"></div>
              </div>
              <span style="font-size:0.68rem;color:#94a3b8;">${vidPct}%v · ${carPct}%c · ${imgPct}%i</span>
            </div>
          </td>
          <td>
            <span style="font-weight:700;color:${bEvergreenPct >= 30 ? '#fb7185' : '#cbd5e1'};">
              ${bEvergreens} (${bEvergreenPct}%)
            </span>
          </td>
          <td>${bAvgDays}d <span style="font-size:0.68rem;color:#64748b;">(max ${bMaxDays}d)</span></td>
          <td><span style="color:#fbbf24;font-weight:700;">${bMaxCopies}x</span></td>
          <td>${stratBadge}</td>
        </tr>
      `;
    }).join('');

    // -------------------------------------------------------------
    // 4. Format Durability & Fatigue Index
    // -------------------------------------------------------------
    const formatsData = [
      {
        name: 'Video Ads',
        icon: '🎬',
        count: videoCount,
        pct: Math.round((videoCount / totalAds) * 100),
        avgDays: avgVidDays,
        maxDays: maxDuration(formatDurations.video),
        color: '#a78bfa',
        resilience: avgVidDays >= 30 ? 'High Resilience' : (avgVidDays >= 14 ? 'Moderate Fatigue' : 'Fast Iteration Cycle'),
      },
      {
        name: 'Carousel Ads',
        icon: '📱',
        count: carouselCount,
        pct: Math.round((carouselCount / totalAds) * 100),
        avgDays: avgCarDays,
        maxDays: maxDuration(formatDurations.carousel),
        color: '#38bdf8',
        resilience: avgCarDays >= 30 ? 'High Resilience' : (avgCarDays >= 14 ? 'Moderate Fatigue' : 'Fast Iteration Cycle'),
      },
      {
        name: 'Static Images',
        icon: '🖼️',
        count: imageCount,
        pct: Math.round((imageCount / totalAds) * 100),
        avgDays: avgImgDays,
        maxDays: maxDuration(formatDurations.image),
        color: '#34d399',
        resilience: avgImgDays >= 30 ? 'High Resilience' : (avgImgDays >= 14 ? 'Moderate Fatigue' : 'Fast Iteration Cycle'),
      },
    ];

    const formatCardsHtml = formatsData.map(f => `
      <div class="velocity-format-card">
        <div class="velocity-format-card-top">
          <div class="velocity-format-card-title">
            <span>${f.icon}</span>
            <span style="color:${f.color};">${f.name}</span>
          </div>
          <span style="font-size:0.75rem;font-weight:700;color:${f.color};">${f.count} ads (${f.pct}%)</span>
        </div>
        <div class="velocity-format-stats-row">
          <div class="velocity-format-stat">
            <span class="velocity-format-stat-val">${f.avgDays}d</span>
            <span class="velocity-format-stat-lbl">Avg Lifespan</span>
          </div>
          <div class="velocity-format-stat">
            <span class="velocity-format-stat-val" style="color:${f.color};">${f.maxDays}d</span>
            <span class="velocity-format-stat-lbl">Longest Winner</span>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;">
          <span style="color:var(--text-muted);">Fatigue Dynamic:</span>
          <span style="font-weight:700;color:${f.color};">${f.resilience}</span>
        </div>
      </div>
    `).join('');

    // -------------------------------------------------------------
    // 5. High-Volume Launch Bursts (Testing Spikes)
    // -------------------------------------------------------------
    const dropDatesMap = new Map();
    adsWithDates.forEach(({ ad, time }) => {
      if (time > 0) {
        const d = new Date(time);
        const dateKey = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
        const comboKey = `${dateKey}||${ad.pageName}`;
        if (!dropDatesMap.has(comboKey)) {
          dropDatesMap.set(comboKey, { date: dateKey, brand: ad.pageName, ads: [] });
        }
        dropDatesMap.get(comboKey).ads.push(ad);
      }
    });

    const topBursts = Array.from(dropDatesMap.values())
      .filter(item => item.ads.length >= 2)
      .sort((a, b) => b.ads.length - a.ads.length)
      .slice(0, 4);

    let burstsSectionHtml = '';
    if (topBursts.length > 0) {
      const burstCardsHtml = topBursts.map(b => {
        const bV = b.ads.filter(a => a.adFormat === 'video').length;
        const bC = b.ads.filter(a => a.adFormat === 'carousel').length;
        const bI = b.ads.filter(a => a.adFormat === 'image').length;
        const sampleHooks = b.ads.map(a => a.adTitle || a.adContent || '').filter(Boolean).slice(0, 2);
        const hookText = sampleHooks.length ? sampleHooks.map(h => `"${this.escape(h.slice(0, 60))}..."`).join(' · ') : 'Standard direct response creative drop';

        return `
          <div class="velocity-burst-card">
            <div class="velocity-burst-header">
              <span class="velocity-burst-date">⚡ ${this.escape(b.date)}</span>
              <span class="velocity-burst-badge">${b.ads.length} Creatives Dropped</span>
            </div>
            <div class="velocity-burst-brand">🏢 ${this.escape(b.brand)}</div>
            <div style="font-size:0.72rem;color:#38bdf8;">
              ${bV ? `${bV} Videos ` : ''}${bC ? `${bC} Carousels ` : ''}${bI ? `${bI} Images` : ''}
            </div>
            <div class="velocity-burst-themes">
              ${hookText}
            </div>
          </div>
        `;
      }).join('');

      burstsSectionHtml = `
        <div class="velocity-section-card">
          <div class="velocity-section-header">
            <div class="velocity-section-title-group">
              <h4><span>⚡</span> Concentrated Campaign Drops & Testing Bursts</h4>
              <p>Key dates where competitors deployed high-volume creative batches into market</p>
            </div>
          </div>
          <div class="velocity-burst-grid">
            ${burstCardsHtml}
          </div>
        </div>
      `;
    }

    // -------------------------------------------------------------
    // Full Velocity Container Assembly
    // -------------------------------------------------------------
    this.velocityContainer.innerHTML = `
      <div class="velocity-header-group">
        <h3>Campaign Velocity & Intelligence Suite</h3>
        <p>Comprehensive quantitative analytics of competitor creative testing velocity, format durability, evergreen survival rate, and campaign drops.</p>
      </div>

      <!-- Top KPI Metric Cards -->
      <div class="velocity-kpi-grid">
        <div class="velocity-kpi-card">
          <span class="kpi-label">Testing Cadence</span>
          <span class="kpi-val" style="color:#38bdf8;">~${cadencePerWeek} ads/wk</span>
          <span class="kpi-sub">Across ${spanDays} days observed launch window</span>
        </div>
        <div class="velocity-kpi-card">
          <span class="kpi-label">🔥 Evergreen Core (30+ Days)</span>
          <span class="kpi-val" style="color:#fb7185;">${evergreens.length} ads</span>
          <span class="kpi-sub">${evergreenPct}% of active catalog are proven winners</span>
        </div>
        <div class="velocity-kpi-card">
          <span class="kpi-label">⚡ Fresh Tests (≤ 14 Days)</span>
          <span class="kpi-val" style="color:#a78bfa;">${recentTests.length} ads</span>
          <span class="kpi-sub">Active challenger experiments in-market</span>
        </div>
        <div class="velocity-kpi-card">
          <span class="kpi-label">Scaling Intensity</span>
          <span class="kpi-val" style="color:#fbbf24;">Max ${maxCopies} copies</span>
          <span class="kpi-sub">Horizontal scaling on high-ROAS creatives</span>
        </div>
      </div>

      <!-- Media Buyer Takeaway Banner -->
      <div class="velocity-takeaway-banner">
        <div class="velocity-takeaway-icon">💡</div>
        <div class="velocity-takeaway-content">
          <h4>Performance Media Buyer Takeaway</h4>
          <p>
            ${formatInsight} ${winnerSummary} 
            ${evergreens.length > 0 ? `Competitors have locked in <strong>${evergreens.length} evergreen winners</strong> with proven longevity — analyze these angles in the Competitor Comparison and Market Gaps tabs.` : 'Competitors are in rapid-testing mode with frequent fresh drops.'}
          </p>
        </div>
      </div>

      <!-- Graph 1: Creative Launch Cadence Bar Chart -->
      <div class="velocity-section-card">
        <div class="velocity-section-header">
          <div class="velocity-section-title-group">
            <h4><span>📊</span> Creative Launch Cadence Over Time</h4>
            <p>Volume of creative launches over calendar periods, segmented by format</p>
          </div>
          <div class="velocity-legend">
            <div class="velocity-legend-item">
              <span class="velocity-legend-dot" style="background:#a78bfa;"></span>
              <span>Video</span>
            </div>
            <div class="velocity-legend-item">
              <span class="velocity-legend-dot" style="background:#38bdf8;"></span>
              <span>Carousel</span>
            </div>
            <div class="velocity-legend-item">
              <span class="velocity-legend-dot" style="background:#34d399;"></span>
              <span>Image</span>
            </div>
          </div>
        </div>
        <div class="velocity-chart-stage">
          <div class="velocity-bars-row">
            ${barsHtml}
          </div>
        </div>
      </div>

      <!-- Graph 2: Longevity & Survival Spectrum -->
      <div class="velocity-section-card">
        <div class="velocity-section-header">
          <div class="velocity-section-title-group">
            <h4><span>⏳</span> Creative Longevity & Survival Spectrum</h4>
            <p>Categorization of live ad catalog by operational lifespan to identify fatigue cycles vs. winning scaling assets</p>
          </div>
        </div>
        <div class="velocity-spectrum-list">
          ${spectrumHtml}
        </div>
      </div>

      <!-- Graph 3: Competitor Benchmark Matrix Table -->
      <div class="velocity-section-card">
        <div class="velocity-section-header">
          <div class="velocity-section-title-group">
            <h4><span>🏢</span> Competitor Velocity Benchmark Matrix</h4>
            <p>Head-to-head testing speed, format mix, evergreen survival rate, and scaling depth per competitor</p>
          </div>
        </div>
        <div class="velocity-table-responsive">
          <table class="velocity-matrix-table">
            <thead>
              <tr>
                <th>Brand / Competitor</th>
                <th>Active Ads</th>
                <th>Velocity</th>
                <th>Format Mix</th>
                <th>Evergreen Ratio</th>
                <th>Avg Lifespan</th>
                <th>Max Scale</th>
                <th>Strategy Profile</th>
              </tr>
            </thead>
            <tbody>
              ${brandRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Graph 4: Format Durability & Fatigue Index -->
      <div class="velocity-section-card">
        <div class="velocity-section-header">
          <div class="velocity-section-title-group">
            <h4><span>🎭</span> Format Durability & Fatigue Dynamics</h4>
            <p>Analyzing which creative formats withstand ad fatigue longest and sustain profitable spend</p>
          </div>
        </div>
        <div class="velocity-format-grid">
          ${formatCardsHtml}
        </div>
      </div>

      <!-- Graph 5: Campaign Drop Bursts (if present) -->
      ${burstsSectionHtml}
    `;
  }

  renderMarketGaps() {
    if (!this.ads || this.ads.length === 0) {
      this.gapsContainer.innerHTML = `
        <div style="text-align:center;padding:3rem;">
          <div style="font-size:2rem;margin-bottom:0.75rem;">🎯</div>
          <h3 style="color:#fff;margin-bottom:0.5rem;">No Competitor Ads Loaded</h3>
          <p style="color:#94a3b8;font-size:0.85rem;">Scrape competitor brands above to compute real-time positioning gaps, underutilized creative formats, and untapped hook opportunities.</p>
        </div>
      `;
      return;
    }

    const totalAds = this.ads.length;

    // 1. Creative Format Distribution & Gaps
    const videos = this.ads.filter(a => (a.adFormat || '').toLowerCase() === 'video').length;
    const carousels = this.ads.filter(a => (a.adFormat || '').toLowerCase() === 'carousel').length;
    const images = this.ads.filter(a => (a.adFormat || '').toLowerCase() === 'image').length;

    const videoPct = Math.round((videos / totalAds) * 100);
    const carouselPct = Math.round((carousels / totalAds) * 100);
    const imagePct = Math.round((images / totalAds) * 100);

    let formatGap = null;
    if (videoPct <= 25) {
      formatGap = {
        icon: '🎥',
        title: 'Video & UGC Placement Desert',
        badgeColor: '#fb7185',
        badge: `Only ${videoPct}% of catalog is Video (${videos}/${totalAds} ads)`,
        observation: `Competitors are heavily saturated in ${carouselPct >= imagePct ? 'Carousels' : 'Static Images'} (${Math.max(carouselPct, imagePct)}%), leaving high-intent Instagram Reels, Stories, and Video feed auctions largely uncontested.`,
        opportunity: `Deploy native UGC founder walkthroughs, talking-head creator hooks, and product demonstration videos to capture lower-CPM video placements with superior 3-second hook rates.`
      };
    } else if (carouselPct <= 25) {
      formatGap = {
        icon: '📲',
        title: 'Interactive Carousel Swipe Gap',
        badgeColor: '#38bdf8',
        badge: `Only ${carouselPct}% Carousel Adoption (${carousels}/${totalAds} ads)`,
        observation: `Competitors are relying primarily on single-frame formats, missing the high-engagement multi-slide swipe mechanic that algorithmically increases user dwell time.`,
        opportunity: `Test 4-to-6 card sequential swipe decks comparing before/after transformations, specification breakdowns, or objection-handling checklists.`
      };
    } else {
      formatGap = {
        icon: '🖼️',
        title: 'High-Impact Static Contrast Gap',
        badgeColor: '#34d399',
        badge: `Only ${imagePct}% Static Creatives (${images}/${totalAds} ads)`,
        observation: `Competitor creative workflow is concentrated heavily in complex media formats, creating an opening for fast-loading, bold static image creatives.`,
        opportunity: `Test high-contrast 1080x1350 statics with large text hooks, side-by-side feature charts, and bold benefit callouts for rapid mobile comprehension.`
      };
    }

    // 2. CTA & Conversion Urgency Gap
    const ctaCounts = {};
    this.ads.forEach(a => {
      const c = (a.adCallToActionText || 'NONE').toUpperCase();
      ctaCounts[c] = (ctaCounts[c] || 0) + 1;
    });
    const sortedCtas = Object.entries(ctaCounts).sort((a, b) => b[1] - a[1]);
    const topCta = sortedCtas[0] ? sortedCtas[0][0] : 'LEARN MORE';
    const topCtaCount = sortedCtas[0] ? sortedCtas[0][1] : 0;
    const topCtaPct = Math.round((topCtaCount / totalAds) * 100);

    const isGenericCta = ['LEARN MORE', 'LEARN_MORE', 'NONE', 'NO CTA'].includes(topCta);
    const ctaGap = {
      icon: '⚡',
      title: 'Call-to-Action & Urgency Blindspot',
      badgeColor: '#fbbf24',
      badge: `${topCtaPct}% of ads use "${this.escape(topCta)}"`,
      observation: isGenericCta
        ? `Over ${topCtaPct}% of competitor campaigns rely on low-urgency, passive CTAs with no direct incentive or time-sensitive hook.`
        : `Competitor traffic is funnelled overwhelmingly through "${this.escape(topCta)}", creating tunnel vision on a single conversion path.`,
      opportunity: `Test high-intent, friction-reducing CTAs paired with explicit risk-reversals (e.g. VIP access, free trial/consultation, instant savings, or guaranteed delivery window) to lower cost-per-lead.`
    };

    // 3. Social Proof & Customer Validation Gap
    const proofKeywords = ['review', 'rated', 'rating', 'star', 'customer', 'testimonial', 'award', 'verified', 'guarantee', 'proven', 'tested', 'feedback', 'trust', 'users', 'buyers'];
    let proofCount = 0;
    this.ads.forEach(a => {
      const fullText = `${a.adTitle || ''} ${a.adContent || ''}`.toLowerCase();
      if (proofKeywords.some(kw => fullText.includes(kw))) {
        proofCount++;
      }
    });
    const proofPct = Math.round((proofCount / totalAds) * 100);

    const proofGap = {
      icon: '⭐',
      title: 'Social Proof & Validation Gap',
      badgeColor: proofPct < 30 ? '#f43f5e' : '#10b981',
      badge: `${proofCount}/${totalAds} ads (${proofPct}%) mention customer proof`,
      observation: proofPct < 30
        ? `Competitor advertising is heavily brand-centric (studio aesthetics and internal claims), with less than ${proofPct}% of ads featuring customer testimonials, star ratings, or third-party validation.`
        : `Competitors are active with validation (${proofPct}% proof presence), making weak unproven claims an immediate disadvantage.`,
      opportunity: proofPct < 30
        ? `Exploit this major trust deficit by leading with customer quotes, screenshot reviews, and third-party media endorsements to convert skeptical mid-funnel prospects.`
        : `Counter their proof by showcasing verifiable performance metrics, head-to-head comparisons, and superior warranty guarantees.`
    };

    // 4. Evergreen Longevity & Fatigue Gap
    const evergreens = this.ads.filter(a => (a.daysRunning || 1) >= 30);
    const topWinner = [...this.ads].sort((a, b) => (b.daysRunning || 1) - (a.daysRunning || 1))[0];
    const topWinnerDays = topWinner ? (topWinner.daysRunning || 1) : 0;
    const topWinnerHook = topWinner ? (topWinner.adTitle || topWinner.adContent || '').slice(0, 60) : '';

    const longevityGap = {
      icon: '🎯',
      title: 'Evergreen Hook Counter-Positioning',
      badgeColor: '#a855f7',
      badge: `${evergreens.length} evergreen ads active 30+ days (Max ${topWinnerDays}d)`,
      observation: topWinner
        ? `The competitor's single most scaled asset has been active for ${topWinnerDays} days: "${this.escape(topWinnerHook)}...". Their market share depends heavily on this specific angle.`
        : `Competitor creative inventory is rapidly refreshed with limited longevity depth.`,
      opportunity: topWinner
        ? `Directly dismantle their primary evergreen angle by highlighting the hidden compromise of their position and presenting your solution as the complete, superior alternative.`
        : `Capitalize on competitor ad fatigue by introducing strong evergreen benefit angles that sustain long-term conversion efficiency without frequent creative burnout.`
    };

    const cards = [formatGap, ctaGap, proofGap, longevityGap];

    this.gapsContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;flex-wrap:wrap;gap:0.75rem;">
        <div>
          <h3 style="color:#fff;margin:0 0 0.25rem 0;font-size:1.15rem;">Market Creative Gaps & Positioning Opportunities</h3>
          <p style="color:#94a3b8;font-size:0.8rem;margin:0;">Dynamically computed from ${totalAds} scraped competitor ads across creative formats, CTAs, copy proof, and longevity.</p>
        </div>
        <button type="button" class="btn-strategy" id="btn-refresh-gaps" style="padding:6px 14px;font-size:0.8rem;display:flex;align-items:center;gap:0.4rem;">
          ✨ Generate Full AI Strategy
        </button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.25rem;">
        ${cards.map(card => `
          <div style="background:#070d1a;border:1px solid #1a2744;border-radius:10px;padding:1.25rem;display:flex;flex-direction:column;gap:0.75rem;transition:border-color 0.15s;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span style="font-size:1.25rem;line-height:1;">${card.icon}</span>
                <h4 style="color:#fff;font-size:0.92rem;font-weight:700;margin:0;">${card.title}</h4>
              </div>
            </div>

            <div style="display:inline-block;align-self:flex-start;background:rgba(255,255,255,0.05);border:1px solid ${card.badgeColor}40;color:${card.badgeColor};font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:4px;">
              ${card.badge}
            </div>

            <div style="font-size:0.8rem;color:#94a3b8;line-height:1.5;">
              <strong style="color:#cbd5e1;">Observed Reality:</strong> ${card.observation}
            </div>

            <div style="background:#0d182e;border-left:3px solid ${card.badgeColor};padding:0.6rem 0.85rem;border-radius:0 6px 6px 0;font-size:0.8rem;color:#e2e8f0;line-height:1.5;">
              <strong style="color:#38bdf8;">Strategic Opportunity:</strong> ${card.opportunity}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('btn-refresh-gaps')?.addEventListener('click', () => this.openStrategyModal());
  }

  async handleBeatThisAd(ad) {
    this.beatAdModal.style.display = 'flex';
    const brand = ad.pageName || 'Competitor';
    const headline = ad.adTitle || 'Their Hook';
    const copy = ad.adContent || '';

    this.beatAdBody.innerHTML = `
      <div style="background:#070e1c;border:1px solid #2563eb;border-radius:8px;padding:1rem;margin-bottom:1rem;">
        <div style="font-size:0.75rem;color:#38bdf8;font-weight:700;text-transform:uppercase;">Target Competitor Creative</div>
        <h4 style="color:#fff;margin:0.25rem 0;">${this.escape(brand)}: "${this.escape(headline)}"</h4>
        <p style="font-size:0.8rem;color:#94a3b8;">${this.escape(copy.slice(0, 180))}...</p>
      </div>

      <div id="ai-counter-container" style="text-align:center;padding:2rem;">
        <span style="font-size:1.5rem;animation:spin 1s linear infinite;display:inline-block;">⏳</span>
        <p style="color:#94a3b8;font-size:0.85rem;margin-top:0.5rem;">Synthesizing 3 AI counter-angles to beat this ad...</p>
      </div>
    `;

    try {
      const res = await apiClient.generateCounterAd(ad);
      const container = document.getElementById('ai-counter-container');
      if (container) {
        container.style.textAlign = 'left';
        container.style.padding = '0';
        container.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <span style="font-size:0.75rem;color:#10b981;font-weight:600;">Engine: ${this.escape(res.source)}</span>
          </div>
          <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
            ${this.formatMarkdown(res.analysis)}
          </div>
        `;
      }
    } catch (err) {
      const container = document.getElementById('ai-counter-container');
      if (container) {
        container.innerHTML = `<p style="color:#f43f5e;font-size:0.85rem;">Failed to generate counter-ad: ${err.message}</p>`;
      }
    }
  }

  async openDossierModal() {
    this.dossierModal.style.display = 'flex';
    this.dossierBody.innerHTML = `
      <div style="text-align:center;padding:3rem;">
        <span style="font-size:1.5rem;animation:spin 1s linear infinite;display:inline-block;">⏳</span>
        <p style="color:#94a3b8;font-size:0.85rem;margin-top:0.5rem;">Synthesizing Executive Competitor Intelligence Dossier...</p>
      </div>
    `;

    try {
      const res = await apiClient.generateDossier(this.ads);
      this.dossierBody.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;">
          <span style="font-size:0.75rem;color:#38bdf8;font-weight:600;">Engine: ${this.escape(res.source)}</span>
        </div>
        <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
          ${this.formatMarkdown(res.dossier)}
        </div>
      `;
    } catch (err) {
      this.dossierBody.innerHTML = `<p style="color:#f43f5e;font-size:0.85rem;">Failed to generate dossier: ${err.message}</p>`;
    }
  }

  async openStrategyModal() {
    this.strategyModal.style.display = 'flex';
    this.strategyBody.innerHTML = `
      <div style="text-align:center;padding:3rem;">
        <span style="font-size:1.5rem;animation:spin 1s linear infinite;display:inline-block;">⏳</span>
        <p style="color:#94a3b8;font-size:0.85rem;margin-top:0.5rem;">Generating Offensive Strategic Playbook...</p>
      </div>
    `;

    try {
      const res = await apiClient.generateStrategyReport(this.ads);
      this.strategyBody.innerHTML = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:0.5rem;">
          <span style="font-size:0.75rem;color:#d946ef;font-weight:600;">Engine: ${this.escape(res.source)}</span>
        </div>
        <div style="font-size:0.85rem;line-height:1.6;color:#cbd5e1;">
          ${this.formatMarkdown(res.report)}
        </div>
      `;
    } catch (err) {
      this.strategyBody.innerHTML = `<p style="color:#f43f5e;font-size:0.85rem;">Failed to generate strategy: ${err.message}</p>`;
    }
  }

  toggleChatWidget() {
    if (!this.chatWidget) return;
    const isVisible = window.getComputedStyle(this.chatWidget).display !== 'none';
    if (isVisible) {
      this.closeChatWidget();
    } else {
      this.openChatWidget();
    }
  }

  openChatWidget() {
    if (!this.chatWidget) return;
    this.chatWidget.style.display = 'flex';
    this.updateChatStatus();
    if (!this.chatMessages.children.length) {
      this.renderWelcomeMessage();
    }
    if (this.chatInput) {
      setTimeout(() => this.chatInput.focus(), 50);
    }
    this.scrollToBottom();
  }

  closeChatWidget() {
    if (this.chatWidget) {
      this.chatWidget.style.display = 'none';
    }
  }

  updateChatStatus() {
    if (this.chatSubtitle) {
      const count = this.ads ? this.ads.length : 0;
      this.chatSubtitle.textContent = `Meta Ads Strategist • ${count} ads loaded`;
    }
  }

  renderWelcomeMessage() {
    if (!this.chatMessages) return;
    const count = this.ads ? this.ads.length : 0;
    const welcome = document.createElement('div');
    welcome.className = 'chat-bubble bot-bubble';
    welcome.innerHTML = `
      <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.5px;color:#a855f7;margin-bottom:0.35rem;text-transform:uppercase;">Meta Ads Strategist</div>
      <div class="bot-text">
        <strong>Welcome to your Competitor Ads Intelligence Copilot.</strong><br><br>
        I am an elite Meta Ads performance strategist and creative consultant. I have real-time access to the <strong>${count} competitor ads</strong> currently loaded in your workspace.<br><br>
        Ask me anything regarding how to analyze, improve, counter-position, or scale ads against these competitors:
        <ul style="margin:0.5rem 0 0.5rem 1.2rem;padding:0;">
          <li>Analyze high-longevity winner hooks</li>
          <li>Craft counter-ad angles and scripts</li>
          <li>Identify creative fatigue and untapped formats</li>
        </ul>
        What would you like to work on?
      </div>
    `;
    this.chatMessages.appendChild(welcome);
    this.scrollToBottom();
  }

  clearChat() {
    this.chatHistory = [];
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
      this.renderWelcomeMessage();
    }
    if (this.chatInput) {
      this.chatInput.value = '';
      this.chatInput.focus();
    }
  }

  async handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!this.chatInput) return;

    const message = this.chatInput.value.trim();
    if (!message) return;

    // Append user message
    this.appendUserMessage(message);
    this.chatHistory.push({ role: 'user', content: message });
    this.chatInput.value = '';

    // Disable inputs while generating
    this.chatInput.disabled = true;
    if (this.chatSendBtn) this.chatSendBtn.disabled = true;
    this.showTypingIndicator();

    try {
      const res = await apiClient.queryCopilot(this.chatHistory, this.ads);
      this.removeTypingIndicator();
      const reply = res.answer || "I couldn't generate a response.";
      this.appendBotMessage(reply, res.source);
      this.chatHistory.push({ role: 'assistant', content: reply });
    } catch (err) {
      this.removeTypingIndicator();
      this.appendErrorMessage(`Failed to get response: ${err.message}`);
    } finally {
      this.chatInput.disabled = false;
      if (this.chatSendBtn) this.chatSendBtn.disabled = false;
      this.chatInput.focus();
      this.scrollToBottom();
    }
  }

  appendUserMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user-bubble';
    bubble.textContent = text;
    this.chatMessages.appendChild(bubble);
    this.scrollToBottom();
  }

  appendBotMessage(markdownText, source) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot-bubble';
    bubble.innerHTML = `
      ${source ? `<div style="font-size:0.65rem;font-weight:700;letter-spacing:0.5px;color:#a855f7;margin-bottom:0.35rem;text-transform:uppercase;">${this.escape(source)}</div>` : ''}
      <div class="bot-text">${this.formatMarkdown(markdownText)}</div>
    `;
    this.chatMessages.appendChild(bubble);
    this.scrollToBottom();
  }

  appendErrorMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot-bubble';
    bubble.style.borderColor = '#f43f5e';
    bubble.style.background = 'rgba(244, 63, 94, 0.1)';
    bubble.innerHTML = `<span style="color:#fb7185;">${this.escape(text)}</span>`;
    this.chatMessages.appendChild(bubble);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    this.removeTypingIndicator();
    const indicator = document.createElement('div');
    indicator.id = 'chat-typing-indicator';
    indicator.className = 'chat-bubble bot-bubble';
    indicator.innerHTML = `
      <div class="typing-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    this.chatMessages.appendChild(indicator);
    this.scrollToBottom();
  }

  removeTypingIndicator() {
    const indicator = document.getElementById('chat-typing-indicator');
    if (indicator) indicator.remove();
  }

  scrollToBottom() {
    if (this.chatMessages) {
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
  }


  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/^### (.*$)/gim, '<h4 style="color:#38bdf8;margin:1rem 0 0.5rem 0;">$1</h4>')
      .replace(/^#### (.*$)/gim, '<h5 style="color:#a78bfa;margin:0.75rem 0 0.25rem 0;">$1</h5>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#fff;">$1</strong>')
      .replace(/^\s*• (.*$)/gim, '<div style="margin-left:0.75rem;margin-bottom:0.25rem;color:#cbd5e1;">• $1</div>')
      .replace(/\n\n/g, '<div style="height:0.5rem;"></div>')
      .replace(/\n/g, '<br>');
  }

  renderScrapeStatus(response) {
    if (!response || !this.scrapeStatusBanner) return;
    const logs = response.logs || [];
    const hasError = !response.success || (response.error && response.error.length > 0);
    const zeroAds = response.total_ads === 0;

    if (logs.length === 0 && !response.error) {
      this.scrapeStatusBanner.style.display = 'none';
      return;
    }

    const bannerClass = hasError ? 'banner-error' : (zeroAds ? 'banner-warning' : 'banner-success');
    const statusTitle = hasError 
      ? '❌ Scraper System Error' 
      : (zeroAds ? '⚠️ 0 Ads Retrieved From Meta Ad Library' : `✅ Successfully Scraped ${response.total_ads} Ads`);

    const logItemsHtml = logs.map(log => `
      <li class="log-item">
        <span class="log-bullet">•</span>
        <span class="log-text">${this.escape(log)}</span>
      </li>
    `).join('');

    this.scrapeStatusBanner.className = `scrape-status-banner ${bannerClass}`;
    this.scrapeStatusBanner.innerHTML = `
      <div class="banner-header">
        <strong>${statusTitle}</strong>
        <span class="banner-meta">${response.duration_seconds ? response.duration_seconds + 's' : ''}</span>
      </div>
      ${logs.length > 0 ? `<ul class="banner-log-list">${logItemsHtml}</ul>` : ''}
      ${response.error ? `<div class="banner-error-detail">Exact System Error: <code>${this.escape(response.error)}</code></div>` : ''}
    `;
    this.scrapeStatusBanner.style.display = 'block';
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
