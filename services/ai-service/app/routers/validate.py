from fastapi import APIRouter, HTTPException
from app.models.validation import ValidationRequest, ValidationResponse, ValidationIssue
from app.services.gemini import validate_cabinet
from app.core.config import settings

router = APIRouter()


@router.post("/cabinet", response_model=ValidationResponse)
def validate_cabinet_endpoint(req: ValidationRequest) -> ValidationResponse:
    """
    Run AI validation on a single cabinet.
    Returns a structured report with errors and warnings.
    """
    try:
        result = validate_cabinet(
            req.cabinet,
            room_width=req.room_width,
            room_height=req.room_height,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI validation failed: {exc}")

    errors = [ValidationIssue(**e) for e in result.get("errors", [])]
    warnings = [ValidationIssue(**w) for w in result.get("warnings", [])]
    status = result.get("status", "fail")

    return ValidationResponse(
        cabinet_id=req.cabinet.cabinet_id,
        status=status,
        errors=errors,
        warnings=warnings,
        ai_model=settings.gemini_model,
        raw_response=result,
    )
