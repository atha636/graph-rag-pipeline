import os
import shutil
import tempfile

from fastapi import APIRouter, File, UploadFile, HTTPException
from loguru import logger

from src.services.document_service import DocumentService


router = APIRouter(
    prefix="/api/v1",
    tags=["Document Upload"]
)


document_service = None


def initialize_document_service(service: DocumentService):
    """
    Initialize document service.
    """

    global document_service

    document_service = service

    logger.info(
        "Upload DocumentService initialized successfully"
    )


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...)
):
    """
    Upload and ingest document.
    """

    if not document_service:
        raise HTTPException(
            status_code=500,
            detail="Document service not initialized"
        )

    extension = os.path.splitext(
        file.filename
    )[1].lower()

    allowed_extensions = [
        ".pdf",
        ".docx",
        ".txt"
    ]

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, DOCX and TXT files are supported"
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:

            shutil.copyfileobj(
                file.file,
                temp_file
            )

            temp_path = temp_file.name

        logger.info(
            f"Uploaded file: {file.filename}"
        )

        result = document_service.ingest_document(
            temp_path
        )

        return {
            "filename": file.filename,
            "result": result
        }

    except Exception as error:

        logger.exception(
            "Document upload failed"
        )

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)