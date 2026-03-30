from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field as PydanticField
from sqlmodel import Column, DateTime, Field, SQLModel, Text

from .. import __version__


# --- App Metadata ---


class VersionOut(BaseModel):
    version: str

    @classmethod
    def from_metadata(cls):
        return cls(version=__version__)


# --- Queue Status Enum ---


class QueueStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


# --- Lakebase Queue Table ---


class QueuedRequest(SQLModel, table=True):
    __tablename__ = "queued_requests"

    id: int | None = Field(default=None, primary_key=True)
    request_id: str = Field(default_factory=lambda: str(uuid4()), index=True)
    user_email: str = Field(index=True)
    user_token: str = Field(sa_column=Column(Text))
    space_id: str
    space_name: str | None = None
    workspace_url: str = Field(index=True)
    question: str = Field(sa_column=Column(Text))
    conversation_id: str | None = None
    status: str = Field(default=QueueStatus.PENDING, index=True)
    priority: int = Field(default=0)
    attempt_count: int = Field(default=0)
    max_attempts: int = Field(default=5)
    error_message: str | None = Field(default=None, sa_column=Column(Text))
    response_data: str | None = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True)),
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True)),
    )
    started_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
    completed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )

    def set_response(self, data: dict) -> None:
        self.response_data = json.dumps(data)

    def get_response(self) -> dict | None:
        if self.response_data:
            return json.loads(self.response_data)
        return None


# --- Genie API Request/Response Models ---


class GenieSpaceInfo(BaseModel):
    space_id: str
    title: str
    description: str | None = None


class GenieSpaceListOut(BaseModel):
    spaces: list[GenieSpaceInfo]


class StartConversationRequest(BaseModel):
    question: str


class SendMessageRequest(BaseModel):
    question: str


class GenieMessageOut(BaseModel):
    message_id: str
    conversation_id: str
    space_id: str
    content: str
    status: str
    created_at: int | None = None
    attachments: list[dict] | None = None
    error: dict | None = None


class GenieConversationOut(BaseModel):
    conversation_id: str
    space_id: str
    title: str | None = None
    message: GenieMessageOut


class GenieQueryResultOut(BaseModel):
    columns: list[dict] | None = None
    rows: list[list] | None = None
    row_count: int | None = None
    truncated: bool = False


# --- Queue API Models ---


class QueueItemOut(BaseModel):
    request_id: str
    user_email: str
    space_id: str
    space_name: str | None = None
    question: str
    status: str
    attempt_count: int
    max_attempts: int
    error_message: str | None = None
    response_data: dict | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    wait_time_ms: int | None = None
    run_time_ms: int | None = None


class QueueListOut(BaseModel):
    items: list[QueueItemOut]
    total: int
    pending_count: int
    processing_count: int
    completed_count: int
    failed_count: int


class QueuedResponseOut(BaseModel):
    request_id: str
    status: str
    message: str
    position: int | None = None


class SimulateQueueRequest(BaseModel):
    space_id: str | None = None
    space_ids: list[str] | None = None
    num_requests: int = PydanticField(default=5, ge=1, le=50)
    questions: list[str] | None = None


class ClearQueueOut(BaseModel):
    deleted_count: int
