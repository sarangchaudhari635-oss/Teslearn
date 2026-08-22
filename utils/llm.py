import base64
import json
import os
import re
import urllib.request
from pathlib import Path

from litellm import completion, image_generation

from config import settings
from prompts import (
    build_chat_guardrail_prompt,
    build_chat_system_prompt,
    build_comic_image_prompt_maker,
    build_comic_script_prompt,
    build_guardrail_prompt,
    build_mindmap_prompt,
    build_notes_prompt,
    build_podcast_prompt,
    build_prompt,
    build_virtual_lab_prompt,
)


def _api_key() -> str | None:
    key = settings.gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if key:
        os.environ["GEMINI_API_KEY"] = key
        os.environ["GOOGLE_API_KEY"] = key
    return key or None


def _studio_model(name: str) -> str:
    """Force Google AI Studio (API key), never Vertex ADC."""
    name = (name or "").strip()
    if name.startswith(("gemini/", "openai/", "anthropic/", "replicate/")):
        return name
    return f"gemini/{name}"


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:html|json|markdown|md)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _chat(prompt: str, temperature: float = 0.4, *, json_mode: bool = False):
    kwargs = {
        "model": _studio_model(settings.llm_model),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "api_key": _api_key(),
        "custom_llm_provider": "gemini",
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    return completion(**kwargs)


def _chat_json(prompt: str, temperature: float = 0.4) -> dict:
    resp = _chat(prompt, temperature=temperature, json_mode=True)
    return json.loads(_strip_fences(resp.choices[0].message.content or ""))


def check_prompt_guardrail(prompt: str) -> dict:
    data = _chat_json(build_guardrail_prompt(prompt), temperature=0.1)
    allowed = bool(data.get("allowed", False))
    status = "success" if allowed else "error"
    if data.get("status") in ("success", "error"):
        status = data["status"]
    return {
        "status": status,
        "allowed": allowed,
        "reason": str(data.get("reason", "No reason provided")),
    }


def check_chat_message_guardrail(message: str) -> dict:
    """Lighter guardrail for in-session chat (allows hey, thanks, follow-ups)."""
    data = _chat_json(build_chat_guardrail_prompt(message), temperature=0.1)
    allowed = bool(data.get("allowed", False))
    status = "success" if allowed else "error"
    if data.get("status") in ("success", "error"):
        status = data["status"]
    return {
        "status": status,
        "allowed": allowed,
        "reason": str(data.get("reason", "No reason provided")),
    }


def chat_reply(topic: str, messages: list[dict]) -> str:
    """Multi-turn chat with system prompt scoped to topic."""
    system = build_chat_system_prompt(topic)
    llm_messages = [{"role": "system", "content": system}]
    for msg in messages:
        role = (msg.get("role") or "user").strip().lower()
        content = (msg.get("content") or "").strip()
        if not content or role not in ("user", "assistant"):
            continue
        llm_messages.append({"role": role, "content": content})
    if not any(m["role"] == "user" for m in llm_messages):
        raise ValueError("messages must include at least one user turn")

    resp = completion(
        model=_studio_model(settings.llm_model),
        messages=llm_messages,
        temperature=0.45,
        api_key=_api_key(),
        custom_llm_provider="gemini",
    )
    reply = (resp.choices[0].message.content or "").strip()
    if not reply:
        raise ValueError("empty chat reply from model")
    return reply


def generate_html(topic: str, duration: int = 12) -> str:
    resp = _chat(build_prompt(topic, duration), temperature=0.4)
    html = _strip_fences(resp.choices[0].message.content or "")
    if "<!DOCTYPE html>" not in html and "<html" not in html.lower():
        raise ValueError("LLM did not return a full HTML document")
    return html


def generate_virtual_lab_html(topic: str) -> str:
    resp = _chat(build_virtual_lab_prompt(topic), temperature=0.45)
    html = _strip_fences(resp.choices[0].message.content or "")
    if "<!DOCTYPE html>" not in html and "<html" not in html.lower():
        raise ValueError("LLM did not return a full HTML document")
    return html


def generate_podcast_script(topic: str) -> list[dict]:
    data = _chat_json(build_podcast_prompt(topic), temperature=0.5)
    dialogues = data.get("dialogues") or data
    if not isinstance(dialogues, list) or len(dialogues) != 3:
        raise ValueError("podcast script must have exactly 3 dialogues")
    for d in dialogues:
        if "speaker" not in d or "text" not in d:
            raise ValueError("each dialogue needs speaker + text")
        d["speaker"] = d["speaker"].lower().strip()
        if d["speaker"] not in ("male", "female"):
            raise ValueError("speaker must be male or female")
    return dialogues


def generate_mindmap_markdown(topic: str) -> str:
    resp = _chat(build_mindmap_prompt(topic), temperature=0.4)
    md = _strip_fences(resp.choices[0].message.content or "")
    if not md.lstrip().startswith("---"):
        md = f"---\ntitle: {topic}\nmarkmap:\n  colorFreezeLevel: 2\n---\n\n## {topic}\n\n{md}"
    return md


def generate_comic_script(topic: str) -> dict:
    data = _chat_json(build_comic_script_prompt(topic), temperature=0.55)
    pages = data.get("pages") or []
    if len(pages) != 2:
        raise ValueError("comic must have exactly 2 pages")
    for page in pages:
        panels = page.get("panels") or []
        if len(panels) != 2:
            raise ValueError("each comic page must have exactly 2 panels")
    return data


def make_comic_image_prompts(script: dict) -> dict:
    """Prompt-maker layer: turn script into final image prompts + overlays."""
    data = _chat_json(
        build_comic_image_prompt_maker(json.dumps(script, ensure_ascii=False)),
        temperature=0.3,
    )
    panels = data.get("panels") or []
    if len(panels) != 4:
        raise ValueError("prompt maker must return exactly 4 panels")
    for p in panels:
        if not p.get("image_prompt"):
            raise ValueError("each panel needs image_prompt")
    return data


def generate_notes_markdown(topic: str, summaries: str = "") -> str:
    resp = _chat(build_notes_prompt(topic, summaries), temperature=0.35)
    md = _strip_fences(resp.choices[0].message.content or "")
    if not md.lstrip().startswith("#"):
        raise ValueError("notes model did not return markdown starting with #")
    return md


def _save_data_url(data_url: str, dest: Path) -> Path:
    if "," not in data_url:
        dest.write_bytes(base64.b64decode(data_url))
        return dest
    header, b64 = data_url.split(",", 1)
    dest.write_bytes(base64.b64decode(b64))
    return dest


def generate_panel_image(prompt: str, dest: Path) -> Path:
    """Gemini native image models use chat completions + modalities."""
    model = _studio_model(settings.image_model)
    key = _api_key()

    if "gemini" in model:
        resp = completion(
            model=model,
            custom_llm_provider="gemini",
            messages=[
                {
                    "role": "user",
                    "content": f"Generate exactly one image. Follow the prompt closely.\n\n{prompt}",
                }
            ],
            modalities=["image", "text"],
            api_key=key,
        )
        msg = resp.choices[0].message
        images = getattr(msg, "images", None) or []
        if images:
            first = images[0]
            if isinstance(first, dict):
                url = first.get("image_url", {}).get("url") or first.get("url")
            else:
                url = getattr(getattr(first, "image_url", None), "url", None)
            if url:
                return _save_data_url(url, dest)

        content = msg.content or ""
        if isinstance(content, str) and "base64" in content:
            return _save_data_url(content, dest)
        raise ValueError("Gemini image model returned no image")

    resp = image_generation(
        model=model,
        prompt=prompt,
        size=settings.image_size,
        n=1,
        api_key=key,
        response_format="b64_json",
    )
    item = resp.data[0]
    b64 = getattr(item, "b64_json", None) or (item.get("b64_json") if isinstance(item, dict) else None)
    if b64:
        dest.write_bytes(base64.b64decode(b64))
        return dest

    url = getattr(item, "url", None) or (item.get("url") if isinstance(item, dict) else None)
    if not url:
        raise ValueError("image model returned no image data")
    with urllib.request.urlopen(url) as r:
        dest.write_bytes(r.read())
    return dest
