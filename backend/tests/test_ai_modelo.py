"""Testes unitários e de segurança da configuração do modelo PydanticAI (GENAI-1)."""

from __future__ import annotations

import os
import pytest
from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.test import TestModel

from app.ai.modelo import (
    ConfiguracaoLLMError,
    calcular_temperatura,
    criar_modelo,
    extrair_uso_run,
    obter_model_settings,
    obter_nome_modelo,
    obter_provedor_configurado,
)


class _SaidaTeste(BaseModel):
    resposta: str


def _limpar_env_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in (
        "LLM_PROVIDER",
        "LLM_MODELO",
        "LLM_MODELO_SQL",
        "LLM_MODELO_INSIGHT",
        "MODEL_NAME",
        "LLM_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENROUTER_BASE_URL",
        "IA_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "OPENAI_API_KEY",
        "LLM_BASE_URL",
        "LLM_TEMPERATURA",
        "LLM_TIMEOUT_S",
        "LLM_THINKING_BUDGET",
        "LLM_THINKING_BUDGET_SQL",
        "LLM_THINKING_BUDGET_INSIGHT",
    ):
        monkeypatch.delenv(var, raising=False)


def test_temperatura_segue_recomendacao_do_provedor(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpar_env_llm(monkeypatch)
    # Gemini 3 pede manter temperatura em 1.0
    assert calcular_temperatura("gemini-3.1-flash-lite", "sql") == 1.0
    assert calcular_temperatura("gemini-3.0-pro", "insight") == 1.0
    # Modelos OpenRouter / Nemotron / Gemini 2.5 usam 0.0 no SQL e 0.2 no insight por padrão
    assert calcular_temperatura("nvidia/nemotron-3.5-lightning:free", "sql") == 0.0
    assert calcular_temperatura("nvidia/nemotron-3.5-lightning:free", "insight") == 0.2
    assert calcular_temperatura("gemini-2.5-flash-lite", "sql") == 0.0
    assert calcular_temperatura("gemini-2.5-flash-lite", "insight") == 0.2


def test_model_settings_separa_perfis_sql_e_insight(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpar_env_llm(monkeypatch)
    settings_sql = obter_model_settings("sql", nome_modelo="gemini-2.5-flash-lite", provedor="google")
    settings_insight = obter_model_settings("insight", nome_modelo="gemini-2.5-flash-lite", provedor="google")

    assert settings_sql.get("temperature") == 0.0
    assert settings_sql.get("max_tokens") == 2048
    assert settings_sql.get("timeout") == 25.0
    assert settings_sql.get("google_thinking_config") == {"thinking_budget": 256}

    assert settings_insight.get("temperature") == 0.2
    assert settings_insight.get("max_tokens") == 1024
    assert settings_insight.get("google_thinking_config") == {"thinking_budget": 0}


def test_troca_de_provedor_apenas_por_variaveis_de_ambiente(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpar_env_llm(monkeypatch)

    # 1. Detecção automática de OpenRouter via OPENROUTER_API_KEY + MODEL_NAME
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-chave-ficticia-teste")
    monkeypatch.setenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    monkeypatch.setenv("MODEL_NAME", "nvidia/nemotron-3.5-lightning:free")
    assert obter_provedor_configurado() == "openrouter"
    assert obter_nome_modelo("sql") == "nvidia/nemotron-3.5-lightning:free"
    modelo_or_auto = criar_modelo("sql")
    assert isinstance(modelo_or_auto, OpenAIChatModel)
    assert modelo_or_auto.model_name == "nvidia/nemotron-3.5-lightning:free"

    # 2. Google explícito
    monkeypatch.setenv("LLM_PROVIDER", "google")
    monkeypatch.setenv("LLM_MODELO", "gemini-2.5-flash-lite")
    modelo_google = criar_modelo("sql")
    assert isinstance(modelo_google, GoogleModel)
    assert modelo_google.model_name == "gemini-2.5-flash-lite"

    # 3. Groq / OpenAI-compatible
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_MODELO", "llama-3.3-70b-versatile")
    modelo_groq = criar_modelo("insight")
    assert isinstance(modelo_groq, OpenAIChatModel)
    assert modelo_groq.model_name == "llama-3.3-70b-versatile"


def test_sem_chave_levanta_erro_sem_vazar_segredos_ou_usa_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    _limpar_env_llm(monkeypatch)
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")

    with pytest.raises(ConfiguracaoLLMError) as exc_info:
        criar_modelo("sql", permitir_fallback_teste=False)

    assert "OPENROUTER_API_KEY" in str(exc_info.value)

    modelo_fallback = criar_modelo("sql", permitir_fallback_teste=True)
    assert isinstance(modelo_fallback, TestModel)


def test_run_com_test_model_retorna_texto_e_contagem_de_tokens_sem_vazar_chave(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _limpar_env_llm(monkeypatch)
    chave_ficticia = "sk-or-v1-ChaveSecretaNaoPodeVazar99999"
    monkeypatch.setenv("LLM_PROVIDER", "test")
    monkeypatch.setenv("OPENROUTER_API_KEY", chave_ficticia)

    modelo = criar_modelo("sql")
    agente = Agent(
        modelo,
        output_type=str,
        model_settings=obter_model_settings("sql"),
    )

    resultado = agente.run_sync("Qual foi a receita faturada em P2?")
    uso = extrair_uso_run(resultado)

    assert isinstance(resultado.output, str)
    assert len(resultado.output) > 0
    assert uso.requests >= 1
    assert (uso.input_tokens or 0) > 0
    assert (uso.output_tokens or 0) > 0
    # Nenhuma chave de API pode aparecer na saída ou na representação do resultado
    assert chave_ficticia not in resultado.output
    assert chave_ficticia not in repr(resultado)
    assert chave_ficticia not in repr(modelo)


@pytest.mark.skipif(
    os.getenv("RUN_REAL_LLM_SMOKE") != "1",
    reason="Teste de fumaça com modelo real só roda quando RUN_REAL_LLM_SMOKE=1 e há chave configurada.",
)
def test_smoke_modelo_real() -> None:
    modelo = criar_modelo("sql")
    agente = Agent(modelo, output_type=str, model_settings=obter_model_settings("sql"))
    resultado = agente.run_sync("Responda apenas: OK")
    uso = extrair_uso_run(resultado)
    assert resultado.output
    assert uso.requests >= 1
