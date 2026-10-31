"""Leitor do guia da plataforma: o assistente só recebe seções públicas, bem formadas e sem comentários."""
from pathlib import Path

import pytest

from app.services import guia_plataforma
from app.services.guia_plataforma import (
    CAMINHO_GUIA, carregar_guia, ler_guia, permitidas, secoes_para, texto_para_o_agente,
)

EXEMPLO = """# Guia de teste

<!--
Instruções para quem escreve: nunca vão para o assistente.
  ## Exemplo de seção {#exemplo}
-->

## O que é a plataforma {#sobre}
<!-- nivel: publico | rota: - | palavras: plataforma, o que é -->

A plataforma reúne os dados.
<!-- nota interna: revisar com o time -->

## Primeiros passos {#primeiros-passos}
<!-- nivel: publico | rota: - | palavras: começar, menu -->
Use o menu lateral.

## Ordens de inspeção {#ordens}
<!-- nivel: publico | rota: /perdas/ordens | palavras: ordens, ordem de inspeção, registrar resultado -->
1. Abra a ordem.

## Fila de inspeção {#fila}
<!-- nivel: publico | rota: /perdas/fila | palavras: fila, inspeção, gerar ordem -->
A fila ordena as suspeitas.

## Painel do gestor {#gestor}
<!-- nivel: gestor | rota: /painel | palavras: metas -->
Só gestores.

## Seção sem metadados {#solta}
Texto sem nível.

## Seção com nível inventado {#inventada}
<!-- nivel: admin | rota: - | palavras: x -->
Não pode sair.

## Seção sem id
<!-- nivel: publico | rota: - | palavras: y -->
Também não.
"""


@pytest.fixture
def guia():
    return ler_guia(EXEMPLO)


def ids(secoes):
    return [s.id for s in secoes]


# ---------- leitura ----------

def test_le_titulo_id_nivel_rota_e_palavras_sem_os_comentarios(guia):
    sobre = guia.secao("sobre")
    assert (sobre.titulo, sobre.nivel, sobre.rota) == ("O que é a plataforma", "publico", None)
    assert sobre.palavras == ("plataforma", "o que e")
    assert sobre.texto == "A plataforma reúne os dados."
    assert guia.secao("ordens").rota == "/perdas/ordens"


def test_secao_mal_formatada_fica_de_fora_e_vira_problema(guia):
    assert ids(guia.secoes) == ["sobre", "primeiros-passos", "ordens", "fila", "gestor"]
    assert len(guia.problemas) == 3
    assert any("solta" in p for p in guia.problemas)
    assert any("admin" in p for p in guia.problemas)
    assert any("Seção sem id" in p for p in guia.problemas)


def test_instrucoes_antes_da_primeira_secao_nao_entram(guia):
    assert all("Instruções" not in s.texto and "exemplo" != s.id for s in guia.secoes)


def test_id_repetido_fica_so_o_primeiro():
    repetido = EXEMPLO + "\n## Outra {#sobre}\n<!-- nivel: publico | rota: - | palavras: z -->\nDuplicada.\n"
    guia = ler_guia(repetido)
    assert guia.secao("sobre").texto == "A plataforma reúne os dados."
    assert any("repetido" in p for p in guia.problemas)


def test_versao_muda_quando_o_texto_muda(guia):
    assert guia.versao == ler_guia(EXEMPLO).versao
    assert guia.versao != ler_guia(EXEMPLO + "\nmais uma linha").versao


# ---------- nível ----------

def test_publico_nao_recebe_secao_de_gestor(guia):
    assert "gestor" not in ids(permitidas(guia, "publico"))
    assert "gestor" in ids(permitidas(guia, "gestor"))


def test_nivel_desconhecido_nao_recebe_nada(guia):
    assert permitidas(guia, "administrador") == []
    assert secoes_para("o que é a plataforma", nivel="administrador", guia=guia) == []


def test_secao_de_outro_nivel_nao_sai_nem_quando_a_pergunta_cita_as_palavras_dela(guia):
    assert "gestor" not in ids(secoes_para("quais as metas?", guia=guia))


