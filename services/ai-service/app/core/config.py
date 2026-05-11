from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8002
    internal_api_key: str
    google_cloud_project: str
    vertex_ai_location: str = "us-central1"
    gemini_model: str = "gemini-1.5-pro"
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]
