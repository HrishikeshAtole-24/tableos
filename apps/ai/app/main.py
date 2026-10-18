"""TableOS AI service: menu extraction from images/PDFs and menu translation.

Called only by the API's background jobs, authenticated with a shared bearer token.
"""

from __future__ import annotations

import hmac
import logging
from typing import Annotated

import anthropic
from fastapi import Depends, FastAPI, Header, HTTPException

from .config import Settings, get_settings
from .llm import ClaudeMenuLlm, LlmRefusal, MenuLlm
from .schemas import ExtractedMenuModel, ExtractRequest, TranslateRequest

log = logging.getLogger("tableos.ai")
app = FastAPI(title="TableOS AI", version="1.0.0", docs_url=None, redoc_url=None)

_llm: MenuLlm | None = None


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> MenuLlm:
    global _llm
    if _llm is None:
        _llm = ClaudeMenuLlm(settings)
    return _llm


def require_token(settings: Annotated[Settings, Depends(get_settings)], authorization: Annotated[str | None, Header()] = None) -> None:
    expected = f"Bearer {settings.ai_service_token}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "Invalid service token"})


def _map_errors(err: Exception) -> HTTPException:
    if isinstance(err, LlmRefusal):
        return HTTPException(422, {"code": "refused", "message": str(err)})
    if isinstance(err, anthropic.RateLimitError):
        return HTTPException(503, {"code": "llm_rate_limited", "message": "AI provider is busy, retry later"})
    if isinstance(err, anthropic.APIStatusError) and err.status_code >= 500:
        return HTTPException(503, {"code": "llm_unavailable", "message": "AI provider error, retry later"})
    if isinstance(err, anthropic.APIConnectionError):
        return HTTPException(503, {"code": "llm_unreachable", "message": "AI provider unreachable"})
    if isinstance(err, anthropic.APIStatusError):
        return HTTPException(502, {"code": "llm_error", "message": err.message})
    return HTTPException(422, {"code": "extraction_failed", "message": str(err)[:300]})


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/extract-menu", dependencies=[Depends(require_token)])
async def extract_menu(req: ExtractRequest, llm: Annotated[MenuLlm, Depends(get_llm)]) -> ExtractedMenuModel:
    try:
        return await llm.extract(req)
    except Exception as err:  # noqa: BLE001 - mapped to typed HTTP errors
        log.warning("extract failed: %s", err)
        raise _map_errors(err) from err


@app.post("/v1/translate", dependencies=[Depends(require_token)])
async def translate(req: TranslateRequest, llm: Annotated[MenuLlm, Depends(get_llm)]) -> dict[str, dict[str, dict[str, str]]]:
    try:
        return {"translations": await llm.translate(req)}
    except Exception as err:  # noqa: BLE001
        log.warning("translate failed: %s", err)
        raise _map_errors(err) from err
