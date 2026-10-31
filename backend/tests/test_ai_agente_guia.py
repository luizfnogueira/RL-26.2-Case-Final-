"""Testes do agente do guia da plataforma, validação determinística e orçamento/telemetria (T2, T3, T5)."""

from __future__ import annotations

import json
import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from app.ai.agente_guia import (
    LIMITE_SECOES,
    ORCAMENTO_CARACTERES,
    RespostaGuia,
    ViolacaoFidelidadeGuia,
    aplicar_orcamento_secoes,
    responder_pelo_guia,
    secao_incompleta,
    validar_resposta_guia,
)
from app.services.guia_plataforma import SecaoGuia, carregar_guia, secoes_para


def _modelo_fixo(status: str, texto: str, secoes_usadas: list[str]) -> TestModel:
    return TestModel(
        custom_output_args={
            "status": status,
            "texto": texto,
            "secoes_usadas": secoes_usadas,
        }
    )


def test_t2_aba_assistente_venergy_retorna_ok_e_cita_assistente():
    pergunta = "O que é a aba Assistente V-Energy?"
    secoes = secoes_para(pergunta)
    assert any(s.id == "assistente" for s in secoes)

    modelo = _modelo_fixo(
        status="ok",
        texto=(
            "O **Assistente V-Energy** responde, em português, perguntas sobre os dados da V-Energy "
            "e dúvidas sobre como usar a plataforma.\n"
            "1. No menu lateral, em **IA & dados**, clique em **Assistente V-Energy**.\n"
            "2. Escreva a pergunta no campo **Sua pergunta** (até 2.000 caracteres) e clique em **Enviar**."
        ),
        secoes_usadas=["assistente"],
    )

    resposta = responder_pelo_guia(pergunta, secoes, modelo=modelo)
    assert isinstance(resposta, RespostaGuia)
    assert resposta.status == "ok"
    assert "assistente" in resposta.secoes_usadas
    assert "Assistente V-Energy" in resposta.texto


def test_t2_como_agente_funciona_retorna_ok_e_cita_assistente_como_funciona():
    pergunta = "Como o agente de inteligência artificial funciona?"
    secoes = secoes_para(pergunta)
    assert any(s.id == "assistente-como-funciona" for s in secoes)

    modelo = _modelo_fixo(
        status="ok",
        texto=(
            "1. O assistente entende a sua pergunta e escreve a consulta aos dados oficiais da plataforma.\n"
            "2. Ele só tem permissão para ler os dados.\n"
            "3. Antes de mostrar a resposta, o sistema confere os números do texto.\n"
            "Abaixo de cada resposta, abra **Como cheguei nisso** para conferir a consulta ou a seção do guia."
        ),
        secoes_usadas=["assistente-como-funciona"],
    )

    resposta = responder_pelo_guia(pergunta, secoes, modelo=modelo)
    assert resposta.status == "ok"
    assert "assistente-como-funciona" in resposta.secoes_usadas


def test_t2_ordem_de_inspecao_com_completar_retorna_nao_sei_sem_inventar():
    pergunta = "Como gero uma ordem de inspeção?"
    secoes = secoes_para(pergunta)
    assert all(secao_incompleta(s) for s in secoes)

    # Mesmo se o modelo tentasse devolver "ok" inventando passos, seções [COMPLETAR] viram "nao_sei"
    modelo = _modelo_fixo(
        status="ok",
        texto="1. Vá em Ordens de inspeção e clique em Nova Ordem.",
        secoes_usadas=["ordens"],
    )

    resposta = responder_pelo_guia(pergunta, secoes, modelo=modelo)
    assert resposta.status == "nao_sei"
    assert resposta.secoes_usadas == []


