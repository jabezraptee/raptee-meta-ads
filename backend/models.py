from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field


class CarouselCard(BaseModel):
    title: str = ""
    body: str = ""
    caption: str = ""
    link_url: str = ""
    cta_text: str = ""
    original_image_url: str = ""
    resized_image_url: str = ""
    video_preview_image_url: str = ""
    video_hd_url: str = ""
    video_sd_url: str = ""


class MetaAdItem(BaseModel):
    adArchiveId: str
    adLibraryUrl: str = ""
    pageId: str
    pageName: str = "Unknown Page"
    pageProfilePictureUrl: str = ""
    pageProfileUrl: str = ""
    pageLikeCount: Optional[int] = None
    pageCategories: List[str] = Field(default_factory=list)
    pageIsDeleted: bool = False
    pageIsVerified: bool = False

    adContent: str = ""
    adTitle: str = ""
    adLinkCaption: str = ""
    adLinkDescription: str = ""
    adLinkUrl: str = ""
    adCallToActionType: str = ""
    adCallToActionText: str = ""
    adFormat: str = "image"  # "image" | "video" | "carousel"

    imageUrls: List[str] = Field(default_factory=list)
    videoUrls: List[str] = Field(default_factory=list)
    videoPreviewImageUrls: List[str] = Field(default_factory=list)
    cards: List[CarouselCard] = Field(default_factory=list)

    startDate: Optional[str] = None
    endDate: Optional[str] = None
    isActive: bool = True
    daysRunning: Optional[int] = None

    spendRange: Optional[str] = None
    impressionsRange: Optional[str] = None
    currency: Optional[str] = None

    demographics: List[dict] = Field(default_factory=list)
    regions: List[dict] = Field(default_factory=list)
    bodyVariations: List[str] = Field(default_factory=list)
    titleVariations: List[str] = Field(default_factory=list)

    countries: List[str] = Field(default_factory=list)
    platforms: List[str] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    collationCount: int = 1
    collationId: str = ""
    scrapedAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ScrapeFilterParams(BaseModel):
    country: str = "ALL"
    active_status: str = "all"
    media_type: str = "all"
    max_ads: int = Field(default=30, ge=1, le=500)


class ScrapeRequest(BaseModel):
    targets: List[str] = Field(..., min_length=1, description="List of Page IDs or Facebook Page URLs")
    country: str = "ALL"
    active_status: str = "all"
    media_type: str = "all"
    max_ads: int = 30


class ScrapeResponse(BaseModel):
    success: bool = True
    total_ads: int = 0
    duration_seconds: float = 0.0
    items: List[MetaAdItem] = Field(default_factory=list)
    error: Optional[str] = None
    logs: List[str] = Field(default_factory=list)
    diagnostics: List[dict] = Field(default_factory=list)

