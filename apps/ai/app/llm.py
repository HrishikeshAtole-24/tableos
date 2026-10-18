"""Claude calls for menu extraction and translation.

Structured JSON output (output_config.format) guarantees parseable JSON; results are then
validated with Pydantic, and the API validates them a third time with Zod.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Protocol

import anthropic
import httpx

from .config import Settings
from .schemas import ExtractedMenuModel, ExtractRequest, TranslateRequest

EXTRACT_SYSTEM = """You read photos or PDFs of printed restaurant menus from India and return the menu as structured data.

Rules:
- Keep category and dish names exactly as printed (fix only obvious OCR noise). Do not invent dishes.
- Prices are in Indian rupees. Return the number only (e.g. 249 or 249.5). If a price is unreadable or missing, return null.
- When a dish has sizes or portions (Half/Full, Regular/Large, 6 pcs/12 pcs), return them as variants with their own prices and leave price null.
- diet: "veg", "nonveg" or "egg" when the menu marks it (green/red symbols, section names, or obvious from the dish name); otherwise null.
- description: the printed description if any, else null. Do not write marketing copy.
- confidence (0 to 1) reflects how sure you are you read that field correctly. Use values below 0.8 for blurry, cropped or ambiguous text.
- Keep the printed order of categories and dishes."""

TRANSLATE_SYSTEM = """You translate restaurant menu text from English into Indian languages for diners.

Rules:
- Transliterate dish names the way Indian menus usually write them (e.g. "Paneer Butter Masala" -> "पनीर बटर मसाला"), do not translate them literally.
- Translate descriptions naturally and briefly.
- Return every key you were given, for every requested language."""


def _price_schema() -> dict[str, Any]:
    return {"anyOf": [{"type": "number"}, {"type": "null"}]}


EXTRACT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["categories"],
    "properties": {
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "confidence", "items"],
                "properties": {
                    "name": {"type": "string"},
                    "confidence": {"type": "number"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["name", "name_confidence", "description", "price", "price_confidence", "diet", "variants"],
                            "properties": {
                                "name": {"type": "string"},
                                "name_confidence": {"type": "number"},
                                "description": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                                "price": _price_schema(),
                                "price_confidence": {"type": "number"},
                                "diet": {"anyOf": [{"type": "string", "enum": ["veg", "nonveg", "egg"]}, {"type": "null"}]},
                                "variants": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "additionalProperties": False,
                                        "required": ["name", "price", "confidence"],
                                        "properties": {
                                            "name": {"type": "string"},
                                            "price": {"type": "number"},
                                            "confidence": {"type": "number"},
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }
    },
}


def translate_schema(locales: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["items"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["key", *locales],
                    "properties": {"key": {"type": "string"}, **{loc: {"type": "string"} for loc in locales}},
                },
            }
        },
    }


class LlmRefusal(Exception):
    """The model declined the request (stop_reason == "refusal")."""


class MenuLlm(Protocol):
    async def extract(self, req: ExtractRequest) -> ExtractedMenuModel: ...
    async def translate(self, req: TranslateRequest) -> dict[str, dict[str, str]]: ...


class ClaudeMenuLlm:
    def __init__(self, settings: Settings, client: anthropic.AsyncAnthropic | None = None, http: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client or anthropic.AsyncAnthropic(api_key=settings.llm_api_key or None, timeout=180.0, max_retries=2)
        self.http = http or httpx.AsyncClient(timeout=30.0, follow_redirects=True)

    async def _file_block(self, url: str, content_type: str) -> dict[str, Any]:
        res = await self.http.get(url)
        res.raise_for_status()
        if len(res.content) > 10 * 1024 * 1024:
            raise ValueError("File larger than 10 MB")
        data = base64.standard_b64encode(res.content).decode("ascii")
        if content_type == "application/pdf":
            return {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": data}}
        return {"type": "image", "source": {"type": "base64", "media_type": content_type, "data": data}}

    async def _json_call(self, system: str, content: list[dict[str, Any]], schema: dict[str, Any], max_tokens: int) -> Any:
        response = await self.client.beta.messages.create(
            model=self.settings.llm_model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
            output_config={"effort": "medium", "format": {"type": "json_schema", "schema": schema}},
            # Server-side refusal fallback: routes a declined request by refusal category.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason == "refusal":
            raise LlmRefusal("The model declined to process this file")
        if response.stop_reason == "max_tokens":
            raise ValueError("The menu is too long to read in one pass; upload fewer pages at a time")
        text = next((b.text for b in response.content if b.type == "text"), None)
        if text is None:
            raise ValueError("Model returned no JSON")
        return json.loads(text)

    async def extract(self, req: ExtractRequest) -> ExtractedMenuModel:
        blocks = [await self._file_block(str(f.url), f.content_type) for f in req.files]
        blocks.append({"type": "text", "text": f"Read this menu ({len(req.files)} page(s)) and return every category and dish."})
        raw = await self._json_call(EXTRACT_SYSTEM, blocks, EXTRACT_SCHEMA, max_tokens=16000)
        return ExtractedMenuModel.from_llm(raw)

    async def translate(self, req: TranslateRequest) -> dict[str, dict[str, str]]:
        names = {"hi": "Hindi (Devanagari)", "mr": "Marathi (Devanagari)"}
        wanted = ", ".join(f"{loc} = {names.get(loc, loc)}" for loc in req.locales)
        payload = json.dumps([{"key": i.key, "text": i.text} for i in req.items], ensure_ascii=False)
        content = [{"type": "text", "text": f"Languages: {wanted}.\nTranslate each item's text. Items:\n{payload}"}]
        raw = await self._json_call(TRANSLATE_SYSTEM, content, translate_schema(req.locales), max_tokens=16000)
        out: dict[str, dict[str, str]] = {loc: {} for loc in req.locales}
        valid = {i.key for i in req.items}
        for row in raw.get("items", []):
            if row.get("key") not in valid:
                continue
            for loc in req.locales:
                value = (row.get(loc) or "").strip()
                if value:
                    out[loc][row["key"]] = value[:400]
        return out
