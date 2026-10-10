/**
 * Modular Search & Target Chip Input Manager with Live Meta Advertiser Lookup
 */

import { apiClient } from '../api.js';

export class SearchBarComponent {
  constructor({ containerId, onTargetsChanged, getCountry }) {
    this.container = document.getElementById(containerId);
    this.onTargetsChanged = onTargetsChanged || (() => {});
    this.getCountry = getCountry || (() => 'ALL');
    this.targets = [];
    this.render();
    this.bindEvents();
    this.updateChips();
  }

  render() {
    this.container.innerHTML = `
      <div class="search-bar-wrapper">
        <div class="chip-container" id="chip-box">
          <div id="chip-items" style="display: contents;"></div>
          <input 
            type="text" 
            id="target-input" 
            class="chip-input" 
            placeholder="Type brand name (e.g. ultraviolette, raptee, ather) or paste Page ID..." 
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" id="btn-search-lookup" class="btn-lookup">
            <span id="lookup-spinner" style="display:none;">⏳</span>
            <span id="lookup-text">🔍 Find Official Page</span>
          </button>
        </div>

        <!-- Autocomplete Suggestions Dropdown -->
        <div id="lookup-dropdown" class="lookup-dropdown" style="display: none;"></div>

        <div class="chip-hint">
          💡 <strong>Official Meta Ad Library Fetcher:</strong> Type a brand & click <strong>Find Official Page</strong> (or Enter) to lock its verified Meta Page ID.
        </div>
      </div>
    `;

    this.chipBox = this.container.querySelector('#chip-box');
    this.chipItems = this.container.querySelector('#chip-items');
    this.input = this.container.querySelector('#target-input');
    this.lookupBtn = this.container.querySelector('#btn-search-lookup');
    this.lookupSpinner = this.container.querySelector('#lookup-spinner');
    this.lookupText = this.container.querySelector('#lookup-text');
    this.dropdown = this.container.querySelector('#lookup-dropdown');
  }

