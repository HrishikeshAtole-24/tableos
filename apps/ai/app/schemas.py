"""Request/response models. The extracted menu mirrors `extractedMenu` in packages/schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl

ContentType = Literal["image/jpeg", "image/png", "application/pdf"]


class FileRef(BaseModel):
    url: HttpUrl
    content_type: ContentType = Field(alias="contentType")


class ExtractRequest(BaseModel):
    files: list[FileRef] = Field(min_length=1, max_length=10)


class TranslateItem(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=400)


class TranslateRequest(BaseModel):
    items: list[TranslateItem] = Field(min_length=1, max_length=120)
    locales: list[Literal["hi", "mr"]] = Field(min_length=1, max_length=2)


def _clamp(v: Any) -> float:
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


def _paise(v: Any) -> int | None:
    if v is None:
        return None
    try:
        rupees = float(v)
    except (TypeError, ValueError):
        return None
    if rupees <= 0 or rupees > 1_000_000:
        return None
    return round(rupees * 100)


class VariantOut(BaseModel):
    name: str
    pricePaise: int
    confidence: float


class ItemOut(BaseModel):
    name: str
    nameConfidence: float
    description: str | None
    pricePaise: int | None
    priceConfidence: float
    diet: Literal["veg", "nonveg", "egg"] | None
    variants: list[VariantOut]


class CategoryOut(BaseModel):
    name: str
    confidence: float
    items: list[ItemOut]


class ExtractedMenuModel(BaseModel):
    categories: list[CategoryOut]

    @classmethod
    def from_llm(cls, raw: dict[str, Any]) -> "ExtractedMenuModel":
        """Convert the model's rupee/snake_case output to the API contract (paise, camelCase)."""
        cats: list[CategoryOut] = []
        for c in raw.get("categories", [])[:60]:
            items: list[ItemOut] = []
            for it in c.get("items", [])[:300]:
                name = str(it.get("name", "")).strip()[:80]
                if not name:
                    continue
                variants = []
                for v in it.get("variants", [])[:10]:
                    p = _paise(v.get("price"))
                    vname = str(v.get("name", "")).strip()[:40]
                    if p is not None and vname:
                        variants.append(VariantOut(name=vname, pricePaise=p, confidence=_clamp(v.get("confidence"))))
                desc = it.get("description")
                diet = it.get("diet") if it.get("diet") in ("veg", "nonveg", "egg") else None
                items.append(
                    ItemOut(
                        name=name,
                        nameConfidence=_clamp(it.get("name_confidence")),
                        description=str(desc).strip()[:400] if desc else None,
                        pricePaise=_paise(it.get("price")),
                        priceConfidence=_clamp(it.get("price_confidence")),
                        diet=diet,
                        variants=variants,
                    )
                )
            cname = str(c.get("name", "")).strip()[:60] or "Menu"
            cats.append(CategoryOut(name=cname, confidence=_clamp(c.get("confidence")), items=items))
        return cls(categories=cats)
