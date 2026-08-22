from fastapi import APIRouter

from utils.viva import VivaService

router = APIRouter(prefix="/viva", tags=["viva"])


@router.post("/start")
async def start_viva():
    return await VivaService().start()


@router.post("/stop")
async def stop_viva():
    return await VivaService().stop()
