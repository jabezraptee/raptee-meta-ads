from __future__ import annotations
import asyncio
import json
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from backend.config import DEFAULT_TIMEOUT_MS, HEADLESS, USER_AGENT, get_logger
from backend.models import CarouselCard, MetaAdItem, ScrapeFilterParams

logger = get_logger("Scraper")


def _normalize_token(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", text or "").lower()


def _format_timestamp(val) -> Optional[str]:
    """Convert Meta's epoch-second or string timestamp to ISO 8601."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        try:
            return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
        except Exception:
            return None
    s = str(val).strip()
    if not s:
        return None
    # Already ISO string
    if "T" in s or "-" in s:
        return s
    # Epoch seconds as string
    try:
        return datetime.fromtimestamp(int(s), tz=timezone.utc).isoformat()
    except Exception:
        return s


def parse_page_id(raw: str) -> str:
    """Extracts numeric Page ID from raw input, URL, or returns raw string."""
    target = (raw or "").strip()
    if target.isdigit():
        return target
    # Query parameters (view_all_page_id=..., id=...)
    m = re.search(r"[?&](?:view_all_page_id|id)=(\d+)", target)
    if m:
        return m.group(1)
    # Trailing numeric ID in URL slug (e.g. /Brand-Name-1581641818782958/)
    m = re.search(r"-(\d{10,20})(?:[/?#]|$)", target)
    if m:
        return m.group(1)
    return target


class MetaScraperService:
    """High-performance Meta Ads Library direct Playwright scraper with Browser Pooling & Concurrency Gatekeeping."""

    def __init__(self, max_concurrent: int = 3):
        self._max_concurrent = max_concurrent
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._lock = asyncio.Lock()
        self._jobs_served = 0

    def _get_semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self._max_concurrent)
        return self._semaphore

    async def get_browser(self) -> Browser:
        """Maintains a single warm Chromium instance with automatic health check, recycling, and Docker-optimized flags."""
        async with self._lock:
            # Recycle master browser every 60 jobs to prevent any Chromium background memory bloat
            if self._browser and self._jobs_served >= 60:
                logger.info("Recycling master Chromium browser to maintain optimal memory footprint...")
                try:
                    await self._browser.close()
                except Exception:
                    pass
                self._browser = None
                self._jobs_served = 0

            if self._browser is None or not self._browser.is_connected():
                if self._playwright is None:
                    self._playwright = await async_playwright().start()

                logger.info(f"Initializing pooled Chromium browser engine (Concurrency cap: {self._max_concurrent})...")
                self._browser = await self._playwright.chromium.launch(
                    headless=HEADLESS,
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-extensions",
                        "--disable-component-update",
                        "--disable-background-networking",
                        "--disable-default-apps",
                        "--disable-sync",
                        "--mute-audio",
                    ],
                )
                self._jobs_served = 0

            self._jobs_served += 1
            return self._browser

    async def close(self):
        """Clean shutdown of pooled browser and playwright."""
        async with self._lock:
            if self._browser:
                try:
                    await self._browser.close()
                except Exception:
                    pass
                self._browser = None
            if self._playwright:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None
            logger.info("Master Chromium browser pool stopped cleanly.")

    def _extract_ad_model(self, cr: Dict[str, Any], default_country: str = "ALL") -> MetaAdItem:
        snapshot = cr.get("snapshot") or {}
        ad_id = str(cr.get("ad_archive_id") or cr.get("ad_id") or "")
        page_id = str(cr.get("page_id") or snapshot.get("page_id") or "")
        page_name = cr.get("page_name") or snapshot.get("page_name") or "Unknown Page"

        # Profile metadata
        page_profile_pic = snapshot.get("page_profile_picture_url") or ""
        page_profile_uri = snapshot.get("page_profile_uri") or ""
        page_likes = snapshot.get("page_like_count")
        raw_categories = snapshot.get("page_categories") or []
        page_categories = [raw_categories] if isinstance(raw_categories, str) else list(raw_categories)

        # Content text
        body_obj = snapshot.get("body")
        body_text = body_obj.get("text") if isinstance(body_obj, dict) else (body_obj or "")
        title = snapshot.get("title") or ""
        caption = snapshot.get("caption") or ""
        link_url = snapshot.get("link_url") or ""
        link_desc = snapshot.get("link_description") or ""
        cta_text = snapshot.get("cta_text") or ""
        cta_type = snapshot.get("cta_type") or ""

        # Media collections
        image_urls = []
        for img in snapshot.get("images") or []:
            if isinstance(img, str):
                image_urls.append(img)
            elif isinstance(img, dict):
                url = img.get("original_image_url") or img.get("resized_image_url") or img.get("url")
                if url:
                    image_urls.append(url)

        video_urls = []
        video_preview_urls = []
        for vid in snapshot.get("videos") or []:
            if isinstance(vid, dict):
                v_url = vid.get("video_hd_url") or vid.get("video_sd_url") or vid.get("url")
                if v_url:
                    video_urls.append(v_url)
                p_url = vid.get("video_preview_image_url")
                if p_url:
                    video_preview_urls.append(p_url)

        cards: List[CarouselCard] = []
        for c in snapshot.get("cards") or []:
            if not isinstance(c, dict):
                continue
            card_body = (c.get("body") or {}).get("text") if isinstance(c.get("body"), dict) else (c.get("body") or "")
            card = CarouselCard(
                title=c.get("title") or "",
                body=card_body,
                caption=c.get("caption") or "",
                link_url=c.get("link_url") or "",
                cta_text=c.get("cta_text") or "",
                original_image_url=c.get("original_image_url") or "",
                resized_image_url=c.get("resized_image_url") or "",
                video_preview_image_url=c.get("video_preview_image_url") or "",
                video_hd_url=c.get("video_hd_url") or "",
                video_sd_url=c.get("video_sd_url") or "",
            )
            if card.resized_image_url:
                image_urls.append(card.resized_image_url)
            elif card.original_image_url:
                image_urls.append(card.original_image_url)
            if card.video_hd_url or card.video_sd_url:
                video_urls.append(card.video_hd_url or card.video_sd_url)
            cards.append(card)

        # Deduplicate media lists
        image_urls = list(dict.fromkeys(image_urls))
        video_urls = list(dict.fromkeys(video_urls))

        # Format classification
        if video_urls:
            ad_format = "video"
        elif len(cards) > 1 or len(image_urls) > 1:
            ad_format = "carousel"
        else:
            ad_format = "image"

        start_date = _format_timestamp(cr.get("start_date"))
        end_date = _format_timestamp(cr.get("end_date"))
        is_active = cr.get("is_active")
        if is_active is None:
            is_active = not bool(end_date)

        raw_platforms = cr.get("publisher_platform") or []
        platforms = [raw_platforms] if isinstance(raw_platforms, str) else list(raw_platforms)

        days_running = None
        if start_date:
            try:
                s_dt = datetime.fromisoformat(start_date)
                e_dt = datetime.fromisoformat(end_date) if end_date else datetime.now(timezone.utc)
                days_running = max(1, (e_dt - s_dt).days)
            except Exception:
                pass

        spend_obj = cr.get("spend") or snapshot.get("spend")
        spend_range = None
        if isinstance(spend_obj, dict):
            spend_range = f"{spend_obj.get('lower_bound', '')} - {spend_obj.get('upper_bound', '')}".strip(" -")
        elif isinstance(spend_obj, str):
            spend_range = spend_obj

        impressions_obj = cr.get("impressions") or snapshot.get("impressions")
        impressions_range = None
        if isinstance(impressions_obj, dict):
            impressions_range = f"{impressions_obj.get('lower_bound', '')} - {impressions_obj.get('upper_bound', '')}".strip(" -")
        elif isinstance(impressions_obj, str):
            impressions_range = impressions_obj

        currency = cr.get("currency") or snapshot.get("currency")

        body_variations = []
        if body_text:
            body_variations.append(body_text)
        for et in snapshot.get("extra_texts") or snapshot.get("additional_texts") or []:
            t = et.get("text") if isinstance(et, dict) else str(et)
            if t and t not in body_variations:
                body_variations.append(t)

        title_variations = []
        if title:
            title_variations.append(title)
        for et in snapshot.get("extra_titles") or []:
            t = et.get("text") if isinstance(et, dict) else str(et)
            if t and t not in title_variations:
                title_variations.append(t)

        demographics = cr.get("demographic_distribution") or snapshot.get("demographic_distribution") or []
        regions = cr.get("region_distribution") or snapshot.get("region_distribution") or []
        page_is_verified = bool(cr.get("page_is_verified") or snapshot.get("page_is_verified") or snapshot.get("is_verified"))

        return MetaAdItem(
            adArchiveId=ad_id,
            adLibraryUrl=f"https://www.facebook.com/ads/library/?id={ad_id}&country={default_country}",
            pageId=page_id,
            pageName=page_name,
            pageProfilePictureUrl=page_profile_pic,
            pageProfileUrl=page_profile_uri or (f"https://www.facebook.com/{page_id}" if page_id else ""),
            pageLikeCount=page_likes,
            pageCategories=page_categories,
            pageIsDeleted=cr.get("page_is_deleted", False),
            pageIsVerified=page_is_verified,
            adContent=body_text,
            adTitle=title,
            adLinkCaption=caption,
            adLinkDescription=link_desc,
            adLinkUrl=link_url,
            adCallToActionType=cta_type,
            adCallToActionText=cta_text,
            adFormat=ad_format,
            imageUrls=image_urls,
            videoUrls=video_urls,
            videoPreviewImageUrls=video_preview_urls,
            cards=cards,
            startDate=start_date,
            endDate=end_date,
            isActive=is_active,
            daysRunning=days_running,
            spendRange=spend_range,
            impressionsRange=impressions_range,
            currency=currency,
            demographics=demographics if isinstance(demographics, list) else [],
            regions=regions if isinstance(regions, list) else [],
            bodyVariations=body_variations,
            titleVariations=title_variations,
            countries=cr.get("targeted_or_reached_countries", []),
            platforms=platforms,
            categories=cr.get("categories", ["UNKNOWN"]),
            collationCount=int(cr.get("collation_count") or 1),
            collationId=str(cr.get("collation_id") or ""),
        )

    async def search_advertisers(self, query: str, country: str = "ALL") -> List[dict]:
        """Searches Meta Ad Library using native Typeahead autocomplete for official brand profiles."""
        q_clean = query.strip()
        if not q_clean:
            return []

        search_url = (
            f"https://www.facebook.com/ads/library/?"
            f"active_status=active&ad_type=all&country={country}&is_targeted_country=false"
            f"&locale=en_US&media_type=all&search_type=keyword_unordered&q={urllib.parse.quote(q_clean)}"
        )

        exact_typeahead_pages: Dict[str, dict] = {}
        fallback_pages: Dict[str, dict] = {}
        typeahead_received = asyncio.Event()

        semaphore = self._get_semaphore()
        async with semaphore:
            browser = await self.get_browser()
            context = await browser.new_context(
                locale="en-US",
                user_agent=USER_AGENT,
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
            )
            try:
                page = await context.new_page()

                async def on_resp(resp):
                    if "graphql" in resp.url:
                        try:
                            text = await resp.text()
                            if "typeahead_suggestions" in text:
                                pd = urllib.parse.unquote_plus(resp.request.post_data or "")
                                has_query = False
                                for part in pd.split("&"):
                                    if part.startswith("variables="):
                                        try:
                                            v = json.loads(part[10:])
                                            if v.get("queryString", "").strip().lower() == q_clean.lower():
                                                has_query = True
                                                break
                                        except Exception:
                                            pass

                                data = json.loads(text)
                                suggestions = data.get("data", {}).get("ad_library_main", {}).get("typeahead_suggestions", {})
                                page_results = suggestions.get("page_results", [])
                                target_dict = exact_typeahead_pages if has_query else fallback_pages
                                for p_res in page_results:
                                    pid = str(p_res.get("page_id") or "")
                                    pname = p_res.get("name") or ""
                                    if pid and pname:
                                        target_dict[pid] = {
                                            "page_id": pid,
                                            "page_name": pname,
                                            "image_uri": p_res.get("image_uri") or "",
                                            "likes": p_res.get("likes") or 0,
                                            "category": p_res.get("category") or "",
                                            "verification": p_res.get("verification") or "NOT_VERIFIED",
                                            "ig_username": p_res.get("ig_username") or "",
                                            "ig_followers": p_res.get("ig_followers") or 0,
                                        }
                                if has_query and exact_typeahead_pages:
                                    typeahead_received.set()
                            elif not exact_typeahead_pages and not fallback_pages:
                                data = json.loads(text)
                                main_data = data.get("data", {}).get("ad_library_main", {})
                                for item in main_data.get("dynamic_filter_options", {}).get("pages", []):
                                    pid = str(item.get("key") or "")
                                    pname = item.get("display_name")
                                    if pid and pname and pid not in fallback_pages:
                                        fallback_pages[pid] = {
                                            "page_id": pid,
                                            "page_name": pname,
                                            "image_uri": "",
                                            "likes": 0,
                                            "category": "",
                                            "verification": "NOT_VERIFIED",
                                            "ig_username": "",
                                            "ig_followers": 0,
                                        }
                        except Exception:
                            pass

                page.on("response", on_resp)
                try:
                    await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
                    await asyncio.sleep(1.5)

                    target_input = None
                    for inp in await page.query_selector_all("input"):
                        if await inp.is_visible():
                            val = (await inp.get_attribute("value") or "").lower()
                            ph = (await inp.get_attribute("placeholder") or "").lower()
                            if q_clean.lower() in val or "search" in ph or "keyword" in ph or "advertiser" in ph:
                                target_input = inp
                                break

                    if target_input:
                        await target_input.click()
                        await asyncio.sleep(0.1)
                        await target_input.fill("")
                        await asyncio.sleep(0.05)
                        await target_input.type(q_clean, delay=40)

                    try:
                        await asyncio.wait_for(typeahead_received.wait(), timeout=8.0)
                    except asyncio.TimeoutError:
                        pass

                except Exception as exc:
                    logger.warning(f"Advertiser search error: {exc}")
            finally:
                await context.close()

        matched_pages = exact_typeahead_pages if exact_typeahead_pages else fallback_pages

        q_norm = _normalize_token(q_clean)
        scored = []
        for p_info in matched_pages.values():
            name_norm = _normalize_token(p_info["page_name"])
            score = 0
            if q_norm == name_norm:
                score += 100
            elif q_norm in name_norm:
                score += 60
            elif name_norm in q_norm:
                score += 40
            elif not exact_typeahead_pages:
                q_words = set(q_norm.split())
                n_words = set(name_norm.split())
                if not (q_words & n_words):
                    continue
                score += len(q_words & n_words) * 15

            if p_info.get("verification") == "BLUE_VERIFIED":
                score += 20
            likes = p_info.get("likes") or 0
            ig_f = p_info.get("ig_followers") or 0
            if likes > 1000 or ig_f > 1000:
                score += 10
            score += min((likes + ig_f) / 10000.0, 10.0)
            scored.append((score, p_info))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:12]]

    async def _scrape_target_page(
        self,
        context: BrowserContext,
        target: str,
        params: ScrapeFilterParams,
    ) -> tuple[List[MetaAdItem], Dict[str, Any]]:
        page_id = parse_page_id(target)

        # If target was provided as raw text brand name instead of numeric ID, auto-resolve via typeahead
        if not page_id.isdigit():
            try:
                resolved = await self.search_advertisers(target, country=params.country)
                if resolved and resolved[0].get("page_id"):
                    page_id = resolved[0]["page_id"]
                    logger.info(f"Auto-resolved '{target}' to Page ID: {page_id}")
            except Exception as res_err:
                logger.debug(f"Target '{target}' auto-resolve notice: {res_err}")

        page = await context.new_page()
        captured_ads: Dict[str, MetaAdItem] = {}

        status_param = params.active_status.lower()
        if status_param not in ("active", "inactive", "all"):
            status_param = "all"

        # In non-EU regions (e.g. India / IN), Meta Ad Library does not archive inactive commercial ads;
        # querying active_status=all causes Meta to return 0 results.
        # Fallback: query 'active' with is_targeted_country=false to capture all live ads.
        query_status = "active" if (status_param == "all" and params.country != "ALL") else status_param

        target_url = (
            f"https://www.facebook.com/ads/library/?"
            f"active_status={query_status}&ad_type=all&country={params.country}&is_targeted_country=false"
            f"&locale=en_US&media_type={params.media_type}&search_type=page"
            f"&sort_data[direction]=desc&sort_data[mode]=relevancy_monthly_grouped&view_all_page_id={page_id}"
        )

        logger.info(f"Target [{page_id}] -> {target_url}")

        async def handle_response(response):
            if "graphql" in response.url:
                try:
                    body = await response.text()
                    data = json.loads(body)
                    main_data = data.get("data", {}).get("ad_library_main", {})
                    conn = main_data.get("search_results_connection", {})
                    for edge in conn.get("edges", []):
                        node = edge.get("node", {})
                        for cr in node.get("collated_results", []):
                            ad_item = self._extract_ad_model(cr, default_country=params.country)
                            if not ad_item.adArchiveId:
                                continue
                            # When using view_all_page_id=X, Meta already filters by page.
                            # Only skip if both IDs are present AND don't match.
                            if ad_item.adArchiveId not in captured_ads:
                                captured_ads[ad_item.adArchiveId] = ad_item
                except Exception:
                    pass

        page.on("response", handle_response)

        nav_error = None
        try:
            # Use domcontentloaded with a short delay to avoid 45s networkidle stalls on Meta analytics beacons
            await page.goto(target_url, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
            await asyncio.sleep(2.0)

            # Extract initial Server-Side Rendered (SSR) batch directly from page scripts
            try:
                ssr_raw_ads = await page.evaluate("""
                () => {
                    const results = [];
                    const scripts = document.querySelectorAll('script[type="application/json"]');
                    for (const s of scripts) {
                        if (s.textContent && s.textContent.includes('search_results_connection')) {
                            try {
                                const data = JSON.parse(s.textContent);
                                const findConns = (obj) => {
                                    if (!obj || typeof obj !== 'object') return;
                                    if (obj.search_results_connection && Array.isArray(obj.search_results_connection.edges)) {
                                        for (const edge of obj.search_results_connection.edges) {
                                            if (edge && edge.node && Array.isArray(edge.node.collated_results)) {
                                                for (const cr of edge.node.collated_results) {
                                                    results.push(cr);
                                                }
                                            }
                                        }
                                    }
                                    if (Array.isArray(obj)) {
                                        for (const item of obj) findConns(item);
                                    } else {
                                        for (const k in obj) {
                                            if (Object.prototype.hasOwnProperty.call(obj, k)) findConns(obj[k]);
                                        }
                                    }
                                };
                                findConns(data);
                            } catch (e) {}
                        }
                    }
                    return results;
                }
                """)
                if ssr_raw_ads:
                    for cr in ssr_raw_ads:
                        ad_item = self._extract_ad_model(cr, default_country=params.country)
                        if ad_item.adArchiveId and ad_item.adArchiveId not in captured_ads:
                            captured_ads[ad_item.adArchiveId] = ad_item
                    logger.info(f"Target [{page_id}] loaded {len(captured_ads)} ads from initial page SSR.")
            except Exception as ssr_err:
                logger.warning(f"Target [{page_id}] SSR extraction error: {ssr_err}")

            # Scroll to trigger pagination if more ads are needed
            scroll_attempts = 0
            last_count = len(captured_ads)
            max_scrolls = max(3, (params.max_ads // 10) + 1)

            while len(captured_ads) < params.max_ads and scroll_attempts < max_scrolls:
                scroll_attempts += 1
                await page.evaluate("window.scrollBy(0, 1800)")
                await asyncio.sleep(1.8)

                current_count = len(captured_ads)
                if current_count >= params.max_ads:
                    break
                if current_count == last_count and scroll_attempts >= 2:
                    await page.evaluate("window.scrollBy(0, 1000)")
                    await asyncio.sleep(1.5)
                    if len(captured_ads) == last_count:
                        break
                last_count = current_count

        except Exception as exc:
            nav_error = exc
            logger.warning(f"Error scraping target [{target}]: {exc}")
        finally:
            dom_reason = ""
            if not nav_error and len(captured_ads) == 0:
                try:
                    text_snippet = await page.evaluate("() => document.body ? document.body.innerText.substring(0, 1000) : ''")
                    if "No results found" in text_snippet or "0 results" in text_snippet or "No ads match" in text_snippet:
                        dom_reason = f"Meta confirmed 0 active ads currently running in {params.country}."
                    elif not page_id.isdigit():
                        dom_reason = f"Target '{target}' could not be matched to a numeric Meta Page ID."
                    else:
                        dom_reason = f"Meta Ad Library returned 0 ads for Page ID {page_id} (Country: {params.country}, Status: {status_param})."
                except Exception:
                    pass
            await page.close()

        result_list = list(captured_ads.values())[:params.max_ads]

        if nav_error:
            diagnostic_log = f"Target [{target}]: Navigation Failed - {type(nav_error).__name__}: {str(nav_error)}"
            diagnostic_status = "error"
        elif len(result_list) == 0:
            diagnostic_log = f"Target [{target} | ID: {page_id}]: {dom_reason or 'Meta Ad Library returned 0 ads for current criteria.'}"
            diagnostic_status = "zero_ads"
        else:
            diagnostic_log = f"Target [{target} | ID: {page_id}]: Successfully retrieved {len(result_list)} active creatives from Meta Ad Library."
            diagnostic_status = "success"

        logger.info(diagnostic_log)
        return result_list, {
            "target": target,
            "page_id": page_id,
            "status": diagnostic_status,
            "ads_count": len(result_list),
            "log": diagnostic_log,
        }

    async def scrape(
        self,
        targets: List[str],
        params: ScrapeFilterParams,
    ) -> tuple[List[MetaAdItem], List[str], List[Dict[str, Any]]]:
        if not targets:
            return [], [], []

        all_ads: Dict[str, MetaAdItem] = {}
        logs: List[str] = []
        diagnostics: List[Dict[str, Any]] = []

        semaphore = self._get_semaphore()
        async with semaphore:
            browser = await self.get_browser()
            context: BrowserContext = await browser.new_context(
                locale="en-US",
                user_agent=USER_AGENT,
                extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
                viewport={"width": 1440, "height": 900},
            )
            try:
                for target in targets:
                    target_ads, diag = await self._scrape_target_page(context, target, params)
                    logs.append(diag["log"])
                    diagnostics.append(diag)
                    for ad in target_ads:
                        if ad.adArchiveId not in all_ads:
                            all_ads[ad.adArchiveId] = ad
            finally:
                await context.close()

        final_ads = list(all_ads.values())
        logger.info(f"Scrape completed: {len(final_ads)} total unique ads collected across {len(targets)} targets.")
        return final_ads, logs, diagnostics


scraper = MetaScraperService()
