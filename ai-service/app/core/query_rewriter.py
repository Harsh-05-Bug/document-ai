import logging

from openai import OpenAI

from app.config import OPENAI_API_KEY, OPENAI_BASE_URL, LLM_MODEL

log = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

# Only recent context matters for resolving "it" and "this", and a short
# transcript keeps the extra call fast and cheap.
MAX_TURNS = 6
MAX_CHARS_PER_TURN = 600

REWRITE_PROMPT = """You rewrite follow-up questions so they can be understood without the conversation.

Given a conversation and the user's latest message, return one standalone question that names every subject the latest message refers to. Replace words like "it", "this", "that" and "more" with what they point to.

Rules:
- If the latest message already makes sense on its own, return it unchanged.
- Do not answer the question.
- Do not add facts or details that aren't in the conversation.
- Return only the question. No preamble, no quotes.
"""


def rewrite_question(question: str, history: list[dict]) -> str:
    """
    Turn a follow-up like "tell me more about this" into a standalone
    question the vector search can actually match.

    If there is no history, or the rewrite fails for any reason, the
    original question is returned unchanged: memory is an improvement,
    never a new way for a question to fail.
    """
    if not history:
        return question

    turns = history[-MAX_TURNS:]
    transcript = "\n".join(
        f"{turn['role'].capitalize()}: {turn['content'][:MAX_CHARS_PER_TURN]}"
        for turn in turns
    )

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0,
            messages=[
                {"role": "system", "content": REWRITE_PROMPT},
                {
                    "role": "user",
                    "content": f"Conversation:\n{transcript}\n\nLatest message: {question}",
                },
            ],
        )
        rewritten = (response.choices[0].message.content or "").strip().strip('"')
    except Exception:
        log.exception("Question rewrite failed; searching with the original question")
        return question

    if not rewritten:
        return question

    log.info("Rewrote %r -> %r", question, rewritten)
    return rewritten