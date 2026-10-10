import json
import urllib.error
import urllib.request
from typing import Any, Dict, List

from backend.config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, get_logger

logger = get_logger("AIService")

# ==============================================================================
# SYSTEM PROMPTS (Visible & Fully Customizable)
# You can view and modify these prompt instructions right here.
# ==============================================================================

SYSTEM_PROMPT_COUNTER_AD = (
    "You are an elite Performance Creative Strategist and Meta Media Buyer. "
    "Your job is to reverse-engineer competitor ads and generate superior counter-angles "
    "that capture in-market buyers. Return a clean, formatted strategic breakdown."
)

SYSTEM_PROMPT_STRATEGY = (
    "You are a Chief Performance Marketing Officer specialized in competitive ad intelligence. "
    "Analyze the competitor advertising dataset provided in the context and produce a sharp, "
    "actionable Offensive Strategy Playbook with market gaps, creative angles, and battle tactics."
)

SYSTEM_PROMPT_DOSSIER = (
    "You are a Senior Competitor Intelligence Analyst. "
    "Produce an executive brief on competitor ad volume, longevity, and testing cadence based strictly on the data."
)

SYSTEM_PROMPT_COPILOT = (
    "You are an elite Meta Ads Performance Marketing Expert, Creative Strategist, and Media Buyer. "
    "You possess deep expertise in direct response advertising, creative fatigue mitigation, hook-rate optimization, "
    "hold-rate maximization, CTR/ROAS scaling, high-converting offer structures, audience targeting strategies, and "
    "reverse-engineering competitor ad copy.\n\n"
    "You are consulting a brand marketer using live competitive intelligence gathered from Meta Ads Library.\n"
    "Guidelines:\n"
    "- Act like an expert practitioner: deliver sharp, high-impact, tactical advice on how to improve and beat ads.\n"
    "- Ground your advice in the provided competitor ads context whenever relevant (quote competitor angles, flaws, or gaps).\n"
    "- Provide clear, actionable recommendations: specific hook ideas, copy angles, formatting tips (video vs carousel vs static), "
    "CTA choices, psychological triggers, and testing methodologies.\n"
    "- Maintain a conversational, confident, and professional direct-response tone."
)


