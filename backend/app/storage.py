from __future__ import annotations

import asyncio
import mimetypes
import os
import uuid

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import BlobServiceClient, ContentSettings

from .db import settings

_blob_service_client: BlobServiceClient | None = None
_container_initialised = False


def _get_blob_service() -> BlobServiceClient:
    global _blob_service_client
    if _blob_service_client is None:
        if not settings.AZURE_STORAGE_CONNECTION_STRING:
            raise RuntimeError("Azure Blob Storage is not configured")
        _blob_service_client = BlobServiceClient.from_connection_string(
            settings.AZURE_STORAGE_CONNECTION_STRING
        )
    return _blob_service_client


async def upload_question_image(
    session_id: str,
    question_id: str,
    filename: str,
    content: bytes,
    content_type: str | None,
) -> str:
    if not content:
        raise ValueError("Uploaded file was empty")

    service = _get_blob_service()
    container_name = settings.AZURE_STORAGE_CONTAINER
    container_client = service.get_container_client(container_name)

    global _container_initialised
    if not _container_initialised:
        try:
            await asyncio.to_thread(container_client.create_container, public_access="blob")
        except ResourceExistsError:
            pass
        _container_initialised = True

    guessed_type = content_type or mimetypes.guess_type(filename)[0]
    extension = os.path.splitext(filename)[1]
    if not extension and guessed_type:
        extension = mimetypes.guess_extension(guessed_type) or ""

    blob_name = f"{session_id}/{question_id}-{uuid.uuid4().hex}{extension}".strip("/")
    blob_client = container_client.get_blob_client(blob_name)

    settings_kwargs = {}
    if guessed_type:
        settings_kwargs["content_settings"] = ContentSettings(content_type=guessed_type)

    await asyncio.to_thread(blob_client.upload_blob, content, overwrite=True, **settings_kwargs)
    return blob_client.url
