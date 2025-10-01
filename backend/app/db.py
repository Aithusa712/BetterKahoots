from typing import Optional, Dict, Any


from pydantic_settings import BaseSettings, SettingsConfigDict
from motor.motor_asyncio import AsyncIOMotorClient
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "betterkahoots"
    ADMIN_KEY: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"
    CORS_ORIGIN_REGEX: Optional[str] = r"https://.*\\.azurestaticapps\\.net"
    MONGO_TLS_CA_FILE: Optional[str] = None
    MONGO_TLS_ALLOW_INVALID_CERTS: bool = False



@lru_cache
def get_settings():
    return Settings()


settings = get_settings()


def _client_kwargs(settings: Settings) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {}
    if settings.MONGO_TLS_CA_FILE:
        kwargs["tlsCAFile"] = settings.MONGO_TLS_CA_FILE
    if settings.MONGO_TLS_ALLOW_INVALID_CERTS:
        kwargs["tlsAllowInvalidCertificates"] = settings.MONGO_TLS_ALLOW_INVALID_CERTS
    return kwargs


client = AsyncIOMotorClient(settings.MONGO_URI, **_client_kwargs(settings))
db = client[settings.MONGO_DB]
