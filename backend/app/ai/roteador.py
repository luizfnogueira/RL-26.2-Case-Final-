"""Schema Selector (SS do CHESS): roteador determinístico de skills vs. catálogo inteiro (GENAI-23).

Seleciona até 2 skills de domínio com base nas palavras-chave e no glossário do setor elétrico,
sem gastar chamadas ao modelo. Quando nenhuma skill específica é reconhecida, entrega o núcleo
comum acompanhado do catálogo resumido das 14 views da Gold. Também suporta o modo
`catalogo_inteiro` para comparação experimental no golden set (GENAI-23.3 / GENAI-27.3).
"""

from __future__ import annotations

import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Literal

from app.db.gold_contract import COLUMNS, KEYS

ModoSchema = Literal["skills", "catalogo_inteiro"]
SKILLS_DIR = Path(__file__).resolve().parent / "skills"

# Mapa de palavras/expressões normalizadas (sem acento e minúsculas) para cada domínio de skill
MAPA_GLOSSARIO_SKILLS: dict[str, tuple[str, ...]] = {
    "receita": (
        "receita",
        "faturamento",
        "fatura",
        "conta de luz",
        "valor em aberto",
        "inadimplencia",
        "em aberto",
        "tributo",
        "tarifa",
        "reajuste",
        "bandeira",
        "efeito preco",
        "efeito-preco",
        "efeito volume",
        "efeito-volume",
        "ponte",
        "arrecadacao",
    ),
    "consumo": (
        "consumo",
        "kwh",
        "gwh",
        "mwh",
        "energia faturada",
        "volume",
        "conta alta",
        "leitura",
        "medidor",
        "estimada",
        "menor consumo",
        "maior consumo",
        "consumo negativo",
        "queda de consumo",
    ),
    "continuidade": (
        "dec",
        "fec",
        "chi",
        "falta de luz",
        "interrupcao",
        "interrupcoes",
        "ocorrencia",
        "ocorrencias",
        "apagao",
        "sem luz",
        "sem energia",
        "dia critico",
        "alimentador",
        "continuidade",
        "aneel",
        "prodist",
        "duracao",
    ),
    "perdas": (
        "perda",
        "perdas",
        "fila",
        "inspecao",
        "inspecoes",
        "fraude",
        "gato",
        "irregularidade",
        "by-pass",
        "bypass",
        "suspeita",
        "score",
        "recuperar",
        "recuperado",
        "triagem",
        "validacao documental",
        "fiscalizacao",
    ),
    "atendimento": (
        "atendimento",
        "atendimentos",
        "chamado",
        "chamados",
        "call center",
        "protocolo",
        "reclamacao",
        "satisfacao",
        "nota",
        "canal",
        "assunto",
        "tempo de atendimento",
    ),
    "cadastro_gd": (
        "painel solar",
        "paineis solares",
        "solar",
        "geracao distribuida",
        "gd",
        "potencia instalada",
        "kwp",
        "injetada",
        "cadastro",
        "unidades ativas",
        "ucs ativas",
        "ligacao",
    ),
}

DESCRICOES_RESUMIDAS_VIEWS: dict[str, str] = {
    "dim_mes": "Calendário mensal (mes_referencia YYYY-MM, ano, trimestre, periodo P1/P2, bandeira_tarifaria).",
    "dim_uc": "Cadastro de unidades consumidoras (id_uc, municipio, bairro, classe, alimentador, status, medidor e GD; sem dados pessoais).",
    "dim_alimentador": "Cadastro de alimentadores (alimentador, municipio, bairros_atendidos).",
    "fato_uc_mes": "Faturamento e leitura mensal por UC (valor_energia, valor_total, status, consumo_kwh_valido, flag_consumo_negativo).",
    "uc_consumo_comparativo": "Comparativo mensal de consumo da UC contra o mesmo mês do ano anterior (variacao_pct, flag_conta_alta).",
    "uc_interrupcoes": "Ocorrências de interrupção por UC e alimentador (causa, duracao_efetiva_min, flag_dia_critico).",
    "uc_atendimentos": "Chamados de atendimento por UC (canal, assunto, nota_satisfacao, tempo_atendimento_h).",
    "agg_receita_mensal": "Agregado mensal por municipio x bairro x classe (receita_total, receita_energia, consumo_kwh, faturas).",
    "agg_preco_volume": "Decomposição P1 vs P2 por municipio x bairro x classe (efeito_preco, efeito_volume, variacao_receita).",
    "agg_kpis_mensal": "KPIs mensais consolidados da distribuidora (receita, consumo, valor_em_aberto, dec, fec, satisfacao_media).",
    "agg_dec_fec_mensal": "DEC, FEC e CHI mensais por alimentador e município (com e sem dia crítico).",
    "fato_alimentador_mes": "Denominador mensal de UCs atendidas por alimentador (ucs_atendidas).",
    "tb_fila_perdas": "Fila priorizada de inspeção de perdas não técnicas (score, kwh_estimado, motivos, acao_recomendada).",
    "tb_fila_perdas_auditoria": "Universo auditável completo da triagem de perdas por UC.",
}

COLUNAS_CONFIDENCIAIS_OCULTAS = {
    "cpf_cnpj",
    "nome_titular",
    "logradouro",
    "numero",
    "cep",
    "latitude",
    "longitude",
}


