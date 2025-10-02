from __future__ import annotations

import asyncio
import mimetypes
import os
import uuid
from datetime import datetime, timedelta

from azure.core.credentials import TokenCredential

from azure.core.exceptions import HttpResponseError, ResourceExistsError
from azure.storage.blob import (
    BlobSasPermissions,
    BlobServiceClient,
    ContentSettings,
    generate_blob_sas,
)

from .db import settings

_blob_service_client: BlobServiceClient | None = None
_container_initialised = False
_container_is_private: bool | None = None


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

    global _container_initialised, _container_is_private
    if not _container_initialised:
        try:
            await asyncio.to_thread(container_client.create_container, public_access="blob")
        except ResourceExistsError:
            pass
        except HttpResponseError as exc:
            error_code = getattr(exc, "error_code", None) or getattr(
                getattr(exc, "error", None), "code", None
            )
            if error_code == "PublicAccessNotPermitted":
                try:
                    await asyncio.to_thread(container_client.create_container)
                except ResourceExistsError:
                    pass
                _container_is_private = True
            else:
                raise
        else:
            _container_is_private = False

        if _container_is_private is None:
            properties = await asyncio.to_thread(container_client.get_container_properties)
            public_access = getattr(properties, "public_access", None)
            _container_is_private = public_access not in {"blob", "container"}
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

    if _container_is_private:
        sas_url = await _build_private_blob_url(service, container_name, blob_name, blob_client.url)
        return sas_url


    return blob_client.url


async def _build_private_blob_url(
    service: BlobServiceClient, container_name: str, blob_name: str, base_url: str
) -> str:
    now = datetime.utcnow()
    expiry = now + timedelta(minutes=15)
    permissions = BlobSasPermissions(read=True)

    credential = getattr(service, "credential", None)

    if isinstance(credential, TokenCredential):
        delegation_key = await asyncio.to_thread(
            service.get_user_delegation_key,
            now,
            expiry,
        )
        sas_token = generate_blob_sas(
            account_name=service.account_name,
            container_name=container_name,
            blob_name=blob_name,
            user_delegation_key=delegation_key,
            permission=permissions,
            expiry=expiry,
        )
    elif credential is not None:
        sas_token = generate_blob_sas(
            account_name=service.account_name,
            container_name=container_name,
            blob_name=blob_name,
            credential=credential,
            permission=permissions,
            expiry=expiry,
        )
    else:
        raise RuntimeError("Azure Blob Storage credential is required for SAS generation")

    separator = "&" if "?" in base_url else "?"
    return f"{base_url}{separator}{sas_token}"
