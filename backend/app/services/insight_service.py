"""B5: POST /ia/insight da receita. Os números vêm da ponte real da Gold; o texto, do módulo da Equipe 3.

Falha do módulo (fora do ar, lento além do IA_TIMEOUT_S, resposta fora do formato) não derruba a tela:
diferente do chat (POST /ia, que responde 503 AGENTE_INDISPONIVEL), aqui o texto é trocado por um
resumo montado por regra sobre os mesmos números, e `metadados.observacoes` avisa da troca.
"""
import logging
from datetime import datetime
from typing import Annotated, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError
from sqlalchemy.orm import Session

from app.core import config
from app.core.exceptions import AgenteIndisponivelException, AppException
from app.repositories import dashboard_repository
from app.repositories.gold_metadata import metadados_gold
from app.schemas.common import limites
from app.schemas.dashboard import FiltrosDashboard
from app.schemas.ia import PedidoInsight
from app.services import dashboard_service
from app.services.stubs import indicador

logger = logging.getLogger(__name__)

# O front reconhece o texto alternativo por este prefixo em `metadados.observacoes` (ver contrato, seção 10).
PREFIXO_TEXTO_ALTERNATIVO = "Texto alternativo:"
OBSERVACAO_BASE = "Dados fictícios do seed, com as regras da Gold."
TITULO_PADRAO = "Por que a receita mudou?"


class TextoInsight(BaseModel):
    """O que o módulo da Equipe 3 devolve: só título e texto. Os números nunca vêm dele."""
    model_config = ConfigDict(extra="ignore")
    titulo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    texto: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class GeradorInsight(Protocol):
    """Recebe o recorte e os números já calculados; devolve {"titulo", "texto"}."""

    def gerar(self, pedido: dict) -> dict: ...


# ---------- números da Gold ----------

def _numero(nome: str, rotulo: str, ind: dict) -> dict:
    return {"nome": nome, "rotulo": rotulo, **ind}


def numeros_da_receita(db: Session, filtros: FiltrosDashboard) -> list[dict]:
    """Os seis números do insight, lidos da mesma ponte e dos mesmos KPIs do GET /dashboard.

    Mesma fonte do dashboard, então o que a tela mostra e o que a IA recebe sempre coincidem.
    """
    if motivo := dashboard_service.sem_decomposicao(filtros):
        raise AppException(motivo, codigo="DECOMPOSICAO_INDISPONIVEL", status_code=422)
    regiao = {campo: getattr(filtros, campo) for campo in ("municipio", "bairro", "classe")}
    linhas = dashboard_repository.linhas_preco_volume(db, regiao)
    ponte = dashboard_service.montar_ponte(linhas, filtros)
    if ponte["efeito_preco"]["valor"] is None:
        raise AppException("A Gold não tem decomposição de preço e volume para este recorte.",
                           codigo="DECOMPOSICAO_INDISPONIVEL", status_code=422)

    energia_atual = dashboard_repository.somar_energia(db, *limites(filtros.periodo_atual), regiao)
    energia_comparacao = dashboard_repository.somar_energia(db, *limites(filtros.periodo_comparacao), regiao)
    variacao_volume = indicador(
        dashboard_service.variacao(energia_atual, energia_comparacao), "%", filtros.periodo_atual)

    return [
        _numero("receita_energia_atual", "Receita de energia atual", ponte["receita_energia_atual"]),
        _numero("receita_energia_comparacao", "Receita de energia base", ponte["receita_energia_comparacao"]),
        _numero("variacao_volume", "Volume", variacao_volume),
        _numero("reajuste", "Reajuste", ponte["reajuste_percentual"]),
        _numero("efeito_preco", "Efeito-preço", ponte["efeito_preco"]),
        _numero("efeito_volume", "Efeito-volume", ponte["efeito_volume"]),
    ]


def conferir_indicadores(enviados: list, esperados: list[dict]) -> None:
    """Indicadores enviados pelo front são opcionais, mas se vierem precisam bater com a Gold (senão 422)."""
    if not enviados:
        return
    recebidos = {i.nome: i for i in enviados}
    divergente = recebidos.keys() != {n["nome"] for n in esperados} or any(
        recebidos[n["nome"]].valor is None
        or abs(float(recebidos[n["nome"]].valor) - float(n["valor"])) > 0.01
        or recebidos[n["nome"]].unidade != n["unidade"]
        or recebidos[n["nome"]].periodo_referencia != n["periodo_referencia"]
        for n in esperados
    )
    if divergente:
        raise AppException("Os indicadores enviados não correspondem aos números da Gold para este recorte.",
                           codigo="DADOS_INVALIDOS", status_code=422)


# ---------- texto ----------

def _brl(valor: float) -> str:
    sinal = "−" if valor < 0 else ""
    valor = abs(valor)
    if valor >= 1_000_000:
        texto = f"{valor / 1_000_000:.1f} milhões"
    elif valor >= 1_000:
        texto = f"{valor / 1_000:.1f} mil"
    else:
        texto = f"{valor:.2f}"
    return f"{sinal}R$ {texto.replace('.', ',')}"


def _pct(valor: float, sinal: bool = True) -> str:
    return (f"{valor:+.1f}%" if sinal else f"{valor:.1f}%").replace(".", ",").replace("-", "−")


