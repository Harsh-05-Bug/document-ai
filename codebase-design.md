# Codebase Design — AI Document Knowledge Platform

Scope: MVP through Version 3 (auth → RAG → security). Folders/sharing/analytics are noted but kept thin until the core is solid.

---

## 1. High-Level Folder Structure

```
document-ai/
├── client/                        # React frontend
│   ├── src/
│   │   ├── api/                   # axios instances + endpoint wrappers
│   │   │   ├── axiosClient.js
│   │   │   ├── auth.api.js
│   │   │   ├── documents.api.js
│   │   │   └── chat.api.js
│   │   ├── components/
│   │   │   ├── upload/DocumentUpload.jsx
│   │   │   ├── documents/DocumentCard.jsx
│   │   │   ├── documents/DocumentViewer.jsx
│   │   │   ├── search/SearchBar.jsx
│   │   │   ├── chat/ChatAssistant.jsx
│   │   │   ├── chat/SourceCitation.jsx
│   │   │   └── common/ (Button, Modal, Toast, ProtectedRoute)
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── DocumentsPage.jsx
│   │   │   └── DocumentDetailPage.jsx
│   │   ├── context/AuthContext.jsx
│   │   ├── hooks/useAuth.js, useDocuments.js
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
│
├── server/                        # Node/Express — the "control plane"
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── documents.routes.js
│   │   │   ├── folders.routes.js
│   │   │   ├── chat.routes.js
│   │   │   ├── sharing.routes.js
│   │   │   └── analytics.routes.js
│   │   ├── controllers/           # thin — validate input, call services
│   │   ├── services/              # business logic, DB queries live here
│   │   │   ├── auth.service.js
│   │   │   ├── document.service.js
│   │   │   ├── permission.service.js
│   │   │   └── aiClient.service.js   # calls the Python FastAPI service
│   │   ├── middleware/
│   │   │   ├── authenticate.js    # verifies JWT
│   │   │   ├── authorize.js       # role/permission checks
│   │   │   └── errorHandler.js
│   │   ├── models/                # DB access layer (raw SQL or an ORM)
│   │   ├── db/pool.js
│   │   ├── config/env.js
│   │   └── server.js
│   └── package.json
│
├── ai-service/                    # Python/FastAPI — the "AI plane"
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── ingest.py          # extract + chunk + embed a document
│   │   │   ├── query.py           # RAG question answering
│   │   │   └── summarize.py
│   │   ├── core/
│   │   │   ├── extraction.py      # PDF/DOCX/TXT/CSV text extraction
│   │   │   ├── chunking.py
│   │   │   ├── embeddings.py      # calls embedding model
│   │   │   ├── retriever.py       # pgvector similarity search
│   │   │   └── rag_chain.py       # prompt assembly + LLM call
│   │   ├── db/pgvector_client.py
│   │   ├── schemas/               # pydantic request/response models
│   │   └── config.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── infra/
│   ├── docker-compose.yml         # postgres+pgvector, node, fastapi, client
│   └── migrations/                # SQL migration files
│
└── README.md
```

**Why split Node and Python at all instead of one backend?** Node is good at request handling, auth, and I/O-bound CRUD; Python has the mature ML/RAG ecosystem (LangChain/LlamaIndex, tokenizers, PDF libs). Node stays the single source of truth for authorization — it never lets the AI service touch data the user isn't allowed to see (see §4).

---

