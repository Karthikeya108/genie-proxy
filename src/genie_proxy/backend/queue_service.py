"""Queue service backed by Lakebase (PostgreSQL).

Uses a rolling-window parallel processor per workspace. Each workspace gets
an asyncio.Semaphore(5) — up to 5 requests process concurrently. The moment
one finishes, the next pending request starts immediately (no polling delay).

Uses SELECT FOR UPDATE SKIP LOCKED for reliable, concurrent-safe dequeuing.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from databricks.sdk import WorkspaceClient
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from .core._config import logger
from .genie_service import GenieService, QPMLimitError, GenieAPIError
from .models import QueuedRequest, QueueStatus


class QueueService:
    """Manages the Lakebase-backed request queue with rolling-window processing."""

    def __init__(self, engine: Engine, ws: WorkspaceClient | None = None, qpm_limit: int = 5):
        self.engine = engine
        self._ws = ws
        self._qpm_limit = qpm_limit
        self._stop_event = asyncio.Event()
        self._new_work_event = asyncio.Event()
        self._workspace_semaphores: dict[str, asyncio.Semaphore] = {}
        self._workspace_workers: dict[str, asyncio.Task] = {}
        self._manager_task: asyncio.Task | None = None

    def _get_semaphore(self, workspace_url: str) -> asyncio.Semaphore:
        if workspace_url not in self._workspace_semaphores:
            self._workspace_semaphores[workspace_url] = asyncio.Semaphore(self._qpm_limit)
        return self._workspace_semaphores[workspace_url]

    # --- Queue Operations ---

    def enqueue(
        self,
        user_email: str,
        user_token: str,
        space_id: str,
        workspace_url: str,
        question: str,
        conversation_id: str | None = None,
        space_name: str | None = None,
    ) -> QueuedRequest:
        item = QueuedRequest(
            user_email=user_email,
            user_token=user_token,
            space_id=space_id,
            space_name=space_name,
            workspace_url=workspace_url,
            question=question,
            conversation_id=conversation_id,
        )
        with Session(self.engine) as session:
            session.add(item)
            session.commit()
            session.refresh(item)
            logger.info(f"Enqueued request {item.request_id} for {user_email}")
        # Signal the manager that new work is available
        self._new_work_event.set()
        return item

    def get_item(self, request_id: str) -> QueuedRequest | None:
        with Session(self.engine) as session:
            stmt = select(QueuedRequest).where(QueuedRequest.request_id == request_id)
            return session.exec(stmt).first()

    def get_queue_items(
        self,
        user_email: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[QueuedRequest], int]:
        with Session(self.engine) as session:
            stmt = select(QueuedRequest)
            count_sql = "SELECT COUNT(*) FROM queued_requests WHERE 1=1"
            params: dict = {}

            if user_email:
                stmt = stmt.where(QueuedRequest.user_email == user_email)
                count_sql += " AND user_email = :email"
                params["email"] = user_email
            if status:
                stmt = stmt.where(QueuedRequest.status == status)
                count_sql += " AND status = :status"
                params["status"] = status

            stmt = stmt.order_by(QueuedRequest.created_at.desc())  # type: ignore[union-attr]
            stmt = stmt.offset(offset).limit(limit)

            items = list(session.exec(stmt).all())
            total = session.exec(text(count_sql), params=params).scalar() or 0  # type: ignore[call-overload]
            return items, int(total)

    def get_queue_stats(self) -> dict[str, int]:
        with Session(self.engine) as session:
            result = session.exec(
                text("SELECT status, COUNT(*) as cnt FROM queued_requests GROUP BY status")
            )
            stats = {row[0]: row[1] for row in result}
            return {
                "pending": stats.get(QueueStatus.PENDING, 0),
                "processing": stats.get(QueueStatus.PROCESSING, 0),
                "completed": stats.get(QueueStatus.COMPLETED, 0),
                "failed": stats.get(QueueStatus.FAILED, 0),
                "expired": stats.get(QueueStatus.EXPIRED, 0),
            }

    def get_pending_position(self, request_id: str) -> int | None:
        with Session(self.engine) as session:
            result = session.exec(
                text("""
                    SELECT position FROM (
                        SELECT request_id,
                               ROW_NUMBER() OVER (ORDER BY priority DESC, created_at ASC) as position
                        FROM queued_requests
                        WHERE status = :status
                    ) ranked
                    WHERE request_id = :req_id
                """),
                params={"status": QueueStatus.PENDING, "req_id": request_id},
            )
            row = result.first()
            return int(row[0]) if row else None

    def clear_queue(self) -> int:
        with Session(self.engine) as session:
            result = session.exec(text("DELETE FROM queued_requests"))
            count = result.rowcount  # type: ignore[union-attr]
            session.commit()
            return int(count)

    # --- Atomic Claim (one at a time per worker) ---

    def _claim_one(self, workspace_url: str) -> QueuedRequest | None:
        """Atomically claim the next pending request for a workspace."""
        now = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            result = session.exec(
                text("""
                    UPDATE queued_requests
                    SET status = :processing, updated_at = :now, started_at = :now
                    WHERE id = (
                        SELECT id FROM queued_requests
                        WHERE status = :pending
                          AND workspace_url = :ws_url
                          AND attempt_count < max_attempts
                        ORDER BY priority DESC, created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id
                """),
                params={
                    "processing": QueueStatus.PROCESSING,
                    "pending": QueueStatus.PENDING,
                    "ws_url": workspace_url,
                    "now": now,
                },
            )
            row = result.first()
            session.commit()
            if row is None:
                return None
            return session.get(QueuedRequest, row[0])

    def _get_pending_workspaces(self) -> list[str]:
        with Session(self.engine) as session:
            result = session.exec(
                text("""
                    SELECT DISTINCT workspace_url
                    FROM queued_requests
                    WHERE status = :pending AND attempt_count < max_attempts
                """),
                params={"pending": QueueStatus.PENDING},
            )
            return [row[0] for row in result.all()]

    def _recover_stuck_requests(self) -> int:
        with Session(self.engine) as session:
            result = session.exec(
                text("""
                    UPDATE queued_requests
                    SET status = :pending, updated_at = :now, started_at = NULL
                    WHERE status = :processing
                """),
                params={
                    "pending": QueueStatus.PENDING,
                    "processing": QueueStatus.PROCESSING,
                    "now": datetime.now(timezone.utc),
                },
            )
            count = result.rowcount  # type: ignore[union-attr]
            session.commit()
            return int(count)

    def _mark_completed(self, item_id: int, response_data: dict) -> None:
        now = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            item = session.get(QueuedRequest, item_id)
            if item:
                item.status = QueueStatus.COMPLETED
                item.response_data = json.dumps(response_data)
                item.completed_at = now
                item.updated_at = now
                session.add(item)
                session.commit()

    def _mark_failed(self, item_id: int, error: str, requeue: bool = False) -> None:
        now = datetime.now(timezone.utc)
        with Session(self.engine) as session:
            item = session.get(QueuedRequest, item_id)
            if item:
                item.attempt_count += 1
                item.error_message = error
                item.updated_at = now
                if requeue and item.attempt_count < item.max_attempts:
                    item.status = QueueStatus.PENDING
                    item.started_at = None
                else:
                    item.status = QueueStatus.FAILED
                    item.completed_at = now
                session.add(item)
                session.commit()

    # --- Rolling Window Workers ---

    def _get_fresh_token(self) -> str | None:
        if self._ws:
            try:
                return self._ws.config.token
            except Exception:
                return None
        return None

    async def _process_one(self, item: QueuedRequest) -> None:
        logger.info(
            f"Processing request {item.request_id} "
            f"space={item.space_name or item.space_id} "
            f"(attempt {item.attempt_count + 1}/{item.max_attempts})"
        )
        token = self._get_fresh_token() or item.user_token

        try:
            svc = GenieService(workspace_url=item.workspace_url, user_token=token)
            result = await svc.ask_question(
                space_id=item.space_id,
                question=item.question,
                conversation_id=item.conversation_id,
            )
            self._mark_completed(item.id, result)  # type: ignore[arg-type]
            logger.info(f"Completed request {item.request_id}")

        except QPMLimitError:
            logger.warning(f"QPM limit hit for {item.request_id}, re-queuing")
            self._mark_failed(item.id, "QPM limit exceeded, will retry", requeue=True)  # type: ignore[arg-type]

        except GenieAPIError as e:
            logger.error(f"Genie API error for {item.request_id}: {e}")
            self._mark_failed(item.id, str(e), requeue=False)  # type: ignore[arg-type]

        except Exception as e:
            logger.error(f"Unexpected error for {item.request_id}: {e}")
            self._mark_failed(item.id, str(e), requeue=True)  # type: ignore[arg-type]

    async def _workspace_worker(self, workspace_url: str) -> None:
        """Persistent worker for a single workspace.

        Loops: acquire semaphore → claim one request → process → release.
        The semaphore ensures at most `qpm_limit` requests run concurrently.
        When one finishes and releases the semaphore, the next waiting
        iteration immediately acquires it — true rolling window with zero delay.
        """
        sem = self._get_semaphore(workspace_url)
        logger.info(f"Workspace worker started for {workspace_url} (max {self._qpm_limit} concurrent)")

        while not self._stop_event.is_set():
            # Wait for a concurrency slot
            await sem.acquire()
            try:
                item = self._claim_one(workspace_url)
                if item is None:
                    # No pending work — release semaphore and wait for signal
                    sem.release()
                    # Wait until new work arrives or shutdown
                    self._new_work_event.clear()
                    try:
                        await asyncio.wait_for(self._new_work_event.wait(), timeout=5.0)
                    except asyncio.TimeoutError:
                        pass
                    continue

                # Process in a new task so we can immediately loop back
                # and acquire the semaphore for the next request
                async def _run(item: QueuedRequest = item) -> None:
                    try:
                        await self._process_one(item)
                    finally:
                        sem.release()

                asyncio.create_task(_run())
            except Exception:
                sem.release()
                raise

        logger.info(f"Workspace worker stopped for {workspace_url}")

    async def _manager_loop(self) -> None:
        """Manager loop: discovers workspaces and spawns per-workspace workers."""
        logger.info(f"Queue manager started (rolling window, max {self._qpm_limit} concurrent per workspace)")

        recovered = self._recover_stuck_requests()
        if recovered:
            logger.info(f"Recovered {recovered} stuck PROCESSING requests")

        while not self._stop_event.is_set():
            try:
                workspaces = self._get_pending_workspaces()
                for ws_url in workspaces:
                    if ws_url not in self._workspace_workers or self._workspace_workers[ws_url].done():
                        task = asyncio.create_task(self._workspace_worker(ws_url))
                        self._workspace_workers[ws_url] = task

                # Clean up finished workers
                self._workspace_workers = {
                    ws: t for ws, t in self._workspace_workers.items() if not t.done()
                }

                # Wait for new work or periodic check
                self._new_work_event.clear()
                try:
                    await asyncio.wait_for(self._new_work_event.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    pass

            except Exception as e:
                logger.error(f"Queue manager error: {e}")
                await asyncio.sleep(3.0)

        # Shutdown: cancel all workspace workers
        for ws_url, task in self._workspace_workers.items():
            task.cancel()
        if self._workspace_workers:
            await asyncio.gather(*self._workspace_workers.values(), return_exceptions=True)

        logger.info("Queue manager stopped")

    def start_worker(self) -> None:
        if self._manager_task is None or self._manager_task.done():
            self._stop_event.clear()
            self._manager_task = asyncio.create_task(self._manager_loop())

    def stop_worker(self) -> None:
        self._stop_event.set()
        self._new_work_event.set()  # Unblock any waiting workers
        if self._manager_task:
            self._manager_task.cancel()

    # --- Simulation ---

    def simulate_enqueue(
        self,
        space_ids: list[str],
        workspace_url: str,
        user_email: str,
        user_token: str,
        num_requests: int = 5,
        questions: list[str] | None = None,
        space_names: dict[str, str] | None = None,
    ) -> list[QueuedRequest]:
        """Simulate queuing requests distributed round-robin across space_ids."""
        default_questions = [
            "What are the top 10 products by revenue?",
            "Show me monthly sales trends for the last year",
            "Which customers have the highest lifetime value?",
            "What is the average order value by region?",
            "Show me the inventory turnover rate by category",
            "What are the most popular product categories?",
            "Show me customer acquisition trends",
            "What is the return rate by product line?",
            "Which regions have the fastest growing sales?",
            "Show me the top performing sales channels",
        ]
        qs = questions or default_questions
        names = space_names or {}
        items = []
        for i in range(num_requests):
            sid = space_ids[i % len(space_ids)]
            q = qs[i % len(qs)]
            item = self.enqueue(
                user_email=user_email,
                user_token=user_token,
                space_id=sid,
                space_name=names.get(sid),
                workspace_url=workspace_url,
                question=q,
            )
            items.append(item)
        return items