_MINUSCULAS = {"de", "da", "do", "das", "dos", "e"}


def _nome(valor: str) -> str:
    """Só para ler no texto: a Gold guarda nomes em maiúsculas ("BOA VISTA"). A consulta usa o valor do banco."""
    if valor != valor.upper() or valor == valor.lower():
        return valor
    palavras = valor.lower().split(" ")
    return " ".join(p if i and p in _MINUSCULAS else p.capitalize() for i, p in enumerate(palavras))


def texto_por_regra(filtros: FiltrosDashboard, numeros: list[dict]) -> TextoInsight:
    """Resumo montado só com os números, sem IA. Serve ao modo mock e de texto alternativo."""
    v = {n["nome"]: float(n["valor"]) for n in numeros}
    regiao = " / ".join(
        _nome(valor) for campo in ("municipio", "bairro", "classe")
        if (valor := getattr(filtros, campo)))
    recorte = f"Em {regiao}" if regiao else "No consolidado"
    texto = (
        f"{recorte}, a receita de energia passou de {_brl(v['receita_energia_comparacao'])} "
        f"para {_brl(v['receita_energia_atual'])}. "
        f"O reajuste de {_pct(v['reajuste'], sinal=False)} gerou um efeito-preço de {_brl(v['efeito_preco'])}, "
        f"enquanto o volume faturado variou {_pct(v['variacao_volume'])} e respondeu por um efeito-volume "
        f"de {_brl(v['efeito_volume'])}."
    )
    if v["efeito_preco"] > 0 > v["efeito_volume"]:
        texto += " O crescimento da receita veio do preço, não de mais consumo."
    return TextoInsight(titulo=TITULO_PADRAO, texto=texto)


class GeradorMock:
    """IA_MODO=mock: texto por regra, sem chamar o módulo da Equipe 3."""

    def gerar(self, pedido: dict) -> dict:
        return texto_por_regra(pedido["filtros"], pedido["numeros_utilizados"]).model_dump()


class GeradorReal:
    """IA_MODO=real: chama o módulo da Equipe 3 por HTTP, com o IA_TIMEOUT_S de toda a ponte de IA.

    Formato assumido até a Equipe 3 confirmar (29/10): POST em IA_INSIGHT_URL com
    {"contexto", "filtros", "numeros_utilizados"} e resposta {"titulo", "texto"}. A chave vai só no
    header, vinda do .env, e nunca aparece na resposta da API.
    """

    def __init__(self, url: str | None = None, chave: str | None = None,
                 timeout_s: float | None = None, cliente: httpx.Client | None = None) -> None:
        self.url = config.IA_INSIGHT_URL if url is None else url
        self.chave = config.IA_API_KEY if chave is None else chave
        self.timeout_s = config.IA_TIMEOUT_S if timeout_s is None else timeout_s
        self.cliente = cliente

    def gerar(self, pedido: dict) -> dict:
        if not self.url:
            raise AgenteIndisponivelException()
        corpo = {
            "contexto": "receita",
            "filtros": pedido["filtros"].model_dump(include={
                "periodo_atual", "periodo_comparacao", "municipio", "bairro", "classe", "alimentador"}),
            "numeros_utilizados": [
                {**n, "valor": float(n["valor"])} for n in pedido["numeros_utilizados"]],
        }
        cabecalhos = {"Authorization": f"Bearer {self.chave}"} if self.chave else {}
        enviar = (self.cliente or httpx).post
        resposta = enviar(self.url, json=corpo, headers=cabecalhos, timeout=self.timeout_s)
        resposta.raise_for_status()
        return resposta.json()


def obter_gerador_insight() -> GeradorInsight:
    """Gerador do IA_MODO do .env; dependência da rota, trocada por um gerador falso nos testes."""
    return GeradorMock() if config.IA_MODO == "mock" else GeradorReal()


# ---------- caso de uso ----------

def _metadados(db, *observacoes: str) -> dict:
    metadata = metadados_gold(db, "agg_preco_volume", OBSERVACAO_BASE)
    metadata["observacoes"].extend(observacoes)
    return metadata


def gerar_insight_receita(db: Session, dados: PedidoInsight, gerador: GeradorInsight) -> dict:
    filtros = FiltrosDashboard(**dados.filtros.model_dump())
    numeros = numeros_da_receita(db, filtros)
    conferir_indicadores(dados.indicadores, numeros)

    observacoes: list[str] = []
    try:
        texto = TextoInsight.model_validate(
            gerador.gerar({"filtros": filtros, "numeros_utilizados": numeros}))
    except (AgenteIndisponivelException, httpx.HTTPError, ValidationError, ValueError, TypeError, KeyError) as erro:
        # Timeout, módulo fora do ar, erro HTTP ou resposta fora do formato: o texto por regra assume
        logger.warning("Módulo de insight indisponível; usando texto alternativo (%s)", type(erro).__name__)
        texto = texto_por_regra(filtros, numeros)
        observacoes.append(
            f"{PREFIXO_TEXTO_ALTERNATIVO} o módulo de IA não respondeu; resumo montado por regra "
            "sobre os mesmos números.")

    return {
        "titulo": texto.titulo,
        "texto": texto.texto,
        "numeros_utilizados": numeros,
        "gerado_em": datetime.now().astimezone(),
        "metadados": _metadados(db, *observacoes),
    }
