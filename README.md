# Genie Proxy

A Databricks App that provides proxy access to one or more Genie Spaces across workspaces through an API, with intelligent request queuing backed by Lakebase when QPM rate limits are hit.

## Architecture

```mermaid
flowchart TB
    subgraph "Databricks App - Genie Proxy"
        direction TB
        UI["React Frontend<br/>(shadcn/ui + TanStack Router)"]
        API["FastAPI Backend<br/>(APX Framework)"]
        MGR["Queue Manager"]
        subgraph "Rolling Window (DB-enforced, max 5)"
            W1["Worker Task 1"]
            W2["Worker Task 2"]
            W3["..."]
            W5["Worker Task 5"]
        end
    end

    subgraph "Databricks Platform"
        GS1["Genie Space 1"]
        GS2["Genie Space 2"]
        GSN["Genie Space N"]
        LB["Lakebase<br/>(PostgreSQL - Provisioned)"]
    end

    User["User<br/>(Browser)"] -->|"OBO Token"| UI
    UI -->|"REST API"| API
    API -->|"User Identity<br/>(OBO Token)"| GS1
    API -->|"User Identity<br/>(OBO Token)"| GS2
    API -->|"User Identity<br/>(OBO Token)"| GSN

    API -->|"QPM Limit Hit → Queue"| LB
    MGR -->|"Discover workspaces"| LB
    W1 -->|"Claim 1 (FCFS)"| LB
    W2 -->|"Claim 1 (FCFS)"| LB
    W5 -->|"Claim 1 (FCFS)"| LB
    W1 -->|"User Token"| GS1
    W2 -->|"User Token"| GS2
    W5 -->|"User Token"| GSN
```

### Request Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI
    participant API as FastAPI Backend
    participant Genie as Genie Space API
    participant LB as Lakebase (PostgreSQL)
    participant Worker as Rolling Window Worker

    User->>UI: Ask question
    UI->>API: POST /api/genie/spaces/{id}/conversations
    API->>Genie: Start conversation (OBO token)

    alt Success (within QPM limit)
        Genie-->>API: Conversation + Message (IN_PROGRESS)
        API->>Genie: Poll GET /messages/{id}
        Genie-->>API: Message (COMPLETED)
        API-->>UI: Response with data
        UI-->>User: Display results
    else QPM Limit Hit (400/429)
        Genie-->>API: Rate limit error
        API->>LB: INSERT into queued_requests
        API-->>UI: 202 Accepted (request_id)
        UI-->>User: "Request queued"
        Worker->>LB: Check PROCESSING count < 5, then SELECT ... FOR UPDATE SKIP LOCKED
        LB-->>Worker: Next pending request (FCFS)
        Worker->>Genie: Process with user token
        Genie-->>Worker: Response
        Worker->>LB: UPDATE status = completed
        Note over Worker,LB: Slot freed → next pending starts immediately
    end
```

### Rolling Window Queue Model

```mermaid
sequenceDiagram
    participant Q as Queue (Lakebase)
    participant DB as DB Concurrency Gate
    participant W as Worker Pool

    Note over Q,W: 10 requests queued, DB enforces max 5 PROCESSING

    Q->>DB: Claim #1 (PROCESSING count: 0 < 5) ✓
    Q->>DB: Claim #2 (PROCESSING count: 1 < 5) ✓
    Q->>DB: Claim #3 (PROCESSING count: 2 < 5) ✓
    Q->>DB: Claim #4 (PROCESSING count: 3 < 5) ✓
    Q->>DB: Claim #5 (PROCESSING count: 4 < 5) ✓

    Note over DB: 5 PROCESSING — no more claims until one completes

    Q->>DB: Try claim #6 (count: 5 ≥ 5) ✗ wait...

    W-->>DB: Request #3 completes → PROCESSING count drops to 4
    Q->>DB: Claim #6 (count: 4 < 5) ✓

    W-->>DB: Request #1 completes → PROCESSING count drops to 4
    Q->>DB: Claim #7 (count: 4 < 5) ✓

    Note over Q,W: Works correctly across multiple uvicorn workers