## 2. Database Schema (PostgreSQL + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','manager','employee')),
  department    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  parent_id  UUID REFERENCES folders(id),
  owner_id   UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID REFERENCES users(id),
  folder_id      UUID REFERENCES folders(id),
  filename       TEXT NOT NULL,
  storage_key    TEXT NOT NULL,       -- S3 object key
  mime_type      TEXT,
  size_bytes     BIGINT,
  status         TEXT DEFAULT 'processing', -- processing | ready | failed
  category       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE document_tags (
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  page_number INT,
  content     TEXT NOT NULL,
  embedding   VECTOR(1536),          -- dim depends on embedding model
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE document_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  permission   TEXT CHECK (permission IN ('view','comment','edit','download','admin')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  title      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT CHECK (role IN ('user','assistant')),
  content     TEXT NOT NULL,
  sources     JSONB,                 -- [{document_id, chunk_id, page}]
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,         -- 'document.view', 'document.delete', ...
  document_id UUID,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 3. API Surface

**Auth**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
```

**Documents**
```
POST   /api/documents               upload (multipart -> S3, enqueue processing)
GET    /api/documents                list (scoped to permissions)
GET    /api/documents/:id
DELETE /api/documents/:id
GET    /api/documents/:id/download
GET    /api/documents/:id/status     processing | ready | failed
```

**Folders / Tags**
```
POST /api/folders
GET  /api/folders
POST /api/documents/:id/tags
```

**Search & Chat**
```
GET  /api/search?q=...                       traditional (filename/tags/date)
POST /api/chat/sessions                      create session
POST /api/chat/sessions/:id/messages         ask a question -> proxies to ai-service
GET  /api/chat/sessions/:id                  history
```

**Sharing / Permissions**
```
POST   /api/documents/:id/share     { userId, permission }
GET    /api/documents/:id/permissions
DELETE /api/documents/:id/permissions/:userId
```

**Analytics**
```
GET /api/analytics/overview          totals, storage used
GET /api/analytics/top-documents
GET /api/analytics/top-questions
```

**Internal — Node → ai-service (not exposed to the client directly)**
```
POST /internal/ingest      { document_id, storage_key, mime_type }
POST /internal/query       { question, allowed_document_ids }
POST /internal/summarize   { document_id }
```

---

## 4. The Permission Boundary (important design decision)

The AI service must never run an unrestricted vector search. Node computes the caller's allowed document IDs first (from `document_permissions` + role), and passes that list into the ai-service query call. The retriever filters `WHERE document_id = ANY($allowed_ids)` before similarity ranking — permission filtering happens *before* retrieval, not as a post-filter on the LLM's answer.

```
Client → Node: POST /api/chat/sessions/:id/messages { question }
Node:
  1. authenticate(req)                       // who is this?
  2. allowedIds = permission.service
       .getAccessibleDocumentIds(userId)     // role + explicit shares
  3. POST ai-service/internal/query
       { question, allowed_document_ids: allowedIds }
ai-service:
  4. embed(question)
  5. SELECT chunks WHERE document_id = ANY(allowed_ids)
       ORDER BY embedding <=> query_vector LIMIT 5
  6. build prompt with retrieved chunks + question
  7. call LLM → answer
  8. return { answer, sources: [{document_id, page}] }
Node:
  9. log to chat_messages + audit_logs
  10. return to client
```

---

## 5. RAG Pipeline (ai-service internals)

**Ingestion** (`routers/ingest.py`)
```
1. Download file from S3 (storage_key)
2. extraction.py: get raw text (+ page numbers for PDFs)
3. chunking.py: split into ~500-800 token chunks, overlap ~50-100 tokens
   - prefer splitting on headings/paragraphs over hard token cuts
4. embeddings.py: batch-embed chunks
5. Bulk insert into document_chunks (content, embedding, page_number)
6. Update documents.status = 'ready' (or 'failed' + reason)
```

**Query** (`routers/query.py`)
```
1. embed(question)
2. retriever.py: cosine similarity search, filtered by allowed_document_ids
3. rag_chain.py:
   - assemble context from top-k chunks (dedupe by document)
   - system prompt instructs: "answer only from context; say you don't know
     if the answer isn't in the context; cite document + page"
   - call LLM
4. Return answer + structured sources array
```

**Guardrail worth implementing early:** if the top similarity score is below a threshold, skip the LLM call and return "I couldn't find this in your documents" — this is the concrete, demoable version of "reducing hallucinations."

---

## 6. Frontend State/Data Flow

```
AuthContext (JWT, user, role)
      │
      ▼
ProtectedRoute ── redirects to /login if no token
      │
      ▼
DashboardPage ── analytics widgets (GET /api/analytics/overview)
DocumentsPage ── list + upload + folders
      │
      ▼
DocumentDetailPage
   ├── DocumentViewer (preview)
   └── ChatAssistant
          ├── sends question → POST /chat/sessions/:id/messages
          ├── shows streaming/loading state ("Searching knowledge base…")
          └── renders SourceCitation per source in the response
```

Keep server state (documents, chat history) in a simple fetch/cache layer (React Query or hand-rolled hooks) rather than global Redux — this app doesn't need heavy client state.

---

## 7. Build Order (maps to the staged plan from before)

1. **Skeleton**: auth (Node) + empty ai-service health check + Postgres schema migrated.
2. **Ingestion path**: upload → S3 → ai-service `/ingest` → chunks in pgvector. Verify by querying chunks directly in SQL before wiring any UI.
3. **RAG path**: `/query` endpoint returning answer + sources for a hardcoded allowed-list. Test with curl before touching React.
4. **Chat UI**: wire ChatAssistant to the working endpoint.
5. **Permissions**: add `document_permissions`, wire `permission.service`, make `/query` respect `allowed_document_ids` for real.
6. **Folders/tags/sharing UI**, then **analytics**, then bonus features.

This order means you always have something runnable end-to-end, and the hardest part (RAG correctness) gets validated before you spend time on UI polish.
