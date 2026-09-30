# document-ai

A permission-aware document knowledge base for any group — a class, a team,
a few friends. Upload PDFs, Word files and spreadsheets; they're split into
passages, embedded, and stored in Postgres with pgvector. Ask a question and
get an answer drawn only from documents **you are allowed to read**, with the
file and page cited for every claim.

**Live demo:** [document-ai-red.vercel.app](https://document-ai-red.vercel.app)
— sign up, create a workspace, upload something and ask about it.

![An answer with cited sources, page numbers and similarity scores](docs/screenshot.png)

The interesting problem isn't retrieval — it's making sure retrieval can't
leak. Access control is enforced inside the vector search itself, so a
document you can't read is never ranked, never enters the prompt, and can't
surface through the model's wording. That rule is covered by an automated
test suite rather than a claim.

---

## Highlights

- **Workspace isolation, verified by tests.** Every document, folder and
  conversation belongs to exactly one workspace. Owning one grants nothing
  in another, and the boundary is applied inside the similarity search rather
  than filtered afterwards.
- **Grounded answers with structural citations.** Sources come from the
  chunks actually retrieved, not parsed from model output, so a citation
  can't point at something the model never saw.
- **Streamed responses.** Answers appear word by word over SSE, with sources
  attached at the end once the full answer is known.
- **Follow-up questions that work.** "Tell me more about this" is rewritten
  into a standalone question before searching, so conversations flow
  naturally without weakening the permission boundary.
- **Invite links with roles.** Share a link; people join as admin, member or
  viewer. Links expire and can be revoked.
- **Measurable refusal.** Below a similarity floor the LLM is never called;
  the app says so, and the dashboard counts how often it happens.
- **Provider-agnostic LLM layer.** Runs on Google Gemini through its
  OpenAI-compatible endpoint; switching providers is a configuration change,
  not a code change.

---

## Architecture

| Service | Stack | Responsibility |
|---|---|---|
| `client/` | React + Vite | UI |
| `server/` | Node + Express | auth, workspaces, documents, permissions, analytics — the only service the browser talks to |
| `ai-service/` | Python + FastAPI | extraction, chunking, embeddings, retrieval, RAG, summarisation |
| Postgres 17 | + pgvector | relational data and embeddings in one database |

Deployed as: Postgres on **Neon**, file storage on **Supabase Storage**
(S3-compatible), both services on **Render**, client on **Vercel**.

### How a question gets answered

```
Browser ──► Node ──────────────────────────────► Python ──► Postgres
            1. verify JWT                        5. rewrite follow-up into
            2. resolve workspace membership         a standalone question
            3. compute allowed_document_ids      6. embed it
               within that workspace             7. vector search,
            4. forward question, history            filtered to allowed ids
               and allowed ids                   8. build prompt from top-k
                                                 9. stream the answer back
           11. persist both turns + audit  ◄──── 10. sources, once complete
```

**Steps 2 and 3 are the part that matters.** Filtering after retrieval would
already have placed restricted text in front of the model. See
`server/src/services/permission.service.js` and
`ai-service/app/core/retriever.py`.

The AI service derives no permissions of its own. It sits behind a shared
`X-Internal-Key` header and should never be exposed publicly.

---

## Permissions

Two boundaries, always in this order.

**Workspace membership** decides whether anything else is considered. A
non-member gets a 404 rather than a 403: someone outside a workspace
shouldn't learn that it exists.

**Role within that workspace** decides what they may do:

| Role | Can |
|---|---|
| `owner` | everything, plus manage members, transfer ownership, delete the workspace |
| `admin` | manage documents, share, invite people |
| `member` | upload, ask, manage their own documents |
| `viewer` | read and ask only |

A workspace is a shared room: every member reads every document in it, so a
teacher uploads notes once rather than sharing them with thirty students.
Per-document shares are additive — they grant `edit`, `download` or `admin`
beyond the default `view`. Anything that must not be seen belongs in a
different workspace.

### Tested, not asserted

```bash
cd server && npm test        # 16 passing
```

**`tests/isolation.test.js`** — the boundary between workspaces, which is the
catastrophic failure mode:

| Scenario | Expected |
|---|---|
| New signup | gets their own workspace, owned by them |
| Another workspace's documents — list | hidden |
| Another workspace's documents — question endpoint | never enter the search scope |
| Another workspace's document — direct `GET /documents/:id` | 403, not merely unlisted |
| Creating a session in a workspace you aren't in | refused |
| Being an owner elsewhere | grants nothing here |
| After accepting an invite | the documents become reachable |

**`tests/permissions.test.js`** — roles inside one workspace, the everyday
failure mode: viewers can't upload, members can't delete someone else's work,
owners administer everything, and sharing outside the workspace is refused.

The tests assert on the document ID list handed to retrieval, because that
list *is* the boundary. The AI client is substituted through `setAiClient()`
rather than mocked — Node's `mock.method` cannot redefine ES module exports,
and a test that calls a live model would be slow, flaky and quota-bound. No
test dependencies are installed; the suite runs on Node's built-in runner.

---

## Running it locally

**Requirements:** Node 20+, Python **3.12**, PostgreSQL 17 with pgvector,
and a Gemini API key (free tier works — [aistudio.google.com](https://aistudio.google.com)).

> Python 3.12 specifically. Several pinned dependencies (`psycopg-binary`,
> `pydantic`, `tiktoken`) have no prebuilt wheels for 3.13+ at these versions
> and fail to install.

### 1. Database

**With Docker** (includes pgvector, runs migrations on first boot):

```bash
docker compose -f infra/docker-compose.yml up -d postgres
```

**Without Docker, on Windows:** the EDB PostgreSQL installer does *not*
include pgvector. Install PostgreSQL 17, then add a prebuilt pgvector build
matching your major version (e.g. from
[andreiramani/pgvector_pgsql_windows](https://github.com/andreiramani/pgvector_pgsql_windows)),
or compile it from source with the Visual Studio C++ build tools. Then:

```bash
psql -U postgres -c "CREATE DATABASE document_ai;"
psql -U postgres -d document_ai -c "CREATE EXTENSION vector;"
psql -U postgres -d document_ai -f infra/migrations/001_init.sql
psql -U postgres -d document_ai -f infra/migrations/002_workspaces.sql
psql -U postgres -d document_ai -f infra/migrations/003_migrate_to_workspaces.sql
```

Migration 003 moves any existing single-tenant data into one workspace and
drops the old global `role` and `department` columns. On an empty database it
prints harmless notices about there being nothing to migrate.

Verify with `\dt` — 13 tables, including `workspaces` and `document_chunks`.

### 2. Configuration

```bash
cp server/.env.example server/.env
cp ai-service/.env.example ai-service/.env
cp client/.env.example client/.env
```

`INTERNAL_API_KEY` must be identical in `server/.env` and `ai-service/.env`.
Set `JWT_SECRET`, `DATABASE_URL`, and your Gemini key — see
[Configuration](#configuration).

### 3. Services (one terminal each)

```bash
# AI service — :8000
cd ai-service
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# API — :4000
cd server
npm install
npm run seed
npm run dev

# Client — :5173
cd client
npm install
npm run dev
```

`npm run seed` creates a **Physics 101** workspace with one account per role,
all with password `password123`:

| Account | Role |
|---|---|
| `teacher@demo.test` | owner |
| `assistant@demo.test` | admin |
| `student@demo.test` | member |
| `guest@demo.test` | viewer |

Each also owns a personal workspace, which is a quick way to see isolation:
switch to it and the documents disappear.

### 4. Check it works

```bash
curl localhost:4000/health   # {"status":"ok","database":"ok","ai_service":"ok"}
cd server && npm test        # 16 passing
```

The health check reports each dependency separately, so a failed question can
be traced to the database or the AI service without reading three terminals.

---

## Configuration

`ai-service/.env`

| Variable | Value used | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Gemini key | name is historical; holds any OpenAI-compatible provider's key |
| `OPENAI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai/` | omit to use OpenAI directly |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | |
| `EMBEDDING_DIM` | `1536` | must match `VECTOR(n)` in the migration |
| `LLM_MODEL` | `gemini-3.1-flash-lite` | used for answers and for rewriting follow-ups |
| `TOP_K` | `5` | passages retrieved per question |
| `SIMILARITY_THRESHOLD` | `0.35` | cosine floor; below it, the LLM isn't called |
| `CHUNK_TOKENS` / `CHUNK_OVERLAP` | `600` / `80` | |

Storage, in both services:

| Variable | Value | Notes |
|---|---|---|
| `STORAGE_DRIVER` | `local` or `s3` | |
| `S3_ENDPOINT` | provider URL | set for anything that isn't AWS — Supabase, R2, MinIO |
| `AWS_S3_BUCKET` / `AWS_REGION` | | |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | | |

`server/.env` also takes `TRUST_PROXY=true` when deployed behind a proxy, and
`CLIENT_ORIGIN` as a comma-separated list of allowed origins.

---

## Engineering notes

**Workspace membership is checked before role, always.** `getPermissionLevel`
reads the workspace from the *document row*, not from anything the client
sends, so naming a workspace you happen to belong to can't reach a document
in another. `getAccessibleDocumentIds` returns an empty list for a
non-member, so a caller that forgets to check membership still leaks nothing.
Sharing is refused outside the workspace, because a document permission
granted to a non-member would be a path straight around the boundary.

**The token carries no role.** Roles are per-workspace and can be changed or
revoked at any moment; a role baked into a week-long JWT would outlive the
membership it describes. Membership is read from the database on every
request instead.

**Streaming without losing the error path.** An HTTP status code is committed
with the first byte of a response, so a stream that has already started can't
become a 500. Retrieval and rewriting therefore run *before* the response
begins — a database failure or permission error still returns a normal JSON
error with the right status. Only generation is streamed, and failures after
that point arrive as an `error` event inside the stream.

**Sources are sent last, not first.** When the model declines to answer, the
citations are dropped — but that can only be known once the full answer is
in. Sending sources up front would attach citations to a refusal.

**Follow-up questions are rewritten, not appended.** Vector search can't
match "tell me more about this" — those words mean nothing without the
conversation. The last six turns are used for one purpose only: rewriting the
latest message into a standalone question, which is then embedded, searched
and answered. The permission filter is untouched, the history comes from the
user's own verified session, and a failed rewrite falls back to the original
question rather than failing the request.

**Theming is a data problem, not a CSS problem.** Every colour already
resolved through a CSS variable, so adding two themes meant adding two
`[data-theme]` blocks rather than editing rules. Three hardcoded values — a
button hover, button text, and the search highlight — had to be lifted into
variables first; they were the only places the abstraction leaked.

**Retry is atomic.** `markProcessing` moves a document from `failed` back to
`processing` with the status check inside the `UPDATE` itself, so two
simultaneous retries can't both start ingestion.

**Keeping 1536 dimensions under pgvector's index limit.** `gemini-embedding-001`
returns 3072-dimensional vectors by default, but pgvector's HNSW index supports
at most 2000. The service requests reduced-dimension output
(`dimensions=1536`), which the model supports natively, so the schema and
index stay as they are.

**One storage interface, any S3-compatible provider.** Setting `S3_ENDPOINT`
and path-style addressing points the same code at Supabase Storage,
Cloudflare R2 or MinIO. Both services share the key format, so Node writes
and Python reads without either knowing where the bytes live.

**HNSW, not IVFFlat.** IVFFlat needs training data to build a good index and
would be created on an empty table. HNSW works from the first row.

**Buffering at every stream boundary.** Network chunks don't align with event
boundaries, so both the Node client and the browser buffer incoming text and
parse only complete events. Skipping this works on localhost and fails on a
slow connection.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `relation "document_chunks" does not exist` | pgvector missing; migration skipped the one table using `VECTOR` | install pgvector, `CREATE EXTENSION vector;`, re-run the migration |
| `Client.__init__() got an unexpected keyword argument 'proxies'` | `openai==1.35.0` with httpx ≥ 0.28 | `pip install "httpx<0.28"` (already pinned) |
| `No matching distribution found for psycopg-binary` | Python 3.13+ | use Python 3.12 |
| `models/... is not found for API version` | retired model name | list available models with `client.models.list()` |
| `TypeError: Cannot redefine property` in tests | ES module exports can't be mocked | inject the dependency instead (`setAiClient`) |
| `NoSuchBucket` on upload | bucket name doesn't match `AWS_S3_BUCKET` | check the exact name in the provider's dashboard |
| CORS error naming two near-identical origins | trailing slash on `CLIENT_ORIGIN` | origins are compared as exact strings |
| Deployed frontend calls `localhost` | Vite bakes env vars at build time | set the variable, then **redeploy** |

---

## Known limitations

- **The demo sleeps.** The API and AI service run on Render's free tier and
  spin down after 15 minutes idle, so the first request after a quiet period
  takes up to a minute. The frontend itself is always up.
- **No password reset.** Needs an email service.
- **No private documents within a workspace.** Everyone in a workspace reads
  everything in it; privacy means a separate workspace.
- **Rate limits are per instance, in memory.** Running more than one process
  would need Redis.
- **Background tasks aren't durable.** A restart mid-ingestion leaves the
  document in `processing`, though it can be retried from the UI.
- **Free-tier data terms.** On Gemini's free tier, inputs may be used to
  improve Google's models — fine for test documents, not for real private data.
- **Tests cover permissions only.** Ingestion, chunking and retrieval quality
  are untested.

## Worth building next

Password reset · nested folders · bulk document actions · a durable job queue
(BullMQ / Celery) · tests for ingestion and chunking · automatic tagging at
ingest time · per-workspace usage limits.