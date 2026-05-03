from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """从环境变量与可选的 `.env` 加载配置。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gaode_api_key: str = Field(default="", validation_alias="GAODE_API_KEY")
    gaode_qps_max: float = Field(
        default=50.0,
        validation_alias="GAODE_QPS_MAX",
        description="高德 Web 服务 QPS 上限（客户端节流，默认 50）",
    )
    meituan_appkey: str = Field(default="", validation_alias="MEITUAN_APPKEY")
    meituan_secret: str = Field(default="", validation_alias="MEITUAN_SECRET")
    supabase_url: str = Field(default="", validation_alias="SUPABASE_URL")
    supabase_key: str = Field(default="", validation_alias="SUPABASE_KEY")
    ollama_host: str = Field(
        default="http://localhost:11434",
        validation_alias="OLLAMA_HOST",
    )
    cors_origins: str = Field(
        default="http://localhost:3000",
        validation_alias="CORS_ORIGINS",
        description="逗号分隔的前端 Origin，例如 http://localhost:3000,https://app.example.com",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
