import sys
import asyncio
import time
from typing import Any, Dict, List
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from backend.config import FRONTEND_DIR, SERVER_HOST, SERVER_PORT, DEFAULT_COUNTRY, get_logger
from backend.models import ScrapeFilterParams, ScrapeRequest, ScrapeResponse, MetaAdItem
from backend.storage import storage
from backend.scraper import scraper
from backend.ai_service import ai_service

logger = get_logger("App")

app = FastAPI(
    title="Meta Ads Intelligence Platform",
    description="Competitor Creative Spy & Performance Analytics",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.get("/api/status")
def get_status(x_session_id: str = Header(default="default", alias="X-Session-ID")) -> Dict[str, Any]:
    return {
        "status": "online",
        "engine": "Playwright Meta Ads Direct Engine",
        "default_country": DEFAULT_COUNTRY,
        "cached_ads_count": storage.count_ads(x_session_id),
        "active_workspaces": storage.total_sessions(),
        "llm_model": ai_service.model,
        "llm_configured": ai_service.is_configured(),
    }


@app.get("/api/history", response_model=List[MetaAdItem])
def get_history(x_session_id: str = Header(default="default", alias="X-Session-ID")):
    return storage.get_ads(x_session_id)


@app.delete("/api/history")
def clear_history(x_session_id: str = Header(default="default", alias="X-Session-ID")):
    cleared = storage.clear_session(x_session_id)
    return {"success": True, "cleared": cleared, "message": "Workspace session cleared."}



@app.get("/api/resolve/search")
async def search_advertisers(q: str = Query(...), country: str = "ALL"):
    clean_q = q.strip()
    if not clean_q:
        return {"items": []}
    try:
        results = await scraper.search_advertisers(clean_q, country=country)
        return {"items": results}
    except Exception as exc:
        logger.warning(f"Search advertiser error for '{clean_q}': {exc}")
        return {"items": [], "error": str(exc)}


@app.post("/api/scrape", response_model=ScrapeResponse)
async def scrape_ads(
    request: ScrapeRequest,
    x_session_id: str = Header(default="default", alias="X-Session-ID"),
):
    normalized_targets = []
    for t in request.targets:
        for sub in t.split(","):
            sub_clean = sub.strip()
            if sub_clean and sub_clean not in normalized_targets:
                normalized_targets.append(sub_clean)

    if not normalized_targets:
        raise HTTPException(status_code=400, detail="At least one target brand or Page ID is required.")

    start_time = time.time()
    try:
        filter_params = ScrapeFilterParams(
            country=request.country,
            active_status=request.active_status,
            media_type=request.media_type,
            max_ads=request.max_ads,
        )
        ads, logs, diagnostics = await scraper.scrape(normalized_targets, filter_params)
        storage.save_ads(x_session_id, ads)

        return ScrapeResponse(
            success=True,
            total_ads=len(ads),
            duration_seconds=round(time.time() - start_time, 2),
            items=ads,
            logs=logs,
            diagnostics=diagnostics,
        )
    except Exception as exc:
        logger.error(f"Scrape execution failed: {exc}", exc_info=True)
        return ScrapeResponse(
            success=False,
            total_ads=0,
            duration_seconds=round(time.time() - start_time, 2),
            items=[],
            error=str(exc),
            logs=[f"System Exception: {type(exc).__name__}: {str(exc)}"],
            diagnostics=[{"status": "error", "reason": str(exc)}],
        )



# ---------------------------------------------------------------------------
# AI Performance Marketing Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/ai/counter-ad")
def generate_counter_ad(payload: Dict[str, Any]):
    ad = payload.get("ad") or payload
    if not ad or not isinstance(ad, dict):
        raise HTTPException(status_code=400, detail="Missing ad data")
    try:
        return ai_service.generate_counter_ad(ad)
    except Exception as exc:
        logger.error(f"AI counter-ad generation failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/ai/strategy")
def generate_strategy_report(
    payload: Dict[str, Any] = None,
    x_session_id: str = Header(default="default", alias="X-Session-ID"),
):
    ads = (payload or {}).get("ads")
    if not ads:
        ads = [a.model_dump() for a in storage.get_ads(x_session_id)]
    if not ads:
        raise HTTPException(status_code=400, detail="No ads available in workspace dataset for strategy analysis.")
    try:
        return ai_service.generate_strategy_report(ads)
    except Exception as exc:
        logger.error(f"AI strategy report failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/ai/dossier")
def generate_dossier(
    payload: Dict[str, Any] = None,
    x_session_id: str = Header(default="default", alias="X-Session-ID"),
):
    ads = (payload or {}).get("ads")
    if not ads:
        ads = [a.model_dump() for a in storage.get_ads(x_session_id)]
    if not ads:
        raise HTTPException(status_code=400, detail="No ads available in workspace dataset for dossier.")
    try:
        return ai_service.generate_dossier(ads)
    except Exception as exc:
        logger.error(f"AI dossier generation failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/api/ai/query")
def query_copilot(
    payload: Dict[str, Any],
    x_session_id: str = Header(default="default", alias="X-Session-ID"),
):
    messages = payload.get("messages")
    if not messages:
        question = payload.get("question", "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Question or messages cannot be empty")
        messages = [{"role": "user", "content": question}]

    ads = payload.get("ads")
    if not ads:
        ads = [a.model_dump() for a in storage.get_ads(x_session_id)]
    try:
        return ai_service.query_copilot(messages, ads)
    except Exception as exc:
        logger.error(f"AI copilot query failed: {exc}")
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# Static Frontend Serving
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"message": "Frontend index.html not found"}


@app.on_event("shutdown")
async def shutdown_event():
    await scraper.close()


if __name__ == "__main__":
    logger.info(f"Starting server on http://localhost:{SERVER_PORT}")
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT)

