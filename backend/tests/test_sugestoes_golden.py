"""GENAI-16.3: toda pergunta sugerida na Tela 7 está no golden set com status ok ou esclarecer.

"Qual bairro mais perdeu volume residencial no último ano?" (pergunta do case) pede esclarecimento: o
clique leva a dois botões, 2025 ou os últimos 12 meses, e cada um responde.

Sugestão da categoria plataforma (respondida pelo guia) também vale como nao_sei enquanto a seção que
vai respondê-la ainda está com [COMPLETAR]; quando a seção for escrita, o golden set passa o item a ok.

Pulado enquanto o golden set (GENAI-26, ai-agent/avaliacao/perguntas.yaml) não existir.
"""
import re
from pathlib import Path

import pytest
import yaml

RAIZ = Path(__file__).resolve().parents[2]
SUGESTOES = RAIZ / "frontend/src/components/assistente/sugestoes.ts"
GOLDEN_SET = RAIZ / "ai-agent/avaliacao/perguntas.yaml"


def sugestoes() -> list[str]:
    fonte = SUGESTOES.read_text(encoding="utf-8")
    blocos = re.findall(r"perguntas:\s*\[(.*?)\]", fonte, re.DOTALL)
    return [p for bloco in blocos for p in re.findall(r"'([^']+)'", bloco)]


def test_sugestoes_sao_lidas_do_front():
    assert 12 <= len(sugestoes()) <= 16


@pytest.mark.skipif(not GOLDEN_SET.exists(), reason="golden set (GENAI-26) ainda não existe")
def test_toda_sugestao_esta_no_golden_set_com_status_ok_ou_esclarecer():
    dados = yaml.safe_load(GOLDEN_SET.read_text(encoding="utf-8"))
    itens = dados if isinstance(dados, list) else dados.get("perguntas", [])
    por_pergunta = {" ".join(str(i["pergunta"]).split()): i for i in itens}
    faltando = [p for p in sugestoes() if not sugestao_valida(por_pergunta.get(p))]
    assert not faltando, f"Sugestões fora do golden set ou sem status ok ou esclarecer: {faltando}"


def sugestao_valida(item: dict | None) -> bool:
    if item is None:
        return False
    if item.get("status_esperado") in ("ok", "esclarecer"):
        return True
    # Plataforma: nao_sei só enquanto a seção do guia que vai responder ainda está por escrever
    if item.get("categoria") == "plataforma" and item.get("status_esperado") == "nao_sei":
        from app.services.guia_plataforma import carregar_guia
        guia = carregar_guia()
        secoes = [guia.secao(s) for s in item.get("secoes_esperadas", [])]
        return bool(secoes) and all(s is not None and "[COMPLETAR" in s.texto for s in secoes)
    return False
