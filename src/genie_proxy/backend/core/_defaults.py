from __future__ import annotations
from typing import Annotated, AsyncGenerator, TypeAlias
from contextlib import asynccontextmanager

from databricks.sdk import WorkspaceClient
from databricks.sdk.config import Config
from fastapi import Depends, FastAPI, Request, Header

from ._base import LifespanDependency
from ._config import AppConfig, logger
from ._headers import HeadersDependency

from pydantic import BaseModel, SecretStr
from uuid import UUID


class _ConfigDependency(LifespanDependency):
    @asynccontextmanager
    async def lifespan(self, app: FastAPI) -> AsyncGenerator[None, None]:
        app.state.config = AppConfig()
        logger.info(f"Starting app with configuration:\n{app.state.config}")
        yield

    @staticmethod
    def __call__(request: Request) -> AppConfig:
        return request.app.state.config


class _WorkspaceClientDependency(LifespanDependency):
    @asynccontextmanager
    async def lifespan(self, app: FastAPI) -> AsyncGenerator[None, None]:
        app.state.workspace_client = WorkspaceClient()
        yield

    @staticmethod
    def __call__(request: Request) -> WorkspaceClient:
        return request.app.state.workspace_client

class DatabricksAppsHeaders(BaseModel):
    """Structured model for Databricks Apps HTTP headers.

    See: https://docs.databricks.com/aws/en/dev-tools/databricks-apps/http-headers
    """

    host: str | None
    user_name: str | None
    user_id: str | None
    user_email: str | None
    request_id: UUID | None
    token: SecretStr | None


def get_databricks_headers(
    host: Annotated[str | None, Header(alias="X-Forwarded-Host")] = None,
    user_name: Annotated[
        str | None, Header(alias="X-Forwarded-Preferred-Username")
    ] = None,
    user_id: Annotated[str | None, Header(alias="X-Forwarded-User")] = None,
    user_email: Annotated[str | None, Header(alias="X-Forwarded-Email")] = None,
    request_id: Annotated[str | None, Header(alias="X-Request-Id")] = None,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> DatabricksAppsHeaders:
    """Extract Databricks Apps headers from the incoming request."""
    return DatabricksAppsHeaders(
        host=host,
        user_name=user_name,
        user_id=user_id,
        user_email=user_email,
        request_id=UUID(request_id) if request_id else None,
        token=SecretStr(token) if token else None,
    )


def _get_user_ws(
    headers: Annotated[DatabricksAppsHeaders, Depends(get_databricks_headers)],
    request: Request,
) -> WorkspaceClient:
    """Returns a Databricks WorkspaceClient authenticated on behalf of the current user.

    Uses an explicit Config to isolate from environment variables — the platform
    injects DATABRICKS_CLIENT_ID/SECRET for the SP, and without this the SDK
    would use SP OAuth M2M instead of the user's OBO token.
    """
    if not headers.token:
        raise ValueError(
            "OBO token is not provided in the header X-Forwarded-Access-Token"
        )

    app_ws: WorkspaceClient = request.app.state.workspace_client
    cfg = Config(
        host=app_ws.config.host,
        token=headers.token.get_secret_value(),
        auth_type="pat",
    )
    return WorkspaceClient(config=cfg)

ConfigDependency: TypeAlias = Annotated[AppConfig, _ConfigDependency.depends()]

ClientDependency: TypeAlias = Annotated[
    WorkspaceClient, _WorkspaceClientDependency.depends()
]

UserWorkspaceClientDependency: TypeAlias = Annotated[
    WorkspaceClient, Depends(_get_user_ws)
]