# ---------- escolha das seções ----------

def test_expressao_inteira_pesa_mais_que_palavra_solta(guia):
    assert ids(secoes_para("Como registrar resultado de uma ordem de inspeção?", guia=guia))[:2] == ["ordens", "fila"]


def test_palavras_em_outra_ordem_ou_flexionadas_tambem_contam(guia):
    # "registrar resultado" → "registro o resultado"; "ordem de inspeção" → "ordens ... inspeção"
    assert ids(secoes_para("Onde registro o resultado?", guia=guia))[0] == "ordens"
    assert ids(secoes_para("Inspeção: como abrir as ordens?", guia=guia))[0] == "ordens"


def test_expressao_so_de_palavras_de_ligacao_nao_escolhe_secao(guia):
    # "o que é" está nas palavras da seção "sobre", mas cabe em qualquer pergunta
    assert ids(secoes_para("o que é a fila?", guia=guia)) == ["fila"]


def test_acento_e_caixa_nao_atrapalham(guia):
    assert ids(secoes_para("ONDE FICA A FILA DE INSPECAO", guia=guia))[0] == "fila"


def test_sem_secao_ligada_vai_a_apresentacao_e_os_primeiros_passos(guia):
    assert ids(secoes_para("bom dia, tudo certo?", guia=guia)) == ["sobre", "primeiros-passos"]


def test_limite_de_secoes_e_de_tamanho(guia, monkeypatch):
    pergunta = "plataforma menu ordens fila"
    assert len(secoes_para(pergunta, guia=guia)) == 4
    assert len(secoes_para(pergunta, limite=2, guia=guia)) == 2
    monkeypatch.setattr(guia_plataforma, "ORCAMENTO_CARACTERES", 10)
    # A primeira sempre vai, mesmo maior que o orçamento; as outras param no limite
    assert len(secoes_para(pergunta, guia=guia)) == 1


def test_texto_para_o_agente_marca_cada_secao_com_o_id(guia):
    texto = texto_para_o_agente([guia.secao("sobre"), guia.secao("fila")])
    assert texto.startswith("### [sobre] O que é a plataforma\nA plataforma reúne os dados.")
    assert "### [fila] Fila de inspeção" in texto


# ---------- guia real ----------

def test_guia_real_e_lido_sem_problemas():
    guia = carregar_guia()
    assert guia.problemas == ()
    assert {"sobre", "primeiros-passos", "assistente", "assistente-como-funciona", "glossario"} <= set(ids(guia.secoes))
    assert all(s.nivel == "publico" for s in guia.secoes)
    assert all("<!--" not in s.texto and "COMO PREENCHER" not in s.texto for s in guia.secoes)


@pytest.mark.parametrize("pergunta, primeira", [
    ("O que é a aba Assistente V-Energy?", "assistente"),
    ("Como o assistente funciona?", "assistente-como-funciona"),
    ("Como o agente de inteligência artificial funciona?", "assistente-como-funciona"),
    ("Como cancelo uma ordem?", "ordens"),
    ("Como gero uma ordem de inspeção?", "ordens"),
    ("Onde vejo a falta de luz por alimentador?", "operacao"),
    ("Como uso os filtros?", "primeiros-passos"),
])
def test_guia_real_escolhe_a_secao_da_pergunta(pergunta, primeira):
    assert ids(secoes_para(pergunta))[0] == primeira


def test_guia_e_relido_quando_o_arquivo_muda(tmp_path: Path):
    arquivo = tmp_path / "guia.md"
    arquivo.write_text(EXEMPLO, encoding="utf-8")
    antes = carregar_guia(arquivo)
    arquivo.write_text(EXEMPLO.replace("reúne os dados", "reúne tudo"), encoding="utf-8")
    import os
    os.utime(arquivo, ns=(arquivo.stat().st_atime_ns, arquivo.stat().st_mtime_ns + 1_000_000))
    depois = carregar_guia(arquivo)
    assert depois.versao != antes.versao
    assert depois.secao("sobre").texto == "A plataforma reúne tudo."
    assert CAMINHO_GUIA.name == "plataforma.md"
