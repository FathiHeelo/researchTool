from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DQ-LLM Evaluator"
    database_url: str = "sqlite:///" + (Path(__file__).resolve().parents[1] / "projects.db").as_posix()
    cors_origins: list[str] = [ "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5179"]
    api_url: str = "https://researchtool-u9h2.onrender.com"
   

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
