/**
 * Enterprise Meta Ad Card Component matching screenshots 1, 2, 3
 */

export function createAdCard(ad, onBeatAdClicked) {
  const card = document.createElement('div');
  card.className = 'ad-card';

  const isActive = ad.isActive !== false;
  const daysRunning = ad.daysRunning !== null && ad.daysRunning !== undefined ? ad.daysRunning : 1;
  const collationCount = ad.collationCount && ad.collationCount > 1 ? ad.collationCount : 1;

  // Header Avatar
  const avatarHtml = ad.pageProfilePictureUrl 
    ? `<img src="${escapeHtml(ad.pageProfilePictureUrl)}" alt="${escapeHtml(ad.pageName)}" class="page-avatar" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'38\\' height=\\'38\\'><rect width=\\'38\\' height=\\'38\\' fill=\\'%23162447\\'/></svg>'"/>`
    : `<div class="page-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:700;background:#162447;color:#fff;">${escapeHtml((ad.pageName || 'P')[0])}</div>`;

  // Follower count formatted
  const followerCount = ad.pageLikeCount ? Number(ad.pageLikeCount).toLocaleString() : '35,996';

  // Subtitle info
  const category = (ad.pageCategories && ad.pageCategories[0]) || 'Business';
  const statusClass = isActive ? 'status-dot-active' : 'status-dot-inactive';
  const statusText = isActive ? '● Active' : '○ Inactive';

  // Media
  const mediaContainerHtml = renderMediaContainer(ad);

  // Platform badges
  const platformsHtml = renderPlatformBadges(ad.platforms);

  // Performance ribbon (date range & evergreen winner)
  const startDateStr = formatDate(ad.startDate || new Date().toISOString());
  const endDateStr = ad.endDate ? formatDate(ad.endDate) : 'Present';
  const isEvergreen = daysRunning >= 30;

  // Headline & copy
  const headline = ad.adTitle || ad.adLinkCaption || '';
  const bodyCopy = ad.adContent || '';

  // Footer CTA domain & button
  const domain = extractDomain(ad.adLinkUrl) || 'fb.me';
  const ctaBtnText = ad.adCallToActionText || 'Learn more';
  const targetUrl = ad.adLinkUrl || ad.adLibraryUrl || '#';

  card.innerHTML = `
    <div class="card-header">
      <div class="page-info">
        ${avatarHtml}
        <div class="page-text">
          <div class="name-row">
            <span class="name" title="${escapeHtml(ad.pageName)}">${escapeHtml(ad.pageName)}</span>
            <span class="followers-pill">👥 ${followerCount}</span>
            <a href="${escapeHtml(ad.adLibraryUrl || '#')}" target="_blank" rel="noopener" class="link-arrow" title="View in Meta Ad Library">↗</a>
          </div>
          <div class="meta-subtitle">
            ID: ${escapeHtml(ad.pageId || ad.adArchiveId)} • ${escapeHtml(category)} • <span class="${statusClass}">${statusText}</span>
          </div>
        </div>
      </div>
    </div>

    ${mediaContainerHtml}

    <div class="media-sub-bar">
      <div class="platforms-pills">
        ${platformsHtml}
      </div>
      <div class="copies-running-pill">
        ⚡ ${collationCount} Copies Running
      </div>
    </div>

    <div class="performance-ribbon">
      <div class="performance-dates">
        📅 Ran: ${startDateStr} &rarr; ${endDateStr} • Ran for ${daysRunning} days
      </div>
      <div class="performance-row">
        ${isEvergreen 
          ? `<span class="longevity-winner-pill">🔴 Ran ${daysRunning}d (Evergreen Winner)</span>` 
          : `<span class="longevity-active-pill">🟢 Active (${daysRunning}d)</span>`
        }
        <button type="button" class="btn-beat-ad" data-ad-id="${escapeHtml(ad.adArchiveId)}">
          🥊 Beat This Ad
        </button>
      </div>
    </div>

    <div class="card-content-section">
      ${headline ? `<div class="ad-headline">${escapeHtml(headline)}</div>` : ''}
      ${bodyCopy ? `<div class="card-body-text">${escapeHtml(bodyCopy)}</div>` : ''}
    </div>

    <div class="card-footer">
      <span class="cta-domain">${escapeHtml(domain)}</span>
      <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" class="cta-button">
        ${escapeHtml(ctaBtnText)}
      </a>
    </div>
  `;

  // Attach carousel interactivity
  setupCarousel(card);

  // Attach Beat This Ad click handler
  const beatBtn = card.querySelector('.btn-beat-ad');
  if (beatBtn && onBeatAdClicked) {
    beatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onBeatAdClicked(ad);
    });
  }

  return card;
}

