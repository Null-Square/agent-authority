#!/usr/bin/env python3
"""DeepSeek V4 thinking-mode transport bridge for pinned AgentDojo.

AgentDojo 0.1.35 predates DeepSeek V4 thinking-mode tool-call semantics. The
benchmark preserves assistant tool calls but drops DeepSeek's
`reasoning_content`. DeepSeek requires that reasoning content to be replayed on
all subsequent requests after a thinking-mode tool call.

This module repairs only the wire representation. It does not change prompts,
tools, model outputs, provider state, task contracts, or authorization
semantics.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def _tool_call_id(value: Any) -> str | None:
    if isinstance(value, Mapping):
        raw = value.get("id")
    else:
        raw = getattr(value, "id", None)
    return str(raw) if raw else None


def _reasoning_content(message: Any) -> str | None:
    raw = getattr(message, "reasoning_content", None)
    if raw is None:
        extra = getattr(message, "model_extra", None) or {}
        if isinstance(extra, Mapping):
            raw = extra.get("reasoning_content")
    return str(raw) if raw else None


class DeepSeekThinkingCompletionsAdapter:
    """Preserve DeepSeek thinking state across AgentDojo tool turns."""

    def __init__(self, inner):
        self._inner = inner
        self._reasoning_by_tool_call_id: dict[str, str] = {}

    def create(self, *args, **kwargs):
        messages = kwargs.get("messages")
        if messages is not None:
            adapted = []
            for message in messages:
                copied = dict(message)
                if copied.get("role") == "developer":
                    copied["role"] = "system"

                # AgentDojo serializes prior assistant tool calls but omits the
                # DeepSeek-specific reasoning_content field. Reattach the exact
                # reasoning string that DeepSeek returned for that tool turn.
                if copied.get("role") == "assistant" and copied.get("tool_calls"):
                    ids = [_tool_call_id(call) for call in copied.get("tool_calls") or []]
                    recovered = {
                        self._reasoning_by_tool_call_id[tool_id]
                        for tool_id in ids
                        if tool_id and tool_id in self._reasoning_by_tool_call_id
                    }
                    if len(recovered) == 1:
                        copied["reasoning_content"] = next(iter(recovered))
                    elif len(recovered) > 1:
                        raise RuntimeError("conflicting DeepSeek reasoning state for one assistant tool turn")
                adapted.append(copied)
            kwargs["messages"] = adapted

        # Make the preregistered primary model mode explicit. These are the
        # documented defaults for V4 Pro, but pinning them avoids drift.
        extra_body = dict(kwargs.get("extra_body") or {})
        extra_body.setdefault("thinking", {"type": "enabled"})
        kwargs["extra_body"] = extra_body
        if not isinstance(kwargs.get("reasoning_effort"), str):
            kwargs["reasoning_effort"] = "high"

        response = self._inner.create(*args, **kwargs)
        for choice in getattr(response, "choices", []) or []:
            assistant = getattr(choice, "message", None)
            if assistant is None:
                continue
            reasoning = _reasoning_content(assistant)
            if not reasoning:
                continue
            for tool_call in getattr(assistant, "tool_calls", None) or []:
                tool_id = _tool_call_id(tool_call)
                if tool_id:
                    self._reasoning_by_tool_call_id[tool_id] = reasoning
        return response


class _ChatAdapter:
    def __init__(self, inner):
        self.completions = DeepSeekThinkingCompletionsAdapter(inner.completions)


class DeepSeekThinkingClientAdapter:
    def __init__(self, inner):
        self.chat = _ChatAdapter(inner.chat)
