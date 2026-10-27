"""Módulo de Inteligência Artificial do V-Energy Grid 360 (PydanticAI + CHESS)."""

from app.ai.agent import (
    construir_agente_sql,
    converter_historico_para_mensagens,
    decidir_apresentacao,
    detectar_pedido_consumo_negativo_explicito,
    responder,
)
from app.ai.cache import (
    buscar_resposta_em_cache,
    limpar_cache_respostas,
    normalizar_chave_pergunta,
    salvar_resposta_em_cache,
)
from app.ai.chase import (
    assinatura_resultado_execucao,
    executar_votacao_chase_sql,
    precisa_disparar_self_consistency,
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
from app.ai.roteador import (
    ModoSchema,
    gerar_catalogo_resumido,
    montar_contexto_schema,
    selecionar_skills,
)

__all__ = [
    "ConfiguracaoLLMError",
    "DepsAgente",
    "ErroConsulta",
    "ModoSchema",
    "PlanoConsulta",
    "RespostaAgente",
    "ResultadoConsulta",
    "SQLBloqueado",
    "TelemetriaExecucao",
    "TrocaHistorico",
    "ViolacaoFidelidadeSaida",
    "assinatura_resultado_execucao",
    "buscar_resposta_em_cache",
    "calcular_temperatura",
    "construir_agente_sql",
    "converter_historico_para_mensagens",
    "criar_modelo",
    "decidir_apresentacao",
    "decidir_modo_apresentacao",
    "detectar_pedido_consumo_negativo_explicito",
    "executar_votacao_chase_sql",
    "extrair_uso_run",
    "formatar_numero_pt_br",
    "gerar_catalogo_resumido",
    "limpar_cache_respostas",
    "montar_contexto_schema",
    "normalizar_chave_pergunta",
    "obter_model_settings",
    "obter_nome_modelo",
    "obter_provedor_configurado",
    "precisa_disparar_self_consistency",
    "responder",
    "salvar_resposta_em_cache",
    "selecionar_skills",
    "substituir_marcadores_pt_br",
    "validar_fidelidade_saida",
]
