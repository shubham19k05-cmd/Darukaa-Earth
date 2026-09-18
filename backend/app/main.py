from datetime import datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from geoalchemy2 import Geography
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from .auth import create_token, current_user, hash_password, verify_password
from .db import Base, engine, get_db, settings
from .models import Project, Site, SiteMetric, User
from .schemas import (
    LoginIn, MetricOut, ProjectCreate, ProjectOut, RegisterIn, SiteCreate,
    SiteOut, TokenOut,
)

app = FastAPI(title="Darukaa.Earth API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_site(site: Site) -> SiteOut:
    return SiteOut(
        id=site.id,
        project_id=site.project_id,
        name=site.name,
        status=site.status,
        area_hectares=site.area_hectares,
        geometry=mapping(to_shape(site.geometry)) if site.geometry else None,
    )


@app.on_event("startup")
def startup() -> None:
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "darukaa-earth-api"}


@app.post("/api/auth/register", response_model=TokenOut)
def register(data: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    email = data.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, "Email already registered")
    user_count = db.query(User).count()
    role = "ADMIN" if user_count == 0 else "USER"
    user = User(full_name=data.full_name.strip(), email=email, password_hash=hash_password(data.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_token(user.id))


@app.post("/api/auth/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.query(User).filter(User.email == data.email.lower()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")
    return TokenOut(access_token=create_token(user.id))


@app.get("/api/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role}


@app.get("/api/projects", response_model=list[ProjectOut])
def projects(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[ProjectOut]:
    rows = (
        db.query(Project, func.count(Site.id))
        .outerjoin(Site)
        .filter(Project.owner_id == user.id)
        .group_by(Project.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    return [
        ProjectOut(
            id=project.id,
            name=project.name,
            description=project.description,
            project_type=project.project_type,
            owner_id=project.owner_id,
            created_at=project.created_at,
            site_count=count,
        )
        for project, count in rows
    ]


@app.post("/api/projects", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> ProjectOut:
    project = Project(**data.model_dump(), owner_id=user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut(id=project.id, name=project.name, description=project.description, project_type=project.project_type, owner_id=project.owner_id, created_at=project.created_at, site_count=0)


@app.get("/api/sites", response_model=list[SiteOut])
def sites(db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[SiteOut]:
    rows = db.query(Site).join(Project).filter(Project.owner_id == user.id).order_by(Site.created_at.desc()).all()
    return [serialize_site(site) for site in rows]


@app.post("/api/sites", response_model=SiteOut)
def create_site(data: SiteCreate, db: Session = Depends(get_db), user: User = Depends(current_user)) -> SiteOut:
    project = db.query(Project).filter(Project.id == data.project_id, Project.owner_id == user.id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if data.geometry.get("type") != "Polygon":
        raise HTTPException(400, "Geometry must be a Polygon")
    try:
        geom = shape(data.geometry)
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid GeoJSON geometry")
    if geom.is_empty or not geom.is_valid:
        raise HTTPException(400, "Polygon is empty or invalid")
    if not geom.exterior.is_ring:
        raise HTTPException(400, "Polygon ring must be closed")

    site = Site(
        project_id=project.id,
        name=data.name.strip(),
        status=data.status,
        geometry=from_shape(geom, srid=4326),
        area_hectares=0,
    )
    db.add(site)
    db.flush()
    # ST_Area(geography) returns square metres and is suitable for lon/lat polygons.
    area_m2 = db.execute(
        text("SELECT ST_Area(ST_SetSRID(ST_GeomFromText(:wkt), 4326)::geography)"),
        {"wkt": geom.wkt},
    ).scalar_one()
    site.area_hectares = float(area_m2) / 10000.0

    now = datetime.utcnow()
    for index in range(6):
        db.add(
            SiteMetric(
                site_id=site.id,
                recorded_on=now - timedelta(days=(5 - index) * 30),
                carbon_tonnes=100 + index * 12,
                biodiversity_index=0.55 + index * 0.04,
            )
        )
    db.commit()
    db.refresh(site)
    return serialize_site(site)


@app.get("/api/sites/{site_id}/analytics", response_model=list[MetricOut])
def analytics(site_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)) -> list[MetricOut]:
    site = db.query(Site).join(Project).filter(Site.id == site_id, Project.owner_id == user.id).first()
    if not site:
        raise HTTPException(404, "Site not found")
    return db.query(SiteMetric).filter(SiteMetric.site_id == site_id).order_by(SiteMetric.recorded_on).all()


@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(current_user)) -> dict:
    project_count = db.query(func.count(Project.id)).filter(Project.owner_id == user.id).scalar() or 0
    site_count = (
        db.query(func.count(Site.id)).join(Project).filter(Project.owner_id == user.id).scalar() or 0
    )
    active_count = (
        db.query(func.count(Site.id)).join(Project).filter(Project.owner_id == user.id, Site.status == "Active").scalar() or 0
    )
    carbon = (
        db.query(func.coalesce(func.max(SiteMetric.carbon_tonnes), 0))
        .join(Site)
        .join(Project)
        .filter(Project.owner_id == user.id)
        .scalar()
        or 0
    )
    area = db.query(func.coalesce(func.sum(Site.area_hectares), 0)).join(Project).filter(Project.owner_id == user.id).scalar() or 0
    return {
        "projects": project_count,
        "sites": site_count,
        "active_sites": active_count,
        "area_hectares": round(float(area), 2),
        "latest_carbon_tonnes": round(float(carbon), 2),
    }
