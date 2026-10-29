"""Application configuration, read from environment variables / .env."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BlueChain API"
    api_version: str = "1.0.0"
    environment: str = "development"

    # --- database -------------------------------------------------------
    database_url: str = "sqlite:///./bluechain.db"

    # --- auth -----------------------------------------------------------
    secret_key: str = "dev-secret-change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # --- storage --------------------------------------------------------
    storage_dir: str = "./storage"
    max_upload_mb: int = 200

    # --- cors -----------------------------------------------------------
    cors_origins: str = ("http://localhost:5173,http://localhost:4173,http://localhost:3000,"
                        "http://127.0.0.1:5173,http://localhost:5500,http://127.0.0.1:5500")

    # --- carbon model defaults (project-specific, see paper) ------------
    agb_coefficient: float = 10.5
    carbon_fraction: float = 0.47
    ndvi_threshold: float = 0.4
    gapfill_multiplier: float = 15.0
    nominal_cell_ha: float = 0.01
    sensitivity_coefficients: str = "8.5,10.5,12.5"
    sensitivity_fractions: str = "0.45,0.47,0.49"

    # --- chain ----------------------------------------------------------
    chain_id: int = 31337
    rpc_url: str = "http://127.0.0.1:8545"
    contract_address: str = ""
    contract_name: str = "CarbonCreditNFT"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
