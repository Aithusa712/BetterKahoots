from pydantic_settings import BaseSettings
from motor.motor_asyncio import AsyncIOMotorClient
from functools import lru_cache


class Settings(BaseSettings):
    MONGO_URI: str = "mongodb://localhost:27017"
    MONGO_DB: str = "betterkahoots"
    ADMIN_KEY: str = "change-me"
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8080"


class Config:
    env_file = ".env"


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()
client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.MONGO_DB]
