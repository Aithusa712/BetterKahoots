from __future__ import annotations

from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, mock

from azure.core.exceptions import HttpResponseError

from . import storage


class _FakeBlobClient:
    def __init__(self, blob_name: str):
        self.blob_name = blob_name
        self.uploaded = []
        self.url = f"https://example.com/{blob_name}"

    def upload_blob(self, content: bytes, overwrite: bool = True, **kwargs):
        self.uploaded.append((content, overwrite, kwargs))


class _FakeContainerClient:
    def __init__(self, *, creation_exception: Exception | None = None, public_access: str | None = "blob"):
        self._creation_exception = creation_exception
        self._public_access = public_access
        self.create_calls: list[str | None] = []
        self._latest_blob_client: _FakeBlobClient | None = None

    def create_container(self, public_access: str | None = None):
        self.create_calls.append(public_access)
        if self._creation_exception and public_access:
            raise self._creation_exception
        if public_access:
            self._public_access = public_access

    def get_container_properties(self):
        return SimpleNamespace(public_access=self._public_access)

    def get_blob_client(self, blob_name: str) -> _FakeBlobClient:
        self._latest_blob_client = _FakeBlobClient(blob_name)
        return self._latest_blob_client


class _FakeBlobService:
    def __init__(self, container_client: _FakeContainerClient):
        self._container_client = container_client
        self.account_name = "account-name"
        self.credential = object()

    def get_container_client(self, container_name: str) -> _FakeContainerClient:
        self.container_name = container_name
        return self._container_client


class UploadQuestionImageTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:  # noqa: D401 - standard unittest hook
        storage._blob_service_client = None
        storage._container_initialised = False
        storage._container_is_private = None

    async def test_upload_public_container(self):
        container = _FakeContainerClient()
        service = _FakeBlobService(container)

        with mock.patch("backend.app.storage._get_blob_service", return_value=service), mock.patch(
            "backend.app.storage.generate_blob_sas"
        ) as mock_generate_sas:
            url = await storage.upload_question_image(
                "session",
                "question",
                "image.png",
                b"data",
                "image/png",
            )

        self.assertEqual(url, container._latest_blob_client.url)
        self.assertEqual(container.create_calls, ["blob"])
        mock_generate_sas.assert_not_called()

    async def test_upload_private_container_generates_sas(self):
        error = HttpResponseError(message="forbidden")
        error.error_code = "PublicAccessNotPermitted"
        container = _FakeContainerClient(creation_exception=error, public_access=None)
        service = _FakeBlobService(container)

        with mock.patch("backend.app.storage._get_blob_service", return_value=service), mock.patch(
            "backend.app.storage.generate_blob_sas", return_value="sig"
        ) as mock_generate_sas:
            url = await storage.upload_question_image(
                "session",
                "question",
                "image.png",
                b"data",
                "image/png",
            )

        self.assertTrue(url.endswith("?sig"))
        self.assertEqual(container.create_calls, ["blob", None])
        kwargs = mock_generate_sas.call_args.kwargs
        self.assertEqual(kwargs["account_name"], service.account_name)
        self.assertEqual(kwargs["container_name"], storage.settings.AZURE_STORAGE_CONTAINER)
        self.assertEqual(kwargs["blob_name"], container._latest_blob_client.blob_name)
        self.assertIs(kwargs["credential"], service.credential)
        self.assertEqual(str(kwargs["permission"]), str(storage.BlobSasPermissions(read=True)))
        self.assertIn("expiry", kwargs)

