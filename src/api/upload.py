import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone

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

        # Generate a stable document identity and timestamp at
        # upload time. These get passed through to ingestion so
        # every chunk stored in Pinecone carries them, instead of
        # relying on the temp file's random name (e.g. tmpjslmfo7m.txt).
        document_id = f"doc_{uuid.uuid4().hex[:8]}"

        uploaded_at = (
            datetime.now(timezone.utc)
            .strftime("%Y-%m-%d %H:%M:%S")
        )

        logger.info(
            f"Uploaded file: {file.filename} "
            f"(document_id={document_id})"
        )

        result = document_service.ingest_document(
            temp_path,
            original_filename=file.filename,
            document_id=document_id,
            uploaded_at=uploaded_at
        )

        return {
            "filename": file.filename,
            "document_id": document_id,
            "uploaded_at": uploaded_at,
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