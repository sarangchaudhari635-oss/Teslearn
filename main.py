from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CLIPS_DIR, COMICS_DIR, LABS_DIR, MINDMAPS_DIR, NOTES_DIR, PODCASTS_DIR
from routes.client import router as client_router
from routes.comic import router as comic_router
from routes.lab import router as lab_router
from routes.mindmap import router as mindmap_router
from routes.notes import router as notes_router
from routes.podcast import router as podcast_router
from routes.screen import router as screen_router
from routes.video import router as video_router
from routes.viva import router as viva_router
from utils.db import init_db

app = FastAPI(title="TesLearn Motion MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
app.include_router(video_router, prefix="/api")
app.include_router(podcast_router, prefix="/api")
app.include_router(mindmap_router, prefix="/api")
app.include_router(comic_router, prefix="/api")
app.include_router(notes_router, prefix="/api")
app.include_router(lab_router, prefix="/api")
app.include_router(screen_router, prefix="/api")
app.include_router(viva_router, prefix="/api")
app.include_router(client_router, prefix="/api")
app.mount("/clips", StaticFiles(directory=CLIPS_DIR, html=True), name="clips")
app.mount("/podcasts", StaticFiles(directory=PODCASTS_DIR), name="podcasts")
app.mount("/mindmaps", StaticFiles(directory=MINDMAPS_DIR, html=True), name="mindmaps")
app.mount("/comics", StaticFiles(directory=COMICS_DIR), name="comics")
app.mount("/notes-assets", StaticFiles(directory=NOTES_DIR), name="notes-assets")
app.mount("/labs", StaticFiles(directory=LABS_DIR, html=True), name="labs")


@app.get("/health")
def health():
    return {"ok": True}