  bindEvents() {
    this.chipBox.addEventListener('click', (e) => {
      if (!e.target.closest('.chip-remove') && !e.target.closest('#btn-search-lookup')) {
        this.input.focus();
      }
    });

    this.input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.input.value.trim();
        if (!raw) return;

        // If numeric ID or full URL, add immediately
        if (/^\d+$/.test(raw) || raw.includes('facebook.com') || raw.includes('fb.com')) {
          this.commitDirectInput();
        } else {
          // If text / brand name, perform live Meta search lookup
          await this.performLookup(raw);
        }
      } else if (e.key === 'Backspace' && !this.input.value && this.targets.length > 0) {
        this.removeTarget(this.targets.length - 1);
      }
    });

    this.lookupBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const raw = this.input.value.trim();
      if (!raw) {
        this.input.focus();
        return;
      }
      if (/^\d+$/.test(raw) || raw.includes('facebook.com') || raw.includes('fb.com')) {
        this.commitDirectInput();
      } else {
        await this.performLookup(raw);
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.closeDropdown();
      }
    });
  }

  async performLookup(query) {
    this.setLookupLoading(true);
    try {
      const country = this.getCountry();
      const res = await apiClient.searchAdvertisers(query, country);
      const items = (res && res.items) || [];
      this.renderDropdown(items, query);
    } catch (err) {
      console.warn('Advertiser lookup error:', err);
      // Fallback: just add raw
      this.commitDirectInput();
    } finally {
      this.setLookupLoading(false);
    }
  }

  setLookupLoading(isLoading) {
    this.lookupBtn.disabled = isLoading;
    if (this.lookupSpinner) this.lookupSpinner.style.display = isLoading ? 'inline-block' : 'none';
    if (this.lookupText) this.lookupText.textContent = isLoading ? 'Searching...' : '🔍 Find Official Page';
  }

  renderDropdown(items, query) {
    if (!items || items.length === 0) {
      this.dropdown.innerHTML = `
        <div class="dropdown-header">No official page match found for "<strong>${escapeHtml(query)}</strong>"</div>
        <div class="dropdown-item" id="opt-add-raw" style="cursor: pointer; padding: 0.6rem 1rem; color: var(--accent-cyan);">
          ➕ Add "<strong>${escapeHtml(query)}</strong>" anyway
        </div>
      `;
      this.dropdown.querySelector('#opt-add-raw').addEventListener('click', () => {
        this.commitDirectInput();
        this.closeDropdown();
      });
      this.dropdown.style.display = 'block';
      return;
    }

    let listHtml = `
      <div class="dropdown-header">🏢 Official Meta Ad Library Advertisers for "${escapeHtml(query)}":</div>
      <div class="dropdown-list">
    `;

    items.forEach((item, idx) => {
      const isVerified = item.verification === 'BLUE_VERIFIED';
      const fbFollowers = item.likes ? formatSocialCount(item.likes) : null;
      const igFollowers = item.ig_followers ? formatSocialCount(item.ig_followers) : null;

      listHtml += `
        <div class="dropdown-item" data-index="${idx}">
          <div class="dropdown-item-left">
            ${item.image_uri 
              ? `<img src="${escapeHtml(item.image_uri)}" class="dropdown-avatar" alt="${escapeHtml(item.page_name)}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'38\\' height=\\'38\\'><rect width=\\'38\\' height=\\'38\\' fill=\\'%23162447\\'/></svg>'"/>`
              : `<div class="dropdown-avatar-placeholder">${escapeHtml((item.page_name || 'B')[0])}</div>`
            }
            <div class="item-main">
              <div class="item-name-row">
                <span class="item-name">${escapeHtml(item.page_name)}</span>
                ${isVerified ? '<span class="verified-icon" title="Meta Verified">✓</span>' : ''}
              </div>
              <div class="item-social-lines">
                <div class="social-line">
                  <span class="social-tag fb">FB</span>
                  <span>${fbFollowers ? fbFollowers + ' follow this' : 'Official Page'}${item.category ? ' · ' + escapeHtml(item.category) : ''}</span>
                </div>
                ${item.ig_username ? `
                  <div class="social-line">
                    <span class="social-tag ig">IG</span>
                    <span>@${escapeHtml(item.ig_username)}${igFollowers ? ' · ' + igFollowers + ' followers' : ''}</span>
                  </div>
                ` : ''}
              </div>
              <div class="item-id">Page ID: <code>${escapeHtml(item.page_id)}</code></div>
            </div>
          </div>
          <div class="item-meta">
            <button type="button" class="btn-select-page">Select</button>
          </div>
        </div>
      `;
    });

    listHtml += `</div>`;
    this.dropdown.innerHTML = listHtml;

    // Attach click handlers to dropdown items
    this.dropdown.querySelectorAll('.dropdown-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        const selected = items[idx];
        if (selected && selected.page_id) {
          this.addTarget({
            id: selected.page_id,
            name: selected.page_name,
            raw: selected.page_id,
          });
          this.input.value = '';
          this.closeDropdown();
        }
      });
    });

    this.dropdown.style.display = 'block';
  }

  closeDropdown() {
    this.dropdown.style.display = 'none';
  }

  commitDirectInput() {
    const raw = this.input.value.trim();
    if (!raw) return;

    const parts = raw.split(/[\n,]+/).map(p => p.trim()).filter(Boolean);
    parts.forEach(p => {
      this.addTarget({ id: p, name: p, raw: p });
    });

    this.input.value = '';
    this.closeDropdown();
  }

  addTarget(targetObj) {
    if (!targetObj || !targetObj.id) return;
    const exists = this.targets.some(t => t.id === targetObj.id);
    if (!exists) {
      this.targets.push(targetObj);
      this.updateChips();
    }
  }

  removeTarget(index) {
    this.targets.splice(index, 1);
    this.updateChips();
  }

  getTargets() {
    // Return the exact Page IDs / target strings
    return this.targets.map(t => t.id);
  }

  updateChips() {
    this.chipItems.innerHTML = '';
    this.targets.forEach((target, idx) => {
      const isNumeric = /^\d+$/.test(target.id);
      let label = target.name || target.id;
      if (target.name && target.name !== target.id) {
        label = `${target.name} (${target.id})`;
      } else if (isNumeric) {
        label = `ID: ${target.id}`;
      }

      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = `
        <span class="chip-icon">${isNumeric ? '🔢' : '🌐'}</span>
        <span class="chip-label" title="${escapeHtml(target.id)}">${escapeHtml(label)}</span>
        <button type="button" class="chip-remove" aria-label="Remove">&times;</button>
      `;

      chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeTarget(idx);
      });

      this.chipItems.appendChild(chip);
    });

    this.onTargetsChanged(this.getTargets());
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatSocialCount(num) {
  if (!num) return '0';
  const n = Number(num);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}


