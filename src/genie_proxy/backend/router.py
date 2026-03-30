from __future__ import annotations

from fastapi import HTTPException, Request

from .core import Dependencies, create_router
from .core._config import AppConfig
from .core._headers import DatabricksAppsHeaders
from .genie_service import GenieService, GenieAPIError, QPMLimitError
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
    QueueStatus,
    SendMessageRequest,
    SimulateQueueRequest,
    StartConversationRequest,
    VersionOut,
)
from .queue_service import QueueService

router = create_router()


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


def _require_token(headers: DatabricksAppsHeaders, request: Request | None = None) -> str:
    if headers.token:
        return headers.token.get_secret_value()
    # Fall back to app's WorkspaceClient token (local dev / CLI profile)
    if request:
        ws = request.app.state.workspace_client
        token = ws.config.token
        if token:
            return token
    raise HTTPException(status_code=401, detail="User authentication token not available")


def _compute_timing(item) -> tuple[int | None, int | None]:
    """Compute wait_time_ms and run_time_ms from timestamps."""
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
    request: Request,
    config: Dependencies.Config,
    headers: Dependencies.Headers,
):
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    svc = GenieService(workspace_url=workspace_url, user_token=token)

    try:
        raw_spaces = await svc.list_spaces()
    except GenieAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    allowed_ids = [s.strip() for s in config.genie_space_ids.split(",") if s.strip()]

    spaces = []
    for s in raw_spaces:
        sid = s.get("space_id") or s.get("id", "")
        if allowed_ids and sid not in allowed_ids:
            continue
        spaces.append(
            GenieSpaceInfo(
                space_id=sid,
                title=s.get("title", s.get("name", "Untitled")),
                description=s.get("description"),
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
    config: Dependencies.Config,
    headers: Dependencies.Headers,
    request: Request,
):
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    svc = GenieService(workspace_url=workspace_url, user_token=token)

    try:
        result = await svc.ask_question(space_id=space_id, question=body.question)
        return GenieConversationOut(
            conversation_id=result["conversation_id"],
            space_id=space_id,
            title=body.question,
            message=GenieMessageOut(
                message_id=result["message_id"],
                conversation_id=result["conversation_id"],
                space_id=space_id,
                content=result.get("content", body.question),
                status=result["status"],
                attachments=result.get("attachments"),
                error=result.get("error"),
            ),
        )
    except QPMLimitError:
        qs = _get_queue_service(request)
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
    except GenieAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.post(
    "/genie/spaces/{space_id}/conversations/{conversation_id}/messages",
    response_model=GenieMessageOut,
    operation_id="sendMessage",
)
async def send_message(
    space_id: str,
    conversation_id: str,
    body: SendMessageRequest,
    config: Dependencies.Config,
    headers: Dependencies.Headers,
    request: Request,
):
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    svc = GenieService(workspace_url=workspace_url, user_token=token)

    try:
        result = await svc.ask_question(
            space_id=space_id,
            question=body.question,
            conversation_id=conversation_id,
        )
        return GenieMessageOut(
            message_id=result["message_id"],
            conversation_id=result["conversation_id"],
            space_id=space_id,
            content=result.get("content", body.question),
            status=result["status"],
            attachments=result.get("attachments"),
            error=result.get("error"),
        )
    except QPMLimitError:
        qs = _get_queue_service(request)
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
    except GenieAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


@router.get(
    "/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
    response_model=GenieMessageOut,
    operation_id="getMessage",
)
async def get_message(
    space_id: str,
    conversation_id: str,
    message_id: str,
    request: Request,
    config: Dependencies.Config,
    headers: Dependencies.Headers,
):
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    svc = GenieService(workspace_url=workspace_url, user_token=token)

    try:
        msg = await svc.get_message(space_id, conversation_id, message_id)
        return GenieMessageOut(
            message_id=msg.get("id", message_id),
            conversation_id=conversation_id,
            space_id=space_id,
            content=msg.get("content", ""),
            status=msg.get("status", "UNKNOWN"),
            attachments=msg.get("attachments"),
            error=msg.get("error"),
        )
    except GenieAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


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
    request: Request,
    config: Dependencies.Config,
    headers: Dependencies.Headers,
):
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    svc = GenieService(workspace_url=workspace_url, user_token=token)

    try:
        result = await svc.get_query_result(
            space_id, conversation_id, message_id, attachment_id
        )
        columns = result.get("manifest", {}).get("schema", {}).get("columns", [])
        rows_data = result.get("result", {}).get("data_array", [])
        row_count = result.get("row_count") or len(rows_data)
        truncated = result.get("truncated", False)

        return GenieQueryResultOut(
            columns=[{"name": c.get("name"), "type": c.get("type_name")} for c in columns],
            rows=rows_data,
            row_count=row_count,
            truncated=truncated,
        )
    except GenieAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)


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
    """Delete all queue items."""
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
):
    """Simulate queuing multiple requests across Genie spaces."""
    token = _require_token(headers, request)
    workspace_url = _get_workspace_url(config, headers)
    qs = _get_queue_service(request)

    # Resolve space IDs
    space_ids: list[str] = []
    if body.space_ids:
        space_ids = body.space_ids
    elif body.space_id:
        space_ids = [body.space_id]
    else:
        raise HTTPException(status_code=400, detail="Provide space_id or space_ids")

    # Fetch space names for display
    svc = GenieService(workspace_url=workspace_url, user_token=token)
    space_names: dict[str, str] = {}
    try:
        raw_spaces = await svc.list_spaces()
        for s in raw_spaces:
            sid = s.get("space_id") or s.get("id", "")
            space_names[sid] = s.get("title", s.get("name", "Untitled"))
    except GenieAPIError:
        pass  # names are optional, proceed without them

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
