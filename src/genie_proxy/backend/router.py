from __future__ import annotations

import asyncio
from functools import partial

from databricks.sdk import WorkspaceClient
from fastapi import HTTPException, Request

from .core import Dependencies, create_router
from .core._config import AppConfig, logger
from .core._headers import DatabricksAppsHeaders
from .models import (
    ClearQueueOut,
    GenieConversationOut,
    GenieMessageOut,
    GenieQueryResultOut,
    GenieSpaceInfo,
    GenieSpaceListOut,
    QueuedResponseOut,
    QueueItemOut,
    QueueListOut,
    SendMessageRequest,
    SimulateQueueRequest,
    StartConversationRequest,
    VersionOut,
)
from .queue_service import QueueService

router = create_router()


# --- Helpers ---


def _get_queue_service(request: Request) -> QueueService:
    return request.app.state.queue_service


def _get_workspace_url(config: AppConfig, headers: DatabricksAppsHeaders) -> str:
    url = config.workspace_url_resolved
    if not url and headers.host:
        url = f"https://{headers.host}"
    if not url:
        raise HTTPException(
            status_code=500,
            detail="Workspace URL not configured. Set GENIE_PROXY_WORKSPACE_URL or DATABRICKS_HOST.",
        )
    return url


async def _run_sync(fn, *args, **kwargs):
    """Run a blocking SDK call in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, partial(fn, *args, **kwargs))


def _compute_timing(item) -> tuple[int | None, int | None]:
    wait_ms = None
    run_ms = None
    if item.started_at and item.created_at:
        wait_ms = int((item.started_at - item.created_at).total_seconds() * 1000)
    if item.completed_at and item.started_at:
        run_ms = int((item.completed_at - item.started_at).total_seconds() * 1000)
    return wait_ms, run_ms


def _to_queue_item_out(item) -> QueueItemOut:
    wait_ms, run_ms = _compute_timing(item)
    return QueueItemOut(
        request_id=item.request_id,
        user_email=item.user_email,
        space_id=item.space_id,
        space_name=item.space_name,
        question=item.question,
        status=item.status,
        attempt_count=item.attempt_count,
        max_attempts=item.max_attempts,
        error_message=item.error_message,
        response_data=item.get_response(),
        created_at=item.created_at,
        updated_at=item.updated_at,
        started_at=item.started_at,
        completed_at=item.completed_at,
        wait_time_ms=wait_ms,
        run_time_ms=run_ms,
    )


def _msg_to_dict(msg) -> dict:
    """Convert a SDK GenieMessage to a serializable dict."""
    attachments = []
    if msg.attachments:
        for att in msg.attachments:
            attachments.append(att.as_dict() if hasattr(att, "as_dict") else {})
    return {
        "message_id": msg.id or "",
        "conversation_id": msg.conversation_id or "",
        "content": msg.content or "",
        "status": msg.status.value if msg.status else "COMPLETED",
        "attachments": attachments,
    }


# --- Version ---


@router.get("/version", response_model=VersionOut, operation_id="version")
async def version():
    return VersionOut.from_metadata()


# --- Current User ---


@router.get("/current-user", operation_id="currentUser")
def me(user_ws: Dependencies.UserClient):
    return user_ws.current_user.me()


# --- Genie Space Listing ---


@router.get("/genie/spaces", response_model=GenieSpaceListOut, operation_id="listGenieSpaces")
async def list_genie_spaces(
    user_ws: Dependencies.UserClient,
    config: Dependencies.Config,
):
    """List Genie spaces visible to the current user."""
    try:
        result = await _run_sync(user_ws.genie.list_spaces)
    except Exception as e:
        logger.error(f"Failed to list Genie spaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    allowed_ids = [s.strip() for s in config.genie_space_ids.split(",") if s.strip()]

    spaces = []
    for s in result.spaces or []:
        sid = s.space_id or ""
        if allowed_ids and sid not in allowed_ids:
            continue
        spaces.append(
            GenieSpaceInfo(
                space_id=sid,
                title=s.title or "Untitled",
                description=s.description,
            )
        )

    return GenieSpaceListOut(spaces=spaces)


# --- Genie Conversations ---


@router.post(
    "/genie/spaces/{space_id}/conversations",
    response_model=GenieConversationOut,
    operation_id="startConversation",
)
async def start_conversation(
    space_id: str,
    body: StartConversationRequest,
    user_ws: Dependencies.UserClient,
    headers: Dependencies.Headers,
    config: Dependencies.Config,
    request: Request,
):
    """Start a new Genie conversation. Queues the request if QPM limit is hit."""
    try:
        msg = await _run_sync(
            user_ws.genie.start_conversation_and_wait, space_id, body.question
        )
        d = _msg_to_dict(msg)
        return GenieConversationOut(
            conversation_id=d["conversation_id"],
            space_id=space_id,
            title=body.question,
            message=GenieMessageOut(
                message_id=d["message_id"],
                conversation_id=d["conversation_id"],
                space_id=space_id,
                content=d["content"] or body.question,
                status=d["status"],
                attachments=d["attachments"],
                error=None,
            ),
        )
    except Exception as e:
        err = str(e)
        if "rate" in err.lower() or "limit" in err.lower():
            qs = _get_queue_service(request)
            workspace_url = _get_workspace_url(config, headers)
            token = headers.token.get_secret_value() if headers.token else ""
            item = qs.enqueue(
                user_email=headers.user_email or "unknown",
                user_token=token,
                space_id=space_id,
                workspace_url=workspace_url,
                question=body.question,
            )
            raise HTTPException(
                status_code=202,
                detail={
                    "message": "QPM limit reached. Request has been queued.",
                    "request_id": item.request_id,
                    "status": "queued",
                },
            )
        logger.error(f"Genie start_conversation error: {e}")
        raise HTTPException(status_code=500, detail=err)


@router.post(
    "/genie/spaces/{space_id}/conversations/{conversation_id}/messages",
    response_model=GenieMessageOut,
    operation_id="sendMessage",
)
async def send_message(
    space_id: str,
    conversation_id: str,
    body: SendMessageRequest,
    user_ws: Dependencies.UserClient,
    headers: Dependencies.Headers,
    config: Dependencies.Config,
    request: Request,
):
    """Send a follow-up message. Queues the request if QPM limit is hit."""
    try:
        msg = await _run_sync(
            user_ws.genie.create_message_and_wait,
            space_id,
            conversation_id,
            body.question,
        )
        d = _msg_to_dict(msg)
        return GenieMessageOut(
            message_id=d["message_id"],
            conversation_id=d["conversation_id"],
            space_id=space_id,
            content=d["content"] or body.question,
            status=d["status"],
            attachments=d["attachments"],
            error=None,
        )
    except Exception as e:
        err = str(e)
        if "rate" in err.lower() or "limit" in err.lower():
            qs = _get_queue_service(request)
            workspace_url = _get_workspace_url(config, headers)
            token = headers.token.get_secret_value() if headers.token else ""
            item = qs.enqueue(
                user_email=headers.user_email or "unknown",
                user_token=token,
                space_id=space_id,
                workspace_url=workspace_url,
                question=body.question,
                conversation_id=conversation_id,
            )
            raise HTTPException(
                status_code=202,
                detail={
                    "message": "QPM limit reached. Request has been queued.",
                    "request_id": item.request_id,
                    "status": "queued",
                },
            )
        logger.error(f"Genie send_message error: {e}")
        raise HTTPException(status_code=500, detail=err)


@router.get(
    "/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
    response_model=GenieMessageOut,
    operation_id="getMessage",
)
async def get_message(
    space_id: str,
    conversation_id: str,
    message_id: str,
    user_ws: Dependencies.UserClient,
):
    """Poll for message status."""
    try:
        msg = await _run_sync(
            user_ws.genie.get_message, space_id, conversation_id, message_id
        )
        d = _msg_to_dict(msg)
        return GenieMessageOut(
            message_id=d["message_id"] or message_id,
            conversation_id=conversation_id,
            space_id=space_id,
            content=d["content"],
            status=d["status"],
            attachments=d["attachments"],
            error=None,
        )
    except Exception as e:
        logger.error(f"Genie get_message error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/query-result/{attachment_id}",
    response_model=GenieQueryResultOut,
    operation_id="getQueryResult",
)
async def get_query_result(
    space_id: str,
    conversation_id: str,
    message_id: str,
    attachment_id: str,
    user_ws: Dependencies.UserClient,
):
    """Get query result for a completed message attachment."""
    try:
        result = await _run_sync(
            user_ws.genie.get_message_query_result_by_attachment,
            space_id,
            conversation_id,
            message_id,
            attachment_id,
        )
        columns = []
        rows = []
        if result.statement_response:
            manifest = result.statement_response.manifest
            if manifest and manifest.schema and manifest.schema.columns:
                columns = [
                    {"name": c.name, "type": c.type_name.value if c.type_name else ""}
                    for c in manifest.schema.columns
                ]
            chunk = result.statement_response.result
            if chunk and chunk.data_array:
                rows = chunk.data_array

        return GenieQueryResultOut(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            truncated=False,
        )
    except Exception as e:
        logger.error(f"Genie get_query_result error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Queue Management ---


@router.get("/queue", response_model=QueueListOut, operation_id="listQueue")
async def list_queue(
    request: Request,
    headers: Dependencies.Headers,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    qs = _get_queue_service(request)
    user_email = headers.user_email
    items, total = qs.get_queue_items(user_email=user_email, status=status, limit=limit, offset=offset)
    stats = qs.get_queue_stats()

    return QueueListOut(
        items=[_to_queue_item_out(i) for i in items],
        total=total,
        pending_count=stats.get("pending", 0),
        processing_count=stats.get("processing", 0),
        completed_count=stats.get("completed", 0),
        failed_count=stats.get("failed", 0),
    )


@router.get("/queue/stats", operation_id="getQueueStats")
async def get_queue_stats(request: Request):
    qs = _get_queue_service(request)
    return qs.get_queue_stats()


@router.delete("/queue/clear", response_model=ClearQueueOut, operation_id="clearQueue")
async def clear_queue(request: Request):
    qs = _get_queue_service(request)
    count = qs.clear_queue()
    return ClearQueueOut(deleted_count=count)


@router.get("/queue/{request_id}", response_model=QueueItemOut, operation_id="getQueueItem")
async def get_queue_item(request_id: str, request: Request):
    qs = _get_queue_service(request)
    item = qs.get_item(request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    return _to_queue_item_out(item)


# --- Queue Simulation ---


@router.post("/queue/simulate", response_model=list[QueuedResponseOut], operation_id="simulateQueue")
async def simulate_queue(
    body: SimulateQueueRequest,
    request: Request,
    config: Dependencies.Config,
    headers: Dependencies.Headers,
    user_ws: Dependencies.UserClient,
):
    """Simulate queuing multiple requests across Genie spaces."""
    token = headers.token.get_secret_value() if headers.token else ""
    workspace_url = _get_workspace_url(config, headers)
    qs = _get_queue_service(request)

    space_ids: list[str] = []
    if body.space_ids:
        space_ids = body.space_ids
    elif body.space_id:
        space_ids = [body.space_id]
    else:
        raise HTTPException(status_code=400, detail="Provide space_id or space_ids")

    # Fetch space names using the user's identity
    space_names: dict[str, str] = {}
    try:
        result = await _run_sync(user_ws.genie.list_spaces)
        for s in result.spaces or []:
            if s.space_id:
                space_names[s.space_id] = s.title or "Untitled"
    except Exception:
        pass

    items = qs.simulate_enqueue(
        space_ids=space_ids,
        workspace_url=workspace_url,
        user_email=headers.user_email or "demo@example.com",
        user_token=token,
        num_requests=body.num_requests,
        questions=body.questions,
        space_names=space_names,
    )

    results = []
    for item in items:
        pos = qs.get_pending_position(item.request_id)
        results.append(
            QueuedResponseOut(
                request_id=item.request_id,
                status=item.status,
                message=f"Request queued at position {pos}",
                position=pos,
            )
        )

    return results
