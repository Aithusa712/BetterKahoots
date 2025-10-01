from pydantic_settings import BaseSettings, SettingsConfigDict
from motor.motor_asyncio import AsyncIOMotorClient
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "betterkahoots"
    ADMIN_KEY: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()
client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.MONGO_DB]