```

## Authentication Model

| Operation | Identity | Method |
|-----------|----------|--------|
| Genie API calls (list spaces, conversations, messages, query results) | **User** | OBO token from `X-Forwarded-Access-Token` header |
| Queued Genie requests (background processing) | **User** | Stored OBO token from original request |
| Lakebase DB connections, credential generation | **Service Principal** | App SP via env vars (`DATABRICKS_CLIENT_ID`/`SECRET`) |
| Queue management (enqueue, claim, stats) | **Service Principal** | App SP via DB engine |

The user `WorkspaceClient` is created with an explicit `Config(host=..., token=...)` that sets `client_id=""` and `client_secret=""` to prevent the SDK from picking up the SP's env vars. No PAT tokens are used — only OAuth OBO tokens forwarded by the Databricks Apps platform.

## Features

- **Multi-Space Access**: Browse and connect to multiple Genie Spaces across workspaces
- **User Identity (OBO)**: All Genie API calls use the authenticated user's identity via OAuth On-Behalf-Of token passthrough, never the service principal
- **DB-Enforced Concurrency**: Max 5 queries execute concurrently per workspace, enforced in the database (not in-memory), so it works correctly across multiple uvicorn worker processes
- **Rolling Window Queue**: When one of the 5 concurrent queries completes, the next pending request starts immediately with zero delay (FCFS)
- **QPM Requeue**: If a 429/QPM limit error still occurs, the request is requeued without counting as a failed attempt — it stays pending until a slot opens
- **Live Timers**: Queue monitor shows live-ticking wait time (while pending) and run time (while processing), freezing to final values on completion
- **Queue Monitor**: Real-time dashboard with Current Run / History tabs, per-request timing, and Genie space name badges
- **Queue Simulation**: Simulate queuing across multiple Genie spaces with round-robin distribution
- **Atomic Dequeuing**: Uses PostgreSQL's `SELECT FOR UPDATE SKIP LOCKED` for reliable, concurrent-safe FCFS processing
- **Crash Recovery**: On startup, stuck PROCESSING requests are automatically reset to PENDING

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [APX](https://github.com/databricks-solutions/apx) (FastAPI + React) |
| Backend | Python 3.11+, FastAPI, SQLModel, httpx, asyncio |
| Frontend | React 19, TypeScript, TanStack Router, TanStack React Query |
| UI Components | [shadcn/ui](https://github.com/shadcn-ui/ui) (Radix + Tailwind) |
| Database | Lakebase (Databricks managed PostgreSQL, Provisioned) |
| Auth | Databricks Apps OAuth OBO (On-Behalf-Of) token passthrough |
| Deployment | Databricks Asset Bundles |

## Project Structure

```
genie-proxy/
├── databricks.yml              # DABs deployment config
├── app.yml                     # App entrypoint
├── pyproject.toml              # Python dependencies + APX metadata
├── package.json                # Frontend dependencies
├── .env_template               # Environment variable template
├── .gitignore
├── README.md
└── src/genie_proxy/
    ├── backend/
    │   ├── app.py              # FastAPI app entry
    │   ├── router.py           # API routes (Genie proxy + queue)
    │   ├── models.py           # SQLModel + Pydantic models
    │   ├── genie_service.py    # Genie Spaces API client (OBO)
    │   ├── queue_service.py    # Rolling window queue (DB-enforced concurrency)
    │   └── core/               # APX framework core
    │       ├── _config.py      # App configuration + logging
    │       ├── _defaults.py    # WorkspaceClient dependencies (SP + user OBO)
    │       ├── _headers.py     # OBO header extraction
    │       ├── lakebase.py     # DB engine + queue manager lifecycle
    │       └── dependencies.py # FastAPI DI shortcuts
    └── ui/
        ├── main.tsx            # React entry
        ├── routes/
        │   ├── index.tsx       # Landing page
        │   └── _sidebar/
        │       ├── route.tsx   # Sidebar layout + navigation
        │       ├── spaces.tsx  # Genie Space browser
        │       ├── chat.tsx    # Chat interface
        │       ├── queue.tsx   # Queue monitor (live timers, simulation)
        │       └── profile.tsx # User profile
        ├── components/         # shadcn/ui + custom components
        ├── lib/
        │   └── api.ts          # Auto-generated API client + React Query hooks
        └── styles/globals.css  # Tailwind CSS
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/version` | App version |
| `GET` | `/api/current-user` | Current authenticated user |
| `GET` | `/api/genie/spaces` | List accessible Genie Spaces |
| `POST` | `/api/genie/spaces/{id}/conversations` | Start conversation |
| `POST` | `/api/genie/spaces/{id}/conversations/{cid}/messages` | Send message |
| `GET` | `/api/genie/spaces/{id}/conversations/{cid}/messages/{mid}` | Poll message status |
| `GET` | `/api/genie/spaces/{id}/.../query-result/{aid}` | Get query results |
| `GET` | `/api/queue` | List queued requests (with timing) |
| `GET` | `/api/queue/stats` | Queue statistics by status |
| `GET` | `/api/queue/{request_id}` | Get queue item details |
| `DELETE` | `/api/queue/clear` | Clear all queue items |
| `POST` | `/api/queue/simulate` | Simulate queued requests across spaces |

## Setup & Development

### Prerequisites

- Python 3.11+
- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/index.html) configured
- [APX CLI](https://github.com/databricks-solutions/apx) installed
- Access to a Databricks workspace with Genie Spaces

### 1. Clone and configure

```bash
# Copy environment template
cp .env_template .env

