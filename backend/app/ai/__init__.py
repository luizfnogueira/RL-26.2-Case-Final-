"""Módulo de Inteligência Artificial do V-Energy Grid 360 (PydanticAI + CHESS)."""

from app.ai.agent import construir_agente_sql, detectar_pedido_consumo_negativo_explicito, responder
from app.ai.contratos import (
    DepsAgente,
    ErroConsulta,
    PlanoConsulta,
    RespostaAgente,
    ResultadoConsulta,
    SQLBloqueado,
    TelemetriaExecucao,
    TrocaHistorico,
)
from app.ai.modelo import (
    ConfiguracaoLLMError,
    calcular_temperatura,
    criar_modelo,
    extrair_uso_run,
    obter_model_settings,
    obter_nome_modelo,
    obter_provedor_configurado,
)

__all__ = [
    "ConfiguracaoLLMError",
    "DepsAgente",
    "ErroConsulta",
    "PlanoConsulta",
    "RespostaAgente",
    "ResultadoConsulta",
    "SQLBloqueado",
    "TelemetriaExecucao",
    "TrocaHistorico",
    "calcular_temperatura",
    "construir_agente_sql",
    "criar_modelo",
    "detectar_pedido_consumo_negativo_explicito",
    "extrair_uso_run",
    "obter_model_settings",
    "obter_nome_modelo",
    "obter_provedor_configurado",
    "responder",
]
