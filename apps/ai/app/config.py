from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../../.env", ".env"), extra="ignore")

    ai_service_token: str
    llm_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
