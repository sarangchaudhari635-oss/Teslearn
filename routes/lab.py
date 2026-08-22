from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from config import settings
from utils.db import Lab, get_session
from utils.llm import generate_virtual_lab_html
from utils.storage import save_lab

router = APIRouter(prefix="/lab", tags=["lab"])


class LabRequest(BaseModel):
    topic: str = Field(min_length=1)


class LabResponse(BaseModel):
    id: str
    topic: str
    html_url: str


@router.post("", response_model=LabResponse)
def create_lab(body: LabRequest, session: Session = Depends(get_session)):
    html = generate_virtual_lab_html(body.topic)
    lab_id, path = save_lab(html)
    session.add(Lab(id=lab_id, topic=body.topic, filename=path.name))
    session.commit()
    return LabResponse(
        id=lab_id,
        topic=body.topic,
        html_url=f"{settings.base_url}/labs/{path.name}",
    )


@router.get("", response_model=list[LabResponse])
def list_labs(session: Session = Depends(get_session)):
    rows = session.exec(select(Lab).order_by(Lab.created_at.desc())).all()
    return [
        LabResponse(
            id=r.id,
            topic=r.topic,
            html_url=f"{settings.base_url}/labs/{r.filename}",
        )
        for r in rows
    ]


@router.get("/{lab_id}", response_model=LabResponse)
def get_lab(lab_id: str, session: Session = Depends(get_session)):
    row = session.get(Lab, lab_id)
    if not row:
        raise HTTPException(404, "lab not found")
    return LabResponse(
        id=row.id,
        topic=row.topic,
        html_url=f"{settings.base_url}/labs/{row.filename}",
    )