def test_t2_ordem_de_inspecao_quando_preenchida_retorna_ok_e_cita_ordens():
    pergunta = "Como gero uma ordem de inspeção?"
    secao_ordens_preenchida = SecaoGuia(
        id="ordens",
        titulo="Ordens de inspeção",
        nivel="publico",
        rota="/perdas/ordens",
        palavras=("ordens", "ordem de inspecao", "gerar ordem"),
        texto=(
            "1. Acesse a tela **Fila de inspeção** ou **Ordens de inspeção** no menu lateral.\n"
            "2. Selecione as unidades suspeitas e clique em **Gerar ordem**.\n"
            "3. Acompanhe o status da ordem (aberta, em campo, concluída ou cancelada)."
        ),
    )

    modelo = _modelo_fixo(
        status="ok",
        texto=(
            "1. Acesse **Ordens de inspeção** no menu lateral.\n"
            "2. Selecione as unidades suspeitas e clique em **Gerar ordem**.\n"
            "3. Acompanhe o status da ordem."
        ),
        secoes_usadas=["ordens"],
    )

    resposta = responder_pelo_guia(pergunta, [secao_ordens_preenchida], modelo=modelo)
    assert resposta.status == "ok"
    assert "ordens" in resposta.secoes_usadas


def test_t2_historico_da_conversa_entra_no_prompt():
    secoes = secoes_para("O que é a aba Assistente V-Energy?")
    prompts_recebidos: list[str] = []

    def inspecionar_prompt(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        texto_msg = str(messages[0].parts[-1].content)
        prompts_recebidos.append(texto_msg)
        tool_name = info.output_tools[0].name
        return ModelResponse(
            parts=[
                ToolCallPart(
                    tool_name=tool_name,
                    args=json.dumps(
                        {
                            "status": "ok",
                            "texto": "Para exportar, clique em **Exportar CSV** na tabela do Assistente V-Energy.",
                            "secoes_usadas": ["assistente"],
                        }
                    ),
                )
            ]
        )

    historico = [
        {
            "pergunta": "O que é a aba Assistente V-Energy?",
            "resposta": "É a tela de perguntas em português sobre os dados e sobre a plataforma.",
        }
    ]
    resposta = responder_pelo_guia(
        "E como exporto a tabela?",
        secoes,
        historico=historico,
        modelo=FunctionModel(inspecionar_prompt),
    )
    assert resposta.status == "ok"
    assert len(prompts_recebidos) == 1
    assert "HISTÓRICO RECENTE DA CONVERSA" in prompts_recebidos[0]
    assert "O que é a aba Assistente V-Energy?" in prompts_recebidos[0]


def test_t3_testmodel_com_secao_inexistente_e_numero_inventado_vira_nao_sei():
    pergunta = "O que é a aba Assistente V-Energy?"
    secoes = secoes_para(pergunta)

    # TestModel devolve seção inexistente ("secao-fantasma") e número inventado (999) nas tentativas
    modelo_invalido = _modelo_fixo(
        status="ok",
        texto="O Assistente V-Energy possui 999 telas configuráveis.",
        secoes_usadas=["secao-fantasma"],
    )

    resposta = responder_pelo_guia(pergunta, secoes, modelo=modelo_invalido)
    assert resposta.status == "nao_sei"
    assert resposta.secoes_usadas == []
    assert resposta.detalhes_tecnicos is not None
    assert resposta.detalhes_tecnicos["verificacoes"]["numeros_conferidos"] is False
    # 1 chamada original + 1 ModelRetry = 2 chamadas ao modelo
    assert resposta.detalhes_tecnicos["tokens_tempo"]["chamadas"] == 2


def test_t3_model_retry_corrige_na_segunda_tentativa():
    pergunta = "O que é a aba Assistente V-Energy?"
    secoes = secoes_para(pergunta)
    chamadas = 0

    def modelo_que_corrige(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        nonlocal chamadas
        chamadas += 1
        tool_name = info.output_tools[0].name
        if chamadas == 1:
            # 1ª tentativa: cita número inventado (4500) e tela inexistente ("Configurações Secretas")
            payload = {
                "status": "ok",
                "texto": 'Acesse a aba "Configurações Secretas" com limite de 4500 caracteres.',
                "secoes_usadas": ["assistente"],
            }
        else:
            # 2ª tentativa (após ModelRetry): usa dados reais da seção `assistente` (2.000 caracteres)
            payload = {
                "status": "ok",
                "texto": (
                    "1. No menu lateral, clique em **Assistente V-Energy**.\n"
                    "2. Digite no campo **Sua pergunta** (até 2.000 caracteres) e clique em **Enviar**."
                ),
                "secoes_usadas": ["assistente"],
            }
        return ModelResponse(parts=[ToolCallPart(tool_name=tool_name, args=json.dumps(payload))])

    resposta = responder_pelo_guia(pergunta, secoes, modelo=FunctionModel(modelo_que_corrige))
    assert chamadas == 2
    assert resposta.status == "ok"
    assert resposta.secoes_usadas == ["assistente"]
    assert "2.000" in resposta.texto


def test_t3_validar_resposta_guia_rejeita_tela_e_rota_inventadas():
    secoes = secoes_para("O que é a aba Assistente V-Energy?")

    with pytest.raises(ViolacaoFidelidadeGuia, match="tela ou aba"):
        validar_resposta_guia(
            secoes,
            "O que é a aba Assistente V-Energy?",
            RespostaGuia(
                status="ok",
                texto='Clique na aba "Faturamento Corporativo" para abrir o assistente.',
                secoes_usadas=["assistente"],
            ),
        )

    with pytest.raises(ViolacaoFidelidadeGuia, match="rota"):
        validar_resposta_guia(
            secoes,
            "O que é a aba Assistente V-Energy?",
            RespostaGuia(
                status="ok",
                texto="Acesse a página /admin/configuracoes para abrir o assistente.",
                secoes_usadas=["assistente"],
            ),
        )


def test_t5_orcamento_maximo_4_secoes_e_10000_caracteres():
    guia = carregar_guia()
    todas_secoes = list(guia.secoes)
    assert len(todas_secoes) > LIMITE_SECOES

    orcadas = aplicar_orcamento_secoes(todas_secoes)
    assert len(orcadas) <= LIMITE_SECOES
    assert sum(len(s.texto) for s in orcadas) <= ORCAMENTO_CARACTERES

    secoes_gigantes = [
        SecaoGuia(
            id=f"sec-{i}",
            titulo=f"Seção {i}",
            nivel="publico",
            rota=None,
            palavras=("teste",),
            texto="A" * 4_000,
        )
        for i in range(4)
    ]
    orcadas_gigantes = aplicar_orcamento_secoes(secoes_gigantes)
    # 2 seções de 4.000 cabem (8.000 <= 10.000); a 3ª passaria de 10.000 e é barrada
    assert len(orcadas_gigantes) == 2
    assert sum(len(s.texto) for s in orcadas_gigantes) <= ORCAMENTO_CARACTERES


def test_t5_telemetria_registra_tokens_e_tempo():
    pergunta = "O que é a aba Assistente V-Energy?"
    secoes = secoes_para(pergunta)
    modelo = _modelo_fixo(
        status="ok",
        texto="O **Assistente V-Energy** responde perguntas sobre os dados e sobre a plataforma.",
        secoes_usadas=["assistente"],
    )

    resposta = responder_pelo_guia(pergunta, secoes, modelo=modelo)
    detalhes = resposta.detalhes_tecnicos
    assert detalhes is not None
    assert "tokens_tempo" in detalhes
    assert detalhes["tokens_tempo"]["chamadas"] == 1
    assert detalhes["tokens_tempo"]["latencia_total_ms"] >= 0
    assert "agente_ms" in detalhes["tokens_tempo"]["etapas_ms"]
    assert detalhes["estrutura_pensamento"]["skills"] == ["guia_plataforma"]
    assert detalhes["consulta"]["sql_executado"] is None
