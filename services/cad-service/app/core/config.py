from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8001
    internal_api_key: str
    redis_url: str = "redis://localhost:6379"
    aws_region: str = "us-east-1"
    s3_bucket_name: str

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]
