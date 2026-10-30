"""GENAI-16.3: toda pergunta sugerida na Tela 7 está no golden set com status ok.

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
def test_toda_sugestao_esta_no_golden_set_com_status_ok():
    dados = yaml.safe_load(GOLDEN_SET.read_text(encoding="utf-8"))
    itens = dados if isinstance(dados, list) else dados.get("perguntas", [])
    status = {" ".join(str(i["pergunta"]).split()): i.get("status_esperado") for i in itens}
    faltando = [p for p in sugestoes() if status.get(p) != "ok"]
    assert not faltando, f"Sugestões fora do golden set ou sem status ok: {faltando}"