def normalizar_texto_roteamento(texto: str) -> str:
    """Remove acentos, converte para minúsculas e colapsa espaços para casamento determinístico."""
    if not texto:
        return ""
    sem_acento = "".join(
        ch for ch in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(ch)
    )
    limpo = re.sub(r"[^a-z0-9\s_-]", " ", sem_acento.lower())
    return " ".join(limpo.split())


def obter_modo_schema(modo_explicito: ModoSchema | None = None) -> ModoSchema:
    """Retorna 'skills' (padrão SS do CHESS) ou 'catalogo_inteiro' (para comparação no golden set)."""
    if modo_explicito in ("skills", "catalogo_inteiro"):
        return modo_explicito
    env_modo = os.getenv("AI_MODO_SCHEMA", "skills").strip().lower()
    if env_modo == "catalogo_inteiro":
        return "catalogo_inteiro"
    return "skills"


def selecionar_skills(pergunta: str, max_skills: int = 2) -> list[str]:
    """Escolhe até `max_skills` skills com maior pontuação de termos do glossário na pergunta (GENAI-23.1).

    Se nenhuma palavra do glossário for reconhecida, retorna lista vazia (para usar o catálogo resumido).
    """
    texto_norm = normalizar_texto_roteamento(pergunta)
    if not texto_norm:
        return []

    pontuacoes: list[tuple[int, int, str]] = []
    for idx_ordem, (skill, termos) in enumerate(MAPA_GLOSSARIO_SKILLS.items()):
        pontos = 0
        for termo in termos:
            padrao = r"\b" + re.escape(termo) + r"\b"
            if re.search(padrao, texto_norm):
                # Termos compostos valem 2 pontos; termos simples valem 1 ponto
                pontos += 2 if " " in termo or "-" in termo else 1
        if pontos > 0:
            pontuacoes.append((pontos, -idx_ordem, skill))

    pontuacoes.sort(reverse=True)
    escolhidas = [skill for _, _, skill in pontuacoes[:max_skills]]
    return escolhidas


def gerar_catalogo_resumido(incluir_todas_colunas: bool = False) -> str:
    """Gera o catálogo das 14 views da Gold (sem colunas confidenciais de PII)."""
    linhas: list[str] = ["### Catálogo da Camada Gold (Views liberadas para o Agente)"]
    for tabela, colunas in COLUMNS.items():
        chaves = ", ".join(KEYS.get(tabela, ()))
        desc = DESCRICOES_RESUMIDAS_VIEWS.get(tabela, "")
        colunas_seguras = [c for c in colunas if c not in COLUNAS_CONFIDENCIAIS_OCULTAS]
        if incluir_todas_colunas:
            cols_str = ", ".join(colunas_seguras)
        else:
            cols_str = ", ".join(colunas_seguras[:10])
            if len(colunas_seguras) > 10:
                cols_str += f", ... (+{len(colunas_seguras) - 10} colunas; use descrever_tabela('{tabela}'))"
        linhas.append(f"- **`{tabela}`** (chave: `{chaves}`): {desc}\n  Colunas: `{cols_str}`")
    return "\n".join(linhas)


def montar_contexto_schema(
    pergunta: str,
    *,
    skills_forcadas: list[str] | None = None,
    modo: ModoSchema | None = None,
) -> tuple[list[str], str]:
    """Retorna `(skills_selecionadas, texto_contexto)` conforme a estratégia SS do CHESS (GENAI-23).

    - Se `modo == 'catalogo_inteiro'`: carrega todas as skills existentes em `ai/skills/` + catálogo completo.
    - Se `modo == 'skills'`: escolhe 1 ou 2 skills pelo roteador. Se encontrar o `.md` da skill, carrega-o
      (com `receita.md` sempre disponível como base se o domínio for `consumo` e `consumo.md` ainda não existir).
      Se nenhuma skill for reconhecida (GENAI-23.2), devolve o catálogo resumido.
    """
    modo_resolvido = obter_modo_schema(modo)

    if modo_resolvido == "catalogo_inteiro":
        todas_skills = sorted(p.stem for p in SKILLS_DIR.glob("*.md")) if SKILLS_DIR.exists() else ["receita"]
        blocos = [p.read_text(encoding="utf-8").strip() for p in sorted(SKILLS_DIR.glob("*.md"))] if SKILLS_DIR.exists() else []
        blocos.append(gerar_catalogo_resumido(incluir_todas_colunas=True))
        return todas_skills or ["catalogo_inteiro"], "\n\n---\n\n".join(blocos)

    skills = list(skills_forcadas) if skills_forcadas is not None else selecionar_skills(pergunta)
    if not skills:
        # GENAI-23.2: Sem skill reconhecida -> núcleo + catálogo resumido
        return [], gerar_catalogo_resumido(incluir_todas_colunas=False)

    blocos_skill: list[str] = []
    arquivos_lidos: set[Path] = set()
    for nome_skill in skills:
        caminho = SKILLS_DIR / f"{nome_skill}.md"
        if not caminho.exists() and nome_skill in {"consumo", "receita"}:
            caminho = SKILLS_DIR / "receita.md"
        if caminho.exists() and caminho not in arquivos_lidos:
            blocos_skill.append(caminho.read_text(encoding="utf-8").strip())
            arquivos_lidos.add(caminho)

    # Inclui também o resumo curto das views para quando a skill ainda não tiver arquivo dedicado
    blocos_skill.append(gerar_catalogo_resumido(incluir_todas_colunas=False))
    return skills, "\n\n---\n\n".join(blocos_skill)