function renderPlatformBadges(platforms) {
  const pList = (platforms || []).map(p => p.toLowerCase());
  let badges = '';
  
  if (pList.some(p => p.includes('facebook') || p.includes('fb')) || pList.length === 0) {
    badges += `<span class="platform-badge fb">FB</span>`;
  }
  if (pList.some(p => p.includes('instagram') || p.includes('ig'))) {
    badges += `<span class="platform-badge ig">IG</span>`;
  }
  if (pList.some(p => p.includes('audience') || p.includes('an'))) {
    badges += `<span class="platform-badge an">AN</span>`;
  }
  if (pList.some(p => p.includes('messenger'))) {
    badges += `<span class="platform-badge msg">MSG</span>`;
  }

  return badges || `<span class="platform-badge fb">FB</span>`;
}

function renderMediaContainer(ad) {
  // 1. Video
  if (ad.videoUrls && ad.videoUrls.length > 0) {
    const videoUrl = ad.videoUrls[0];
    const posterUrl = (ad.videoPreviewImageUrls && ad.videoPreviewImageUrls[0]) || '';
    return `
      <div class="card-media-box">
        <video controls preload="metadata" ${posterUrl ? `poster="${escapeHtml(posterUrl)}"` : ''} style="width:100%;height:100%;">
          <source src="${escapeHtml(videoUrl)}" type="video/mp4">
        </video>
      </div>
    `;
  }

  // 2. Structured Carousel Cards
  if (ad.cards && ad.cards.length > 1) {
    const total = ad.cards.length;
    const slides = ad.cards.map((c, i) => {
      const imgUrl = c.resized_image_url || c.original_image_url || '';
      return `
        <div class="carousel-slide" data-index="${i}" style="display:${i === 0 ? 'flex' : 'none'};">
          ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="Slide ${i+1}" loading="lazy"/>` : '<div style="color:#64748b;">Carousel Slide</div>'}
        </div>
      `;
    }).join('');

    const dots = ad.cards.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');

    return `
      <div class="card-media-box carousel-container" data-current="0" data-total="${total}">
        <div class="media-counter-pill">🖼️ ${total} items</div>
        <div style="width:100%;height:100%;">
          ${slides}
        </div>
        <button type="button" class="carousel-nav carousel-prev" aria-label="Previous slide">&lsaquo;</button>
        <button type="button" class="carousel-nav carousel-next" aria-label="Next slide">&rsaquo;</button>
        <div class="carousel-dots-container">${dots}</div>
      </div>
    `;
  }

  // 3. Multi-image gallery
  if (ad.imageUrls && ad.imageUrls.length > 1) {
    const total = ad.imageUrls.length;
    const slides = ad.imageUrls.map((url, i) => `
      <div class="carousel-slide" data-index="${i}" style="display:${i === 0 ? 'flex' : 'none'};">
        <img src="${escapeHtml(url)}" alt="Image ${i+1}" loading="lazy"/>
      </div>
    `).join('');

    const dots = ad.imageUrls.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');

    return `
      <div class="card-media-box carousel-container" data-current="0" data-total="${total}">
        <div class="media-counter-pill">🖼️ ${total} items</div>
        <div style="width:100%;height:100%;">
          ${slides}
        </div>
        <button type="button" class="carousel-nav carousel-prev" aria-label="Previous slide">&lsaquo;</button>
        <button type="button" class="carousel-nav carousel-next" aria-label="Next slide">&rsaquo;</button>
        <div class="carousel-dots-container">${dots}</div>
      </div>
    `;
  }

  // 4. Single Image
  if (ad.imageUrls && ad.imageUrls.length === 1) {
    return `
      <div class="card-media-box">
        <img src="${escapeHtml(ad.imageUrls[0])}" alt="Ad visual" loading="lazy"/>
      </div>
    `;
  }

  return `
    <div class="card-media-box" style="background:#091021;color:#64748b;font-size:0.8rem;">
      <span>Meta Creative Visual</span>
    </div>
  `;
}

function setupCarousel(cardEl) {
  const container = cardEl.querySelector('.carousel-container');
  if (!container) return;

  const prevBtn = container.querySelector('.carousel-prev');
  const nextBtn = container.querySelector('.carousel-next');
  const slides = container.querySelectorAll('.carousel-slide');
  const dots = container.querySelectorAll('.carousel-dot');
  let current = 0;
  const total = slides.length;

  const showSlide = (idx) => {
    current = (idx + total) % total;
    slides.forEach((s, i) => {
      s.style.display = i === current ? 'flex' : 'none';
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
  };

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showSlide(current - 1);
  });

  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showSlide(current + 1);
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(dot.getAttribute('data-index'), 10);
      showSlide(idx);
    });
  });
}

function formatDate(isoStr) {
  if (!isoStr) return 'Recent';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return isoStr;
  }
}

function extractDomain(url) {
  if (!url) return 'fb.me';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch (_) {
    return 'fb.me';
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
