from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    project_type: str = Field(default="Carbon", max_length=80)


class ProjectOut(ProjectCreate):
    id: int
    owner_id: int
    created_at: datetime
    site_count: int = 0


class SiteCreate(BaseModel):
    project_id: int
    name: str = Field(min_length=2, max_length=160)
    status: str = Field(default="Active", max_length=40)
    geometry: dict[str, Any]


class SiteOut(BaseModel):
    id: int
    project_id: int
    name: str
    status: str
    area_hectares: float
    geometry: dict[str, Any] | None


class MetricOut(BaseModel):
    id: int
    site_id: int
    recorded_on: datetime
    carbon_tonnes: float
    biodiversity_index: float
