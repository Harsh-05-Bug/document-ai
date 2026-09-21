import logging
from typing import Iterator

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_BASE_URL, LLM_MODEL

log = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

SYSTEM_PROMPT = """You answer questions about a company's internal documents.

Rules:
- Use ONLY the numbered context passages provided. Never use outside knowledge.
- If the passages don't contain the answer, say exactly: "I couldn't find this in your documents." Do not guess or fill gaps.
- Cite the passage number in square brackets after each claim, like [2].
- Quote figures, dates and policy terms exactly as they appear.

Length and format:
- Match the depth of the question. A simple factual question gets one or two sentences.
- If the user asks to explain, describe, or give details, write a fuller answer that uses everything relevant in the passages.
- When there are several distinct points, use a short markdown bullet list.
- Never pad the answer with information that isn't in the passages. A short grounded answer is better than a long invented one.
"""

NO_ANSWER = "I couldn't find this in your documents."


def _format_context(chunks: list[dict]) -> str:
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        location = f"page {chunk['page_number']}" if chunk["page_number"] else "no page number"
        blocks.append(f"[{i}] {chunk['filename']} ({location})\n{chunk['content']}")
    return "\n\n---\n\n".join(blocks)


def _answer_messages(question: str, chunks: list[dict]) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Context passages:\n\n{_format_context(chunks)}\n\nQuestion: {question}",
        },
    ]


def build_sources(chunks: list[dict]) -> list[dict]:
    """
    Sources are built from the retrieved chunks, not parsed out of the
    model's prose, so a citation can never point at a document that
    wasn't actually retrieved.
    """
    return [
        {
            "index": i,
            "document_id": chunk["document_id"],
            "filename": chunk["filename"],
            "page": chunk["page_number"],
            "snippet": chunk["content"][:300].strip(),
            "similarity": round(chunk["similarity"], 3),
        }
        for i, chunk in enumerate(chunks, start=1)
    ]


def generate_answer(question: str, chunks: list[dict]) -> tuple[str, list[dict]]:
    """Returns (answer, sources) in one call. Used by the non-streaming endpoint."""
    if not chunks:
        return NO_ANSWER, []

    completion = client.chat.completions.create(
        model=LLM_MODEL,
        temperature=0,
        messages=_answer_messages(question, chunks),
    )
    answer = (completion.choices[0].message.content or "").strip()

    # If the model declined, don't attach citations to a non-answer.
    if answer.startswith(NO_ANSWER):
        return NO_ANSWER, []

    return answer, build_sources(chunks)


def stream_answer(question: str, chunks: list[dict]) -> Iterator[str]:
    """
    Yields the answer a piece at a time as the model writes it.
    The caller decides afterwards whether sources apply, because that
    depends on the complete answer.
    """
    stream = client.chat.completions.create(
        model=LLM_MODEL,
        temperature=0,
        messages=_answer_messages(question, chunks),
        stream=True,
    )
    for event in stream:
        if not event.choices:
            continue
        text = event.choices[0].delta.content
        if text:
            yield text


def summarize_chunks(filename: str, chunks: list[str]) -> str:
    """
    Map-reduce summary: summarise batches, then summarise the summaries.
    Keeps long documents inside the context window without truncating
    them to the first few pages.
    """
    if not chunks:
        return "This document has no extractable text to summarise."

    BATCH = 12
    partials = []
    for start in range(0, len(chunks), BATCH):
        batch = "\n\n".join(chunks[start : start + BATCH])
        response = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": "Summarise this section factually in 3-5 bullet points. No preamble."},
                {"role": "user", "content": batch},
            ],
        )
        partials.append(response.choices[0].message.content or "")

    if len(partials) == 1:
        combined = partials[0]
    else:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": "Merge these section notes into one summary. Remove repetition."},
                {"role": "user", "content": "\n\n".join(partials)},
            ],
        )
        combined = response.choices[0].message.content or ""

    final = client.chat.completions.create(
        model=LLM_MODEL,
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": (
                    "Write the final summary of a document using these notes. "
                    "Use these headings, and drop any heading with nothing to say: "
                    "Purpose, Key points, Important dates, Requirements, Conclusion."
                ),
            },
            {"role": "user", "content": f"Document: {filename}\n\nNotes:\n{combined}"},
        ],
    )
    return (final.choices[0].message.content or "").strip()