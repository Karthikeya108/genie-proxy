"""Service layer for proxying requests to the Databricks Genie Spaces API.

Uses the user's OBO (on-behalf-of) token so all API calls respect the user's
permissions. Never uses the app's service principal for Genie operations.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from .core._config import logger


class GenieAPIError(Exception):
    """Raised when the Genie API returns an error."""

    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Genie API error {status_code}: {detail}")


class QPMLimitError(GenieAPIError):
    """Raised when the Genie API rate limit (QPM) is hit."""

    def __init__(self, detail: str = "Genie Space QPM limit exceeded"):
        super().__init__(status_code=429, detail=detail)


class GenieService:
    """Proxy service for Databricks Genie Spaces API.

    All methods require a user_token (OBO token) and workspace_url so that
    requests are made on behalf of the authenticated user.
    """

    POLL_INITIAL_INTERVAL = 1.0
    POLL_MAX_INTERVAL = 5.0
    POLL_TIMEOUT = 300  # 5 minutes

    def __init__(self, workspace_url: str, user_token: str):
        self.workspace_url = workspace_url.rstrip("/")
        self.base_url = f"{self.workspace_url}/api/2.0/genie"
        self.headers = {
            "Authorization": f"Bearer {user_token}",
            "Content-Type": "application/json",
        }

    async def _request(
        self, method: str, path: str, json: dict | None = None
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.request(
                method, url, headers=self.headers, json=json
            )

        if response.status_code in (400, 429):
            body = response.text
            if "rate" in body.lower() or "limit" in body.lower() or response.status_code == 429:
                raise QPMLimitError(body)
            raise GenieAPIError(response.status_code, body)

        if response.status_code >= 400:
            logger.error(
                f"Genie API {method} {path} returned {response.status_code}: {response.text[:500]}"
            )
            raise GenieAPIError(response.status_code, response.text)

        return response.json()

    # --- Space Operations ---

    async def list_spaces(self) -> list[dict]:
        """List Genie spaces accessible to the user."""
        data = await self._request("GET", "/spaces")
        return data.get("spaces", data.get("genie_spaces", []))

    async def get_space(self, space_id: str) -> dict:
        """Get details of a specific Genie space."""
        return await self._request("GET", f"/spaces/{space_id}")

    # --- Conversation Operations ---

    async def start_conversation(self, space_id: str, question: str) -> dict:
        """Start a new conversation in a Genie space.

        Returns the conversation and initial message (status will be IN_PROGRESS).
        Raises QPMLimitError if the workspace QPM limit is hit.
        """
        data = await self._request(
            "POST",
            f"/spaces/{space_id}/start-conversation",
            json={"content": question},
        )
        return data

    async def send_message(
        self, space_id: str, conversation_id: str, question: str
    ) -> dict:
        """Send a follow-up message in an existing conversation.

        Raises QPMLimitError if the workspace QPM limit is hit.
        """
        data = await self._request(
            "POST",
            f"/spaces/{space_id}/conversations/{conversation_id}/messages",
            json={"content": question},
        )
        return data

    async def get_message(
        self, space_id: str, conversation_id: str, message_id: str
    ) -> dict:
        """Poll for message status. GET requests don't count toward QPM."""
        return await self._request(
            "GET",
            f"/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
        )

    async def get_query_result(
        self,
        space_id: str,
        conversation_id: str,
        message_id: str,
        attachment_id: str,
    ) -> dict:
        """Get the query result for a completed message attachment."""
        return await self._request(
            "GET",
            f"/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/attachments/{attachment_id}/query-result",
        )

    # --- Polling Helper ---

    async def poll_message_until_done(
        self, space_id: str, conversation_id: str, message_id: str
    ) -> dict:
        """Poll a message until it reaches a terminal state (COMPLETED, FAILED, CANCELLED).

        Uses exponential backoff. Returns the final message object.
        """
        interval = self.POLL_INITIAL_INTERVAL
        start = time.monotonic()

        while True:
            elapsed = time.monotonic() - start
            if elapsed > self.POLL_TIMEOUT:
                raise GenieAPIError(408, "Polling timed out waiting for Genie response")

            msg = await self.get_message(space_id, conversation_id, message_id)
            status = msg.get("status", "")

            if status in ("COMPLETED", "FAILED", "CANCELLED"):
                return msg

            logger.debug(
                f"Genie message {message_id} status={status}, "
                f"polling again in {interval:.1f}s"
            )
            await asyncio.sleep(interval)
            interval = min(interval * 1.5, self.POLL_MAX_INTERVAL)

    # --- High-Level Helpers ---

    async def ask_question(
        self, space_id: str, question: str, conversation_id: str | None = None
    ) -> dict:
        """Send a question and poll until the response is ready.

        If conversation_id is provided, sends a follow-up message.
        Otherwise starts a new conversation.

        Returns a dict with conversation_id, message, and optionally query_result.
        """
        if conversation_id:
            resp = await self.send_message(space_id, conversation_id, question)
            msg = resp
            conv_id = conversation_id
        else:
            resp = await self.start_conversation(space_id, question)
            conv_id = resp.get("conversation", {}).get("id", resp.get("conversation_id", ""))
            msg = resp.get("message", resp)

        message_id = msg.get("id", msg.get("message_id", ""))

        final_msg = await self.poll_message_until_done(space_id, conv_id, message_id)

        result = {
            "conversation_id": conv_id,
            "message_id": message_id,
            "status": final_msg.get("status"),
            "content": final_msg.get("content", question),
            "attachments": final_msg.get("attachments", []),
            "error": final_msg.get("error"),
        }

        # Fetch query results for completed attachments
        attachments = final_msg.get("attachments", []) or []
        for att in attachments:
            att_id = att.get("attachment_id") or att.get("id")
            if att_id and att.get("type") == "query_result":
                try:
                    qr = await self.get_query_result(
                        space_id, conv_id, message_id, att_id
                    )
                    att["query_result"] = qr
                except GenieAPIError:
                    logger.warning(f"Failed to fetch query result for attachment {att_id}")

        return result
