from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import validate

app = FastAPI(
    title="WoodCraft AI Service",
    description="Cabinet validation via Google Vertex AI / Gemini",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def verify_internal_key(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/redoc", "/openapi.json"):
        return await call_next(request)
    key = request.headers.get("x-internal-api-key")
    if key != settings.internal_api_key:
        return JSONResponse({"error": "Forbidden"}, status_code=403)
    return await call_next(request)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "ai-service"}


app.include_router(validate.router, prefix="/validate", tags=["validation"])
