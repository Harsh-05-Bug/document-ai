"""Paragraph-aware chunking.

Cutting purely on a token count splits sentences in half and produces
chunks that embed badly. This packs whole paragraphs up to the budget
and only falls back to a hard token split for a paragraph that is
itself oversized (a long table, say).
"""
import tiktoken

from app.config import CHUNK_TOKENS, CHUNK_OVERLAP

encoding = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(encoding.encode(text))


def _split_oversized(text: str, size: int, overlap: int) -> list[str]:
    tokens = encoding.encode(text)
    pieces, start = [], 0
    while start < len(tokens):
        end = min(start + size, len(tokens))
        pieces.append(encoding.decode(tokens[start:end]))
        if end == len(tokens):
            break
        start = end - overlap
    return pieces


def chunk_text(text: str, size: int = CHUNK_TOKENS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buffer: list[str] = []
    buffer_tokens = 0

    for paragraph in paragraphs:
        tokens = count_tokens(paragraph)

        if tokens > size:
            if buffer:
                chunks.append("\n\n".join(buffer))
                buffer, buffer_tokens = [], 0
            chunks.extend(_split_oversized(paragraph, size, overlap))
            continue

        if buffer_tokens + tokens > size:
            chunks.append("\n\n".join(buffer))
            # Carry the last paragraph forward so context isn't severed
            # exactly at the boundary.
            tail = buffer[-1] if count_tokens(buffer[-1]) <= overlap else ""
            buffer = [tail] if tail else []
            buffer_tokens = count_tokens(tail) if tail else 0

        buffer.append(paragraph)
        buffer_tokens += tokens

    if buffer:
        chunks.append("\n\n".join(buffer))

    return [c for c in chunks if c.strip()]


def chunk_pages(pages: list[dict]) -> list[dict]:
    """[{page_number, text}] -> [{page_number, chunk_index, content, token_count}]"""
    result = []
    index = 0
    for page in pages:
        for content in chunk_text(page["text"]):
            result.append({
                "page_number": page["page_number"],
                "chunk_index": index,
                "content": content,
                "token_count": count_tokens(content),
            })
            index += 1
    return result
