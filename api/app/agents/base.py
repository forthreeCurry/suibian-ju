"""AI Agent 基类：LLM 调用、JSON 解析、降级控制。"""

from __future__ import annotations

import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Ollama 连接
_ollama_available: bool | None = None
_llm: Any = None  # ChatOllama instance

LLM_TIMEOUT_SEC = 30


def _try_init_ollama(ollama_host: str, model: str = "qwen2.5:7b") -> Any:
    """尝试初始化 Ollama LLM 连接。返回 ChatOllama 实例或 None。"""
    global _ollama_available, _llm
    if _ollama_available is not None:
        return _llm

    # 未启用 Ollama 时直接降级，避免导入 langchain_ollama（约 10s）和 CPU 推理耗时
    import os as _os
    if _os.getenv("OLLAMA_ENABLED", "").lower() != "true":
        logger.info("OLLAMA_ENABLED 未设置为 true，Agent 使用降级方案")
        _ollama_available = False
        _llm = None
        return None

    try:
        # 先快速检测 Ollama 是否可达（避免昂贵的 langchain_ollama 导入）
        import requests as _req
        try:
            _req.get(f"{ollama_host}/api/tags", timeout=2)
        except Exception:
            logger.warning("Ollama 服务不可达 (%s)，Agent 将使用降级方案", ollama_host)
            _ollama_available = False
            _llm = None
            return None

        # Ollama 可达才导入 langchain_ollama（导入耗时约 10s）
        from langchain_ollama import ChatOllama
        llm = ChatOllama(
            model=model,
            base_url=ollama_host,
            temperature=0,
            format="json",
            timeout=10,
        )
        _ollama_available = True
        _llm = llm
        logger.info("Ollama (%s) 已就绪，模型=%s", ollama_host, model)
        return llm
    except Exception as e:
        logger.warning("Ollama 初始化异常（%s: %s），Agent 将使用降级方案", type(e).__name__, e)
        _ollama_available = False
        _llm = None
        return None


def is_llm_available() -> bool:
    return _ollama_available is True and _llm is not None


class BaseAgent(ABC):
    """所有 Agent 的基类。"""

    prompt_template: str = ""

    def __init__(self, ollama_host: str = "http://localhost:11434", model: str = "qwen2.5:7b") -> None:
        self._ollama_host = ollama_host
        self._model = model
        self._llm = _try_init_ollama(ollama_host, model)
        self._use_fallback = self._llm is None

    # ---- 子类必须实现 ----
    @abstractmethod
    def invoke(self, *args: Any, **kwargs: Any) -> Any:
        """Agent 主入口。"""
        ...

    # ---- LLM 辅助 ----
    def _try_llm(self, prompt: str) -> str | None:
        """调用 LLM，失败时返回 None。"""
        if self._llm is None:
            return None
        try:
            from langchain_core.messages import HumanMessage
            resp = self._llm.invoke([HumanMessage(content=prompt)])
            content = getattr(resp, "content", str(resp))
            return str(content).strip()
        except Exception as e:
            logger.warning("LLM 调用失败: %s", e)
            return None

    @staticmethod
    def _parse_json_output(raw: str, model_cls: type[T]) -> T | None:
        """从 LLM 原始输出中提取 JSON 并解析为 Pydantic 模型。"""
        if not raw:
            return None

        # 尝试直接解析整个输出
        candidates = [raw]

        # 尝试提取 ```json ... ``` 代码块
        code_blocks = re.findall(r"```(?:json)?\s*([\s\S]*?)```", raw)
        candidates.extend(code_blocks)

        # 尝试提取第一个 { 和最后一个 } 之间的内容
        obj_match = re.search(r"\{[\s\S]*\}", raw)
        if obj_match:
            candidates.append(obj_match.group(0))

        for c in candidates:
            c = c.strip()
            if not c:
                continue
            try:
                data = json.loads(c)
                return model_cls.model_validate(data)
            except (json.JSONDecodeError, ValueError):
                continue

        logger.warning("无法从 LLM 输出解析 JSON: %s", raw[:300])
        return None

    def _llm_or_fallback(
        self,
        prompt: str,
        output_model: type[T],
        fallback_fn: Any,
    ) -> T:
        """尝试 LLM → 解析 JSON → 失败则降级。"""
        raw = self._try_llm(prompt)
        if raw:
            parsed = self._parse_json_output(raw, output_model)
            if parsed is not None:
                return parsed
        # 降级
        if callable(fallback_fn):
            return fallback_fn()
        return fallback_fn
