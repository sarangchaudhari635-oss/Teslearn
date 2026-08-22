from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from config import settings
from utils.db import Mindmap, get_session
from utils.llm import generate_mindmap_markdown
from utils.markmap import compile_markmap_html, save_mindmap

router = APIRouter(prefix="/mindmap", tags=["mindmap"])


class MindmapRequest(BaseModel):
    topic: str = Field(min_length=1)


class MindmapResponse(BaseModel):
    id: str
    topic: str
    html_url: str


@router.post("", response_model=MindmapResponse)
def create_mindmap(body: MindmapRequest, session: Session = Depends(get_session)):
    md = generate_mindmap_markdown(body.topic)
    html_doc = compile_markmap_html(md, title=body.topic)
    mindmap_id, path = save_mindmap(html_doc)

    row = Mindmap(id=mindmap_id, topic=body.topic, filename=path.name)
    session.add(row)
    session.commit()

    return MindmapResponse(
        id=mindmap_id,
        topic=body.topic,
        html_url=f"{settings.base_url}/mindmaps/{path.name}",
    )


@router.get("", response_model=list[MindmapResponse])
def list_mindmaps(session: Session = Depends(get_session)):
    rows = session.exec(select(Mindmap).order_by(Mindmap.created_at.desc())).all()
    return [
        MindmapResponse(
            id=r.id,
            topic=r.topic,
            html_url=f"{settings.base_url}/mindmaps/{r.filename}",
        )
        for r in rows
    ]


@router.get("/{mindmap_id}", response_model=MindmapResponse)
def get_mindmap(mindmap_id: str, session: Session = Depends(get_session)):
    row = session.get(Mindmap, mindmap_id)
    if not row:
        raise HTTPException(404, "mindmap not found")
    return MindmapResponse(
        id=row.id,
        topic=row.topic,
        html_url=f"{settings.base_url}/mindmaps/{row.filename}",
    )