class AIService:
    """Enterprise-grade LLM service supporting any OpenAI-compatible provider."""

    def __init__(self):
        self.api_key = LLM_API_KEY
        self.base_url = LLM_BASE_URL
        self.model = LLM_MODEL

    def is_configured(self) -> bool:
        return bool(self.api_key and len(self.api_key.strip()) > 3)

    def call_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 1800,
    ) -> str:
        """
        Calls the OpenAI-compatible chat completions endpoint.
        Raises an explicit error if not configured or if the request fails.
        No hardcoded messages or fake fallbacks.
        """
        if not self.is_configured():
            raise ValueError(
                "LLM_API_KEY is not configured in .env. "
                "Please configure LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL in .env to activate AI."
            )

        endpoint = f"{self.base_url.rstrip('/')}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                "User-Agent": "MetaAdsIntelligence/2.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "").strip()
                    if content:
                        return content
                raise RuntimeError("LLM returned an empty response.")
        except urllib.error.HTTPError as http_err:
            err_body = http_err.read().decode("utf-8", errors="ignore")
            logger.error(f"LLM API HTTP {http_err.code} on {endpoint}: {err_body}")
            raise RuntimeError(f"LLM API Error ({http_err.code}): {err_body}")
        except Exception as exc:
            logger.error(f"LLM API request error on {endpoint}: {exc}")
            raise RuntimeError(f"LLM Request Failed: {str(exc)}")

    def generate_counter_ad(self, ad: Dict[str, Any]) -> Dict[str, Any]:
        """
        Reverse-engineers competitor creative and generates 3 counter-angles.
        Context sent to AI is strictly extracted from the competitor's ad data.
        """
        brand = ad.get("pageName") or "Competitor"
        headline = ad.get("adTitle") or "Untitled"
        copy = (ad.get("adContent") or "")[:500]
        days = ad.get("daysRunning") or 1
        copies = ad.get("collationCount") or 1
        ad_format = ad.get("adFormat") or "image"
        cta = ad.get("callToAction") or "None"

        user_prompt = (
            f"Analyze this winning competitor ad from {brand}:\n"
            f"- Headline: \"{headline}\"\n"
            f"- Primary Copy: \"{copy}\"\n"
            f"- Ad Format: {ad_format}\n"
            f"- Call To Action (CTA): {cta}\n"
            f"- Days Running (Longevity): {days} days\n"
            f"- Active Copies Running (Horizontal Scaling): {copies} copies\n\n"
            "Provide:\n"
            "1. Core Competitor Hook & Angle Breakdown (what psychological trigger they are exploiting)\n"
            "2. Three Direct Counter-Angles with:\n"
            "   - Angle Name & Positioning\n"
            "   - Hook / Headline\n"
            "   - Primary Text (punchy, 2-3 sentences)\n"
            "   - Recommended CTA\n"
            "   - Strategic Rationale (why this beats their ad)"
        )

        response = self.call_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT_COUNTER_AD},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
        )

        return {
            "source": f"LLM ({self.model})",
            "competitor": brand,
            "headline": headline,
            "analysis": response,
        }

    def generate_strategy_report(self, ads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generates an Offensive Strategic Playbook comparing competitor campaigns.
        Context sent to AI is built purely from the actual scraped ad dataset.
        """
        total = len(ads)
        brands = {}
        evergreens = 0
        formats = {"video": 0, "carousel": 0, "image": 0}
        ctas = {}

        for ad in ads:
            name = ad.get("pageName") or "Unknown"
            brands[name] = brands.get(name, 0) + 1
            if (ad.get("daysRunning") or 1) >= 30:
                evergreens += 1
            fmt = ad.get("adFormat") or "image"
            formats[fmt] = formats.get(fmt, 0) + 1
            cta = ad.get("callToAction") or "None"
            ctas[cta] = ctas.get(cta, 0) + 1

        brand_summary = ", ".join([f"{k}: {v} ads" for k, v in brands.items()])
        cta_summary = ", ".join([f"{k}: {v}" for k, v in list(ctas.items())[:5]])

        # Sample top ad copies from dataset
        sample_copies = [
            f"- [{a.get('pageName')}]: \"{a.get('adTitle') or a.get('adContent', '')[:80]}\" ({a.get('adFormat')}, {a.get('daysRunning', 1)}d)"
            for a in ads[:8]
        ]
        sample_str = "\n".join(sample_copies)

        user_prompt = (
            f"Competitor Dataset Analysis ({total} Total Ads):\n"
            f"- Brands Breakdown: {brand_summary}\n"
            f"- Evergreen Winners (Active >= 30 days): {evergreens} ads\n"
            f"- Format Allocation: {formats['video']} Videos, {formats['carousel']} Carousels, {formats['image']} Images\n"
            f"- Top CTAs: {cta_summary}\n\n"
            f"Sample Ads from Library:\n{sample_str}\n\n"
            "Provide an offensive tactical playbook:\n"
            "1. Competitor Core Positioning & Offer Matrix\n"
            "2. Creative Blindspots & Market Gaps (what they are ignoring)\n"
            "3. 3 High-Impact Offensive Campaigns to run against them this quarter"
        )

        response = self.call_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT_STRATEGY},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        return {
            "source": f"LLM ({self.model})",
            "report": response,
            "strategy_report": response,
        }

    def generate_dossier(self, ads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Generates an Executive Intelligence Dossier based on scraped data.
        """
        total = len(ads)
        evergreens = sum(1 for a in ads if (a.get("daysRunning") or 1) >= 30)
        top_winners = sorted(ads, key=lambda x: (x.get("daysRunning") or 1), reverse=True)[:8]

        winners_text = "\n".join([
            f"- {w.get('pageName')}: \"{w.get('adTitle') or w.get('adContent', '')[:70]}\" "
            f"(Running: {w.get('daysRunning', 1)}d, Copies: {w.get('collationCount', 1)}, Format: {w.get('adFormat')})"
            for w in top_winners
        ])

        user_prompt = (
            f"Analyze these top evergreen competitor ad winners from our scrape:\n{winners_text}\n\n"
            f"Dataset Summary: {total} total creatives tracked, {evergreens} evergreens running >= 30 days.\n\n"
            "Provide an executive briefing detailing:\n"
            "1. Budget and Scaling Pattern Observations (which ads have highest copy counts/run times)\n"
            "2. Creative Longevity vs Fatigue Risks\n"
            "3. Immediate Strategic Opportunities for our brand"
        )

        response = self.call_llm(
            [
                {"role": "system", "content": SYSTEM_PROMPT_DOSSIER},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )

        return {
            "source": f"LLM ({self.model})",
            "dossier": response,
        }

    def query_copilot(
        self,
        messages_or_question: Any,
        ads: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Full conversational chatbot that acts as an elite Meta Ads expert.
        Supports multi-turn conversation history grounded in the live competitor ads dataset.
        """
        total = len(ads)
        brands = {}
        formats = {"video": 0, "carousel": 0, "image": 0}
        evergreens = 0
        for a in ads:
            name = a.get("pageName") or "Unknown"
            brands[name] = brands.get(name, 0) + 1
            if (a.get("daysRunning") or 1) >= 30:
                evergreens += 1
            fmt = a.get("adFormat") or "image"
            formats[fmt] = formats.get(fmt, 0) + 1

        brand_summary = ", ".join([f"{k} ({v} ads)" for k, v in brands.items()]) or "No brand ads loaded"

        sample = [
            f"• [{a.get('pageName')}] Title: \"{a.get('adTitle', '')}\" | Copy: \"{a.get('adContent', '')[:110]}\" | "
            f"Format: {a.get('adFormat')} | Running: {a.get('daysRunning', 1)}d | Copies: {a.get('collationCount', 1)} | CTA: {a.get('callToAction', 'None')}"
            for a in ads[:25]
        ]
        context_str = "\n".join(sample)

        context_prompt = (
            f"=== LIVE SCRAPED COMPETITOR AD DATABASE ({total} ADS LOADED) ===\n"
            f"- Tracked Brands: {brand_summary}\n"
            f"- Creative Mix: {formats['video']} Videos, {formats['carousel']} Carousels, {formats['image']} Static Images\n"
            f"- Evergreen Winners (Active 30+ Days): {evergreens} ads\n\n"
            f"Active Ad Samples from Dataset:\n{context_str}\n"
            f"=================================================================\n"
            f"Refer directly to these live ads when answering the user. If asked for recommendations, deliver specific, "
            f"actionable hooks, direct-response copy angles, visual creative concepts, and media buying strategies."
        )

        llm_messages = [
            {"role": "system", "content": f"{SYSTEM_PROMPT_COPILOT}\n\n{context_prompt}"}
        ]

        if isinstance(messages_or_question, list):
            for m in messages_or_question:
                role = m.get("role", "user")
                content = (m.get("content") or "").strip()
                if content and role in ("user", "assistant"):
                    llm_messages.append({"role": role, "content": content})
        elif isinstance(messages_or_question, str) and messages_or_question.strip():
            llm_messages.append({"role": "user", "content": messages_or_question.strip()})
        else:
            raise ValueError("No valid message provided.")

        response = self.call_llm(llm_messages, temperature=0.5, max_tokens=1800)

        return {
            "source": f"LLM ({self.model})",
            "reply": response,
            "answer": response,
        }


ai_service = AIService()
