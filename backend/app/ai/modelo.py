"""Configuração centralizada de modelos e provedores LLM com PydanticAI (GENAI-1).

Permite trocar de provedor (OpenRouter, Google Gemini API gratuita, OpenAI, Groq ou TestModel)
mudando apenas variáveis de ambiente (.env), sem alterar o código do agente de SQL (Théo)
nem do agente de insight (Luiz).

Como trocar de provedor no .env:
1. OpenRouter (padrão com API gratuita):
   OPENROUTER_API_KEY=sua-chave-openrouter
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   MODEL_NAME=nvidia/nemotron-3.5-lightning:free
2. Google Gemini Studio (gratuito):
   LLM_PROVIDER=google
   LLM_MODELO=gemini-2.5-flash-lite
   LLM_API_KEY=sua-chave-aqui
3. Qualquer API compatível com OpenAI (Groq, Together, local):
   LLM_PROVIDER=openai
   LLM_BASE_URL=https://api.groq.com/openai/v1
   LLM_MODELO=llama-3.3-70b-versatile
   LLM_API_KEY=sua-chave
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic_ai.models import Model
from pydantic_ai.models.google import GoogleModel, GoogleModelSettings
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.models.test import TestModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.settings import ModelSettings

# Carrega backend/.env automaticamente se existir (sem sobrescrever variáveis já definidas no ambiente)
_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_ENV_PATH, override=False)
os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

PerfilModelo = Literal["sql", "insight"]
ProvedorLLM = Literal["google", "google-gla", "openrouter", "openai", "groq", "test"]

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MODELO_PADRAO_OPENROUTER = "nvidia/nemotron-3.5-lightning:free"
MODELO_PADRAO_GOOGLE = "gemini-2.5-flash-lite"


class ConfiguracaoLLMError(RuntimeError):
    """Erro de configuração do modelo LLM (sempre sem expor valores de chaves)."""


def _ler_env(nome: str, padrao: str = "") -> str:
    valor = os.getenv(nome, "")
    return valor.strip() if valor else padrao


def obter_provedor_configurado() -> str:
    """Retorna o identificador normalizado do provedor LLM configurado no ambiente.

    Se `LLM_PROVIDER` não estiver explícito mas `OPENROUTER_API_KEY` estiver definida,
    assume automaticamente `openrouter`.
    """
    provedor_explicito = _ler_env("LLM_PROVIDER").lower()
    if provedor_explicito:
        provedor = provedor_explicito
    elif _ler_env("OPENROUTER_API_KEY"):
        provedor = "openrouter"
    else:
        provedor = "google"

    if provedor not in {"google", "google-gla", "openrouter", "openai", "groq", "test"}:
        raise ConfiguracaoLLMError(
            f"Provedor LLM não suportado: {provedor!r}. "
            "Use 'openrouter', 'google', 'openai', 'groq' ou 'test'."
        )
    return provedor


def obter_nome_modelo(perfil: PerfilModelo = "sql") -> str:
    """Retorna o nome do modelo para o perfil solicitado ('sql' ou 'insight')."""
    especifico = _ler_env(f"LLM_MODELO_{perfil.upper()}")
    if especifico:
        return especifico
    generico = _ler_env("LLM_MODELO") or _ler_env("MODEL_NAME")
    if generico:
        return generico
    provedor = obter_provedor_configurado()
    if provedor == "openrouter":
        return MODELO_PADRAO_OPENROUTER
    return MODELO_PADRAO_GOOGLE


def _obter_chave_api(obrigatoria: bool = True) -> str:
    """Busca a chave de API nas variáveis aceitas pelo projeto sem jamais logar seu valor."""
    for variavel in (
        "LLM_API_KEY",
        "OPENROUTER_API_KEY",
        "IA_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "OPENAI_API_KEY",
    ):
        valor = _ler_env(variavel)
        if valor:
            return valor
    if obrigatoria:
        raise ConfiguracaoLLMError(
            "Chave de API do modelo não configurada. "
            "Defina OPENROUTER_API_KEY, LLM_API_KEY ou IA_API_KEY no arquivo .env."
        )
    return ""


def calcular_temperatura(nome_modelo: str, perfil: PerfilModelo = "sql") -> float:
    """Define a temperatura seguindo a recomendação do provedor.

    - Família Gemini 3 (ex.: gemini-3.1-flash-lite): guia oficial recomenda manter 1.0
      para evitar loops e degradação no raciocínio.
    - Demais modelos (Nemotron, Gemini 2.5, etc.): temperatura 0.0 no SQL para máxima
      estabilidade e 0.2 no insight para fluidez textual controlada.
    """
    temp_env = _ler_env("LLM_TEMPERATURA")
    if temp_env:
        try:
            valor = float(temp_env)
        except ValueError as exc:
            raise ConfiguracaoLLMError("LLM_TEMPERATURA deve ser um número válido.") from exc
        if not 0.0 <= valor <= 2.0:
            raise ConfiguracaoLLMError("LLM_TEMPERATURA deve estar entre 0.0 e 2.0.")
        return valor

    modelo_lower = nome_modelo.lower()
    if "gemini-3" in modelo_lower:
        return 1.0
    return 0.0 if perfil == "sql" else 0.2


def obter_model_settings(
    perfil: PerfilModelo = "sql",
    nome_modelo: str | None = None,
    provedor: str | None = None,
) -> ModelSettings:
    """Monta as configurações de execução (temperatura, timeout, max_tokens e raciocínio).

    - No perfil 'sql': raciocínio baixo (thinking_budget reduzido) e até 2048 tokens de saída.
    - No perfil 'insight': raciocínio mínimo (thinking_budget=0) e até 1024 tokens de saída.
    """
    provedor_resolvido = (provedor or obter_provedor_configurado()).lower()
    modelo_resolvido = nome_modelo or obter_nome_modelo(perfil)
    temperatura = calcular_temperatura(modelo_resolvido, perfil)

    timeout_env = _ler_env("LLM_TIMEOUT_S", "25")
    try:
        timeout_s = float(timeout_env)
    except ValueError as exc:
        raise ConfiguracaoLLMError("LLM_TIMEOUT_S deve ser numérico.") from exc

    if provedor_resolvido in {"google", "google-gla"}:
        max_tokens = 2048 if perfil == "sql" else 1024
        thinking_budget = 256 if perfil == "sql" else 0
        budget_env = _ler_env(f"LLM_THINKING_BUDGET_{perfil.upper()}") or _ler_env("LLM_THINKING_BUDGET")
        if budget_env:
            try:
                thinking_budget = int(budget_env)
            except ValueError as exc:
                raise ConfiguracaoLLMError("LLM_THINKING_BUDGET deve ser inteiro.") from exc

        settings: dict[str, Any] = {
            "temperature": temperatura,
            "max_tokens": max_tokens,
            "timeout": timeout_s,
        }
        modelo_lower = modelo_resolvido.lower()
        if "gemini-2.5" in modelo_lower or "gemini-3" in modelo_lower:
            settings["google_thinking_config"] = {"thinking_budget": thinking_budget}
        return GoogleModelSettings(**settings)

    # Em provedores OpenAI/OpenRouter (como Nemotron), tokens de raciocínio contam dentro de max_tokens.
    # O OpenRouter não aceita combinar `openai_reasoning_effort` com `max_tokens`/`enabled` na mesma chamada.
    # Por padrão, desabilitamos o raciocínio verboso (`enabled: False`) para responder rápido sem estourar max_tokens.
    max_tokens_or = 4096 if perfil == "sql" else 1536
    esforco = _ler_env("LLM_REASONING_EFFORT")
    if esforco:
        return OpenAIChatModelSettings(
            temperature=temperatura,
            max_tokens=max_tokens_or,
            timeout=timeout_s,
            extra_body={"reasoning": {"effort": esforco}},
        )
    return OpenAIChatModelSettings(
        temperature=temperatura,
        max_tokens=max_tokens_or,
        timeout=timeout_s,
        extra_body={"reasoning": {"max_tokens": 256 if perfil == "sql" else 64}},
    )


def criar_modelo(
    perfil: PerfilModelo = "sql",
    *,
    permitir_fallback_teste: bool = False,
) -> Model:
    """Cria a instância do modelo PydanticAI pronta para o Agent de SQL ou de Insight.

    Se `LLM_PROVIDER=test` ou se `permitir_fallback_teste=True` quando não houver chave no .env,
    retorna um `TestModel` do PydanticAI (ideal para testes automatizados sem gastar tokens).
    """
    provedor = obter_provedor_configurado()
    nome_modelo = obter_nome_modelo(perfil)

    if provedor == "test":
        return TestModel()

    chave = _obter_chave_api(obrigatoria=not permitir_fallback_teste)
    if not chave and permitir_fallback_teste:
        return TestModel()

    if provedor in {"google", "google-gla"}:
        google_provider = GoogleProvider(api_key=chave)
        return GoogleModel(model_name=nome_modelo, provider=google_provider)

    if provedor == "openrouter":
        base_url = _ler_env("LLM_BASE_URL") or _ler_env("OPENROUTER_BASE_URL", OPENROUTER_BASE_URL)
        openai_provider = OpenAIProvider(base_url=base_url, api_key=chave)
        return OpenAIChatModel(model_name=nome_modelo, provider=openai_provider)

    if provedor == "groq":
        base_url = _ler_env("LLM_BASE_URL", GROQ_BASE_URL)
        openai_provider = OpenAIProvider(base_url=base_url, api_key=chave)
        return OpenAIChatModel(model_name=nome_modelo, provider=openai_provider)

    # provedor == "openai" (ou endpoint compatível arbitrário)
    base_url = _ler_env("LLM_BASE_URL") or _ler_env("OPENROUTER_BASE_URL")
    if base_url:
        openai_provider = OpenAIProvider(base_url=base_url, api_key=chave)
    else:
        openai_provider = OpenAIProvider(api_key=chave)
    return OpenAIChatModel(model_name=nome_modelo, provider=openai_provider)


def extrair_uso_run(resultado: Any) -> Any:
    """Extrai o objeto RunUsage de um AgentRunResult de forma compatível entre versões do PydanticAI."""
    uso_attr = getattr(resultado, "usage", None)
    return uso_attr() if callable(uso_attr) else uso_attr
