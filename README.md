# document-ai

A document knowledge base you can ask questions of. Upload PDFs, Word files
and spreadsheets; they're split into passages, embedded, and stored in
Postgres with pgvector. Questions are answered from the retrieved passages
only, with the file and page shown alongside every answer.

Three services:

| Service | Stack | Responsibility |
|---|---|---|
| `client/` | React + Vite | UI |
| `server/` | Node + Express | auth, documents, permissions, analytics — the only service the browser talks to |
| `ai-service/` | Python + FastAPI | extraction, chunking, embeddings, retrieval, RAG, summarisation |

Data lives in one Postgres database (pgvector for the embeddings). Files go
to S3 in production, or a local directory in development.

---

## Running it

You need Docker (for Postgres with pgvector), Node 20+, Python 3.11+, and an
OpenAI API key.

```bash
# 1. secrets — the internal key must be identical in both files
cp server/.env.example server/.env
cp ai-service/.env.example ai-service/.env
cp client/.env.example client/.env

KEY=$(openssl rand -hex 32)
# put $KEY in INTERNAL_API_KEY in both server/.env and ai-service/.env,
# set JWT_SECRET in server/.env and OPENAI_API_KEY in ai-service/.env

# 2. database (runs infra/migrations on first boot)
docker compose -f infra/docker-compose.yml up -d postgres

# 3. services
cd server     && npm install && npm run seed && npm run dev   # :4000
cd ai-service && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
cd client     && npm install && npm run dev                   # :5173
```

`npm run seed` creates one account per role, all with password `password123`:
`admin@acme.test`, `manager@acme.test`, `emp@acme.test`.

Or run the whole backend in containers:

```bash
docker compose -f infra/docker-compose.yml up --build
```

### Checking it works

```bash
curl localhost:4000/health          # {"status":"ok","database":"ok"}
curl localhost:8000/health

TOKEN=$(curl -s localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@acme.test","password":"password123"}' | jq -r .token)

curl -s localhost:4000/api/documents -H "Authorization: Bearer $TOKEN" | jq
```

---

## How a question gets answered

```
Browser ──► Node ──────────────────────────────► Python ──► Postgres
            1. verify JWT                        4. embed question
            2. compute allowed_document_ids      5. vector search,
               from role + explicit shares           filtered to allowed ids
            3. forward question + that list      6. build prompt from top-k
                                                 7. call LLM
            9. persist both turns + audit  ◄──── 8. answer + structured sources
```

**Step 2 is the part that matters.** The allow-list is computed server-side
and applied inside the SQL `WHERE` clause, so a document you can't read is
never ranked, never enters the prompt, and can't leak through the model's
wording. Filtering afterwards would already have put the text in front of the
model. See `server/src/services/permission.service.js` and
`ai-service/app/core/retriever.py`.

The AI service derives no permissions of its own. It sits behind a shared
`X-Internal-Key` and should never be exposed to the internet.

### Grounding

`SIMILARITY_THRESHOLD` sets a floor on cosine similarity. If nothing clears
it, the LLM is never called and the answer is "I couldn't find this in your
documents." The UI renders that differently from a real answer, and the
dashboard counts how often it happens — which is a measurable handle on
hallucination rather than a claim.

---

## Permissions

| Role | Sees |
|---|---|
| `admin` | every document |
| `manager` | own documents, documents shared with them, and their department's |
| `employee` | own documents and documents shared with them |

Per-document shares add `view`, `comment`, `download`, `edit` or `admin`, and
the strongest applicable level wins. Every `/api/documents/:id` route runs
`requireDocumentPermission(...)` before the handler, so authorisation isn't
something the React app can skip.

---

## API

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
GET    /api/auth/users

POST   /api/documents                     multipart upload
GET    /api/documents                     ?folderId= &status= &tag=
GET    /api/documents/:id
GET    /api/documents/:id/status          processing | ready | failed
GET    /api/documents/:id/download
POST   /api/documents/:id/summary         ?refresh=1
PATCH  /api/documents/:id/folder
POST   /api/documents/:id/tags
DELETE /api/documents/:id
POST   /api/documents/:id/share
GET    /api/documents/:id/permissions
DELETE /api/documents/:id/permissions/:userId

GET    /api/folders          POST /api/folders          DELETE /api/folders/:id

GET    /api/search?q=              keyword: filename, category, chunk full-text
GET    /api/search/semantic?q=     vector similarity
GET    /api/search/hybrid?q=       both, merged by reciprocal rank fusion

GET    /api/chat/sessions          POST /api/chat/sessions
GET    /api/chat/sessions/:id
POST   /api/chat/sessions/:id/messages

GET    /api/analytics/overview

# internal, Node -> Python only, requires X-Internal-Key
POST   /internal/ingest  /internal/query  /internal/search  /internal/summarize
```

---

## Notes on the implementation

**Ingestion is asynchronous.** `/internal/ingest` returns immediately and
processes in a background task, so a 200-page PDF doesn't hold an HTTP
connection open. The document row carries `status` and the client polls
`/status`. For a real deployment, swap the background task for a proper queue
(Celery, RQ, BullMQ) so work survives a restart.

**Chunking is paragraph-aware.** Cutting on a raw token count splits
sentences and produces chunks that embed badly, so `chunking.py` packs whole
paragraphs up to the token budget and only hard-splits a paragraph that is
itself oversized.

**Citations are structural.** Sources are built from the chunks that were
actually retrieved, not parsed out of the model's prose, so a citation can't
point at something that wasn't in the context.

**HNSW, not IVFFlat.** IVFFlat needs training data to build a good index and
you'd be creating it on an empty table. HNSW works from the first row.

**Embedding dimension is checked at runtime.** Switch embedding models and
`embeddings.py` fails loudly instead of writing wrong-sized vectors — the
`VECTOR(1536)` column in the migration has to change with it.

**OCR is optional.** If a PDF page has no text layer, extraction tries
`pytesseract` + `pdf2image` and skips the page if they aren't installed. Add
them plus the `tesseract-ocr` and `poppler-utils` system packages to turn it on.

## Worth building next

Streaming answers (SSE) · a real job queue · automatic tagging and category
assignment at ingest time · conversation memory so follow-up questions resolve
"it" and "that policy" · document version history · rate limiting on the
question endpoint, since every question costs an embedding plus a completion.
