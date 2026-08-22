from fastapi import APIRouter
from pydantic import BaseModel, Field

from utils.llm import check_prompt_guardrail

router = APIRouter(prefix="/guardrail", tags=["guardrail"])


class GuardrailRequest(BaseModel):
    prompt: str = Field(min_length=1)


class GuardrailResponse(BaseModel):
    status: str  # success | error
    allowed: bool
    reason: str


@router.post("/check", response_model=GuardrailResponse)
def check_guardrail(body: GuardrailRequest):
    return check_prompt_guardrail(body.prompt)
