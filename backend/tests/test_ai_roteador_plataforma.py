"""Testes unitários do detector de intenção plataforma vs. dados (T1 — backend/app/ai/roteador.py)."""

from __future__ import annotations

import pytest

from app.ai.roteador import e_pergunta_da_plataforma
from app.services.guia_plataforma import carregar_guia


PERGUNTAS_PLATAFORMA = [
    # 3 perguntas do teste de aceite do documento do Luiz
    "O que é a aba Assistente V-Energy?",
    "Como o agente de inteligência artificial funciona?",
    "Como gero uma ordem de inspeção?",
    # Navegação, interface, filtros e botões
    "O que é a V-Energy Grid 360?",
    "Para que serve esta plataforma?",
    "Como uso os filtros da plataforma?",
    "Como limpar filtros na tela?",
    "Como funciona o menu lateral no celular?",
    "Onde fica o botão Pergunte à IA?",
    "Como abrir o Assistente V-Energy em tela cheia?",
    "Como exportar uma tabela para CSV?",
    "O que mostra o bloco Como cheguei nisso?",
    "Como pedir um gráfico na conversa do assistente?",
    "Como funciona a tela Visão 360 da unidade consumidora?",
    "Como busco uma unidade consumidora pelo código?",
    "Como cancelo uma ordem de inspeção?",
    "Como registrar o resultado de uma ordem de inspeção?",
    "Para que serve a Fila de inspeção?",
    "O que mostra o Painel executivo?",
    "Como funciona a tela Diagnóstico da receita?",
    "Onde vejo a falta de luz por alimentador na plataforma?",
    # Conceitos do glossário e limites da plataforma (sem pedir cálculo/query no banco)
    "O que significa DEC e FEC?",
    "O que é uma unidade consumidora (UC)?",
    "O que significa geração distribuída (GD)?",
    "O que são perdas não técnicas?",
    "O que é bandeira tarifária?",
    "Até quando vão os dados da plataforma?",
    "O assistente pode apagar ou alterar dados?",
    "Me ajude a começar a usar o sistema",
]

PERGUNTAS_DADOS_OU_MISTAS = [
    # Consultas de dados diretas (sugestões e golden set)
    "Qual foi a receita no período?",
    "Por que a conta de luz aumentou?",
    "Quanto a receita comercial cresceu em Jaboatão?",
    "Quanto da variação da receita foi preço e quanto foi volume?",
    "Qual bairro mais perdeu volume residencial no último ano?",
    "Quantas unidades com painel solar em Olinda tiveram queda de consumo acima de 30%?",
    "Qual foi a energia faturada em P2 comparada a P1?",
    "Quais bairros tiveram mais falta de luz em P2?",
    "Quais os 5 alimentadores com maior DEC em P2?",
    "Qual foi o DEC de P2 sem o dia crítico?",
    "Qual canal de atendimento tem a pior nota de satisfação?",
    "Quais os assuntos mais frequentes no call center em P2?",
    "Quais UCs têm maior risco de perda?",
    "Quantas UCs estão na fila de perdas por ação recomendada?",
    "Qual foi o menor consumo registrado em junho de 2026?",
    # Perguntas mistas (conceito + dado real -> devem ir para dados, conforme T1)
    "O que é DEC e qual o DEC de Recife em P2?",
    "O que é efeito-preço e quanto foi em P2?",
    "O que significa geração distribuída e quantas unidades com painel solar tem em Olinda?",
    "Como funciona a fila de perdas e quais os 5 municípios com mais UCs na fila?",
    "O que é bandeira tarifária e qual foi a receita em Recife em 2025?",
]


@pytest.mark.parametrize("pergunta", PERGUNTAS_PLATAFORMA)
def test_detecta_perguntas_sobre_a_plataforma(pergunta: str) -> None:
    guia = carregar_guia()
    assert e_pergunta_da_plataforma(pergunta, guia) is True, f"Deveria ser plataforma: {pergunta!r}"


@pytest.mark.parametrize("pergunta", PERGUNTAS_DADOS_OU_MISTAS)
def test_detecta_perguntas_de_dados_e_mistas_como_dados(pergunta: str) -> None:
    guia = carregar_guia()
    assert e_pergunta_da_plataforma(pergunta, guia) is False, f"Deveria ir para dados: {pergunta!r}"


def test_total_de_frases_testadas_supera_minimo_de_30() -> None:
    assert len(PERGUNTAS_PLATAFORMA) + len(PERGUNTAS_DADOS_OU_MISTAS) >= 30
    assert e_pergunta_da_plataforma("") is False
    assert e_pergunta_da_plataforma("   ") is False
