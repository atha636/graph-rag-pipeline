import json
import re
from typing import Any


def extract_json(text: str) -> Any:
    """
    Robustly parse JSON from an LLM response.

    LLMs frequently wrap their JSON output in markdown code fences:

        ```json
        ["SpaceX", "Elon Musk"]
        ```

    or just plain backticks:

        ```
        [{"source": "A", "relationship": "FOUNDED", "target": "B"}]
        ```

    A bare json.loads(content) call crashes on all of these.
    This helper strips fences, finds the first valid JSON
    array or object, and returns the parsed value.

    Raises json.JSONDecodeError if nothing parseable is found.
    """

    # 1. Strip surrounding whitespace.
    text = text.strip()

    # 2. Remove ```json ... ``` or ``` ... ``` fences.
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # 3. Try to parse the cleaned text directly.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 4. Fallback: find the first [...] or {...} block in the string.
    #    This handles cases where the LLM adds prose before/after the JSON.
    for pattern in (r"(\[.*?\])", r"(\{.*?\})"):
        match = re.search(pattern, text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue

    # 5. Nothing worked — raise so callers can handle gracefully.
    raise json.JSONDecodeError(
        f"No valid JSON found in LLM output: {text[:200]}", text, 0
    )