# Edit .env with your workspace URL and optional space IDs
```

### 2. Local development

```bash
# Install apx CLI (if not already installed)
curl -fsSL https://databricks-solutions.github.io/apx/install.sh | sh

# Start dev server (backend + frontend + PGlite for local Lakebase)
apx dev start

# Check server status
apx dev status

# View logs
apx dev logs -f
```

The dev server provides:
- App at `http://localhost:9001`
- Backend with hot reload
- Frontend with HMR (Hot Module Replacement)
- PGlite sidecar for local PostgreSQL (no Lakebase needed locally)

### 3. Deploy to Databricks

```bash
# Build the app (frontend + backend into a single wheel)
apx build

# Deploy with Databricks Asset Bundles
databricks bundle deploy -t dev

# Deploy the app
databricks apps deploy genie-proxy-app \
  --source-code-path "/Workspace/Users/<your-email>/.bundle/genie-proxy/dev/files/.build"
```

## Queue Mechanism

### Concurrency Model

The Genie API allows **5 questions per minute per workspace** across all Genie spaces. The queue enforces this at the workspace level using **database-enforced concurrency**:

- Before claiming a new request, the worker checks: `SELECT COUNT(*) FROM queued_requests WHERE status = 'processing' AND workspace_url = ?`
- If the count is >= 5, no new request is claimed — the worker waits for a completion signal
- This works correctly across **multiple uvicorn worker processes** because the database is the single source of truth (in-memory semaphores would allow 2 × 5 = 10 concurrent with `--workers 2`)
- Workers use FCFS (First Come, First Served) ordering via `ORDER BY priority DESC, created_at ASC`
- When one of the 5 completes, the worker is signaled and immediately claims the next pending request (rolling window, no polling delay)

### Queue Table Schema

```sql
CREATE TABLE queued_requests (
    id              SERIAL PRIMARY KEY,
    request_id      VARCHAR UNIQUE NOT NULL,
    user_email      VARCHAR NOT NULL,
    user_token      TEXT NOT NULL,
    space_id        VARCHAR NOT NULL,
    space_name      VARCHAR,
    workspace_url   VARCHAR NOT NULL,
    question        TEXT NOT NULL,
    conversation_id VARCHAR,
    status          VARCHAR DEFAULT 'pending',
    priority        INTEGER DEFAULT 0,
    attempt_count   INTEGER DEFAULT 0,
    max_attempts    INTEGER DEFAULT 5,
    error_message   TEXT,
    response_data   TEXT,
    created_at      TIMESTAMP WITH TIME ZONE,
    updated_at      TIMESTAMP WITH TIME ZONE,
    started_at      TIMESTAMP WITH TIME ZONE,
    completed_at    TIMESTAMP WITH TIME ZONE
);
```

### Dequeue Pattern

Uses PostgreSQL's `SELECT FOR UPDATE SKIP LOCKED` for atomic, concurrent-safe FCFS dequeuing, with a DB-level concurrency check:

```sql
-- Step 1: Check concurrency limit
SELECT COUNT(*) FROM queued_requests
WHERE status = 'processing' AND workspace_url = :workspace_url;
-- If count >= 5, skip — wait for a slot to free up

-- Step 2: Claim next pending (only if count < 5)
UPDATE queued_requests
SET status = 'processing', updated_at = NOW(), started_at = NOW()
WHERE id = (
    SELECT id FROM queued_requests
    WHERE status = 'pending'
      AND workspace_url = :workspace_url
      AND attempt_count < max_attempts
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING id;
```

### Retry Logic

- **QPM limit errors (429)**: Requeued to PENDING **without incrementing attempt count** — the request stays in the queue indefinitely until it succeeds
- **Non-QPM API errors**: Marked as failed immediately
- **Unexpected errors**: Requeued with incremented attempt count (max 5 attempts)
- **Crash recovery**: PROCESSING requests reset to PENDING on startup

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PGAPPNAME` | Lakebase provisioned database instance name | Yes |
| `GENIE_PROXY_WORKSPACE_URL` | Databricks workspace URL | No (falls back to `DATABRICKS_HOST`) |
| `GENIE_PROXY_GENIE_SPACE_IDS` | Comma-separated Genie Space IDs to expose | No (shows all accessible) |

## User API Scopes

The app requires these OAuth scopes configured in the Databricks App's Authorization tab:

- `sql` — Execute SQL queries
- `dashboards.genie` — Access Genie Spaces API
- `serving.serving-endpoints` — Access serving endpoints

Disclaimer:
- The sample app provided is intended to aid in getting started and may not be production-ready. The code does not have any guarantees/warantees/support. Use it at your own risk.
- This repo contains AI generated elements.
