"""Módulo de Inteligência Artificial do V-Energy Grid 360 (PydanticAI + CHESS)."""

from app.ai.agent import (
    construir_agente_sql,
    converter_historico_para_mensagens,
    decidir_apresentacao,
    detectar_pedido_consumo_negativo_explicito,
    responder,
)
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
from app.ai.resposta import (
    ViolacaoFidelidadeSaida,
    decidir_modo_apresentacao,
    formatar_numero_pt_br,
    substituir_marcadores_pt_br,
    validar_fidelidade_saida,
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
    "ViolacaoFidelidadeSaida",
    "calcular_temperatura",
    "construir_agente_sql",
    "converter_historico_para_mensagens",
    "criar_modelo",
    "decidir_apresentacao",
    "decidir_modo_apresentacao",
    "detectar_pedido_consumo_negativo_explicito",
    "extrair_uso_run",
    "formatar_numero_pt_br",
    "obter_model_settings",
    "obter_nome_modelo",
    "obter_provedor_configurado",
    "responder",
    "substituir_marcadores_pt_br",
    "validar_fidelidade_saida",
]
