import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from config import settings
from utils.comic import build_comic
from utils.db import Comic, get_session

router = APIRouter(prefix="/comic", tags=["comic"])


class ComicRequest(BaseModel):
    topic: str = Field(min_length=1)


class ComicResponse(BaseModel):
    id: str
    topic: str
    title: str
    image_urls: list[str]


def _urls_from_row(row: Comic) -> list[str]:
    if row.filename.startswith("["):
        rels = json.loads(row.filename)
        return [f"{settings.base_url}/comics/{row.id}/{name}" for name in rels]
    return [
        f"{settings.base_url}/comics/{row.id}/p1_1.png",
        f"{settings.base_url}/comics/{row.id}/p1_2.png",
        f"{settings.base_url}/comics/{row.id}/p2_1.png",
        f"{settings.base_url}/comics/{row.id}/p2_2.png",
    ]


@router.post("", response_model=ComicResponse)
def create_comic(body: ComicRequest, session: Session = Depends(get_session)):
    comic_id, meta = build_comic(body.topic)
    names = [p["filename"] for p in meta["panels"]]
    row = Comic(
        id=comic_id,
        topic=body.topic,
        title=meta["title"],
        filename=json.dumps(names),
    )
    session.add(row)
    session.commit()
    return ComicResponse(
        id=comic_id,
        topic=body.topic,
        title=meta["title"],
        image_urls=meta["image_urls"],
    )


@router.get("", response_model=list[ComicResponse])
def list_comics(session: Session = Depends(get_session)):
    rows = session.exec(select(Comic).order_by(Comic.created_at.desc())).all()
    return [
        ComicResponse(
            id=r.id,
            topic=r.topic,
            title=r.title,
            image_urls=_urls_from_row(r),
        )
        for r in rows
    ]


@router.get("/{comic_id}", response_model=ComicResponse)
def get_comic(comic_id: str, session: Session = Depends(get_session)):
    row = session.get(Comic, comic_id)
    if not row:
        raise HTTPException(404, "comic not found")
    return ComicResponse(
        id=row.id,
        topic=row.topic,
        title=row.title,
        image_urls=_urls_from_row(row),
    )
