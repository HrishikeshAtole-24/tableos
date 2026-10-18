import os

os.environ.setdefault("AI_SERVICE_TOKEN", "test-token-123456")

from fastapi.testclient import TestClient  # noqa: E402

from app.llm import LlmRefusal  # noqa: E402
from app.main import app, get_llm  # noqa: E402
from app.schemas import ExtractedMenuModel  # noqa: E402

AUTH = {"Authorization": "Bearer test-token-123456"}


class FakeLlm:
    def __init__(self, raw=None, refuse=False):
        self.raw = raw
        self.refuse = refuse

    async def extract(self, req):
        if self.refuse:
            raise LlmRefusal("declined")
        return ExtractedMenuModel.from_llm(self.raw)

    async def translate(self, req):
        return {loc: {i.key: f"{loc}:{i.text}" for i in req.items} for loc in req.locales}


def client(llm):
    app.dependency_overrides[get_llm] = lambda: llm
    return TestClient(app)


RAW = {
    "categories": [
        {
            "name": "Starters",
            "confidence": 0.95,
            "items": [
                {"name": "Paneer Tikka", "name_confidence": 0.98, "description": None, "price": None, "price_confidence": 0.9, "diet": "veg",
                 "variants": [{"name": "Half", "price": 189, "confidence": 0.9}, {"name": "Full", "price": 289.5, "confidence": 0.6}]},
                {"name": "Chicken 65", "name_confidence": 0.7, "description": "Spicy", "price": 249, "price_confidence": 1.4, "diet": "unknown", "variants": []},
                {"name": "  ", "name_confidence": 1, "description": None, "price": 10, "price_confidence": 1, "diet": None, "variants": []},
            ],
        }
    ]
}


def test_requires_token():
    c = client(FakeLlm(RAW))
    r = c.post("/v1/extract-menu", json={"files": [{"url": "https://x.test/a.png", "contentType": "image/png"}]})
    assert r.status_code == 401


def test_extract_converts_to_paise_and_clamps():
    c = client(FakeLlm(RAW))
    r = c.post("/v1/extract-menu", headers=AUTH, json={"files": [{"url": "https://x.test/a.png", "contentType": "image/png"}]})
    assert r.status_code == 200
    items = r.json()["categories"][0]["items"]
    assert len(items) == 2  # blank name dropped
    assert items[0]["variants"] == [{"name": "Half", "pricePaise": 18900, "confidence": 0.9}, {"name": "Full", "pricePaise": 28950, "confidence": 0.6}]
    assert items[1]["pricePaise"] == 24900
    assert items[1]["priceConfidence"] == 1.0
    assert items[1]["diet"] is None


def test_rejects_bad_content_type():
    c = client(FakeLlm(RAW))
    r = c.post("/v1/extract-menu", headers=AUTH, json={"files": [{"url": "https://x.test/a.gif", "contentType": "image/gif"}]})
    assert r.status_code == 422


def test_refusal_maps_to_422():
    c = client(FakeLlm(refuse=True))
    r = c.post("/v1/extract-menu", headers=AUTH, json={"files": [{"url": "https://x.test/a.png", "contentType": "image/png"}]})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "refused"


def test_translate():
    c = client(FakeLlm())
    r = c.post("/v1/translate", headers=AUTH, json={"items": [{"key": "item:1:name", "text": "Dal Tadka"}], "locales": ["hi", "mr"]})
    assert r.status_code == 200
    assert r.json()["translations"]["hi"]["item:1:name"] == "hi:Dal Tadka"
