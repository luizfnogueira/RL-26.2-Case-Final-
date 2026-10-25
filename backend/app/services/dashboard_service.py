from decimal import Decimal

from app.repositories import dashboard_repository
from app.services.stubs import indicador, paginar
from app.schemas.common import limites
from app.schemas.dashboard import FiltrosDashboard
from app.models.gold import AggPrecoVolume
from sqlalchemy.orm import Session


Numero = Decimal | int


def variacao(atual: Numero | None, comparacao: Numero | None) -> Decimal | float | None:
    # Sem um dos valores ou com comparação 0, a variação não existe: None, nunca 0.
    if atual is None or comparacao is None or comparacao == 0:
        return None
    resposta = (atual - comparacao) / comparacao * 100
    return round(resposta, 4)

def kpi(
    rotulo: str,
    atual: Numero | None,
    comparacao: Numero | None,
    unidade: str,
    periodo_atual: str,
    periodo_comparacao: str,
) -> dict:
    return {
        "rotulo": rotulo,
        "atual": indicador(atual, unidade, periodo_atual),
        "comparacao": indicador(comparacao, unidade, periodo_comparacao),
        "diferenca": indicador(
            None if atual is None or comparacao is None else atual - comparacao, unidade, periodo_atual),
        "variacao_percentual": indicador(variacao(atual, comparacao), "%", periodo_atual),
    }

def _regiao(filtros: FiltrosDashboard) -> dict:
    """Filtros de região no formato que o repository espera; o que vier None é ignorado."""
    return {
        "municipio": filtros.municipio,
        "bairro": filtros.bairro,
        "classe": filtros.classe,
        "alimentador": filtros.alimentador,
    }


def montar_indicadores(db: Session, filtros: FiltrosDashboard) -> dict:
    inicio_atual, fim_atual = limites(filtros.periodo_atual)
    inicio_comparacao, fim_comparacao = limites(filtros.periodo_comparacao)

    regiao = _regiao(filtros)
    receita_atual = dashboard_repository.somar_receita(db, inicio_atual, fim_atual, regiao)
    receita_comparacao = dashboard_repository.somar_receita(db, inicio_comparacao, fim_comparacao, regiao)

    energia_atual = dashboard_repository.somar_energia(db, inicio_atual, fim_atual, regiao)
    energia_comparacao = dashboard_repository.somar_energia(db, inicio_comparacao, fim_comparacao, regiao)

    ucs_atual = dashboard_repository.contar_ucs_ativas(db, inicio_atual, fim_atual, regiao)
    ucs_comparacao = dashboard_repository.contar_ucs_ativas(db, inicio_comparacao, fim_comparacao, regiao)

    aberto_atual = dashboard_repository.somar_inadimplencia(db, inicio_atual, fim_atual, regiao)
    aberto_comparacao = dashboard_repository.somar_inadimplencia(db, inicio_comparacao, fim_comparacao, regiao)
    
    pct_atual = round(aberto_atual / receita_atual * 100, 4) if receita_atual else None
    pct_comparacao = round(aberto_comparacao / receita_comparacao * 100, 4) if receita_comparacao else None
    pontos_percentuais = (
        None if pct_atual is None or pct_comparacao is None else round(pct_atual - pct_comparacao, 4))

  
    if filtros.bairro or filtros.classe or filtros.alimentador:
        dec_atual = fec_atual = dec_comparacao = fec_comparacao = None
    else:
        dec_atual, fec_atual = dashboard_repository.somar_continuidade(db, inicio_atual, fim_atual, filtros.municipio)
        dec_comparacao, fec_comparacao = dashboard_repository.somar_continuidade(
            db, inicio_comparacao, fim_comparacao, filtros.municipio)
      
        dec_atual, fec_atual, dec_comparacao, fec_comparacao = (
            None if valor is None else round(valor, 4)
            for valor in (dec_atual, fec_atual, dec_comparacao, fec_comparacao))

    return {
        "receita_faturada": kpi(
            "Receita faturada",
            receita_atual,
            receita_comparacao,
            "BRL",
            filtros.periodo_atual,
            filtros.periodo_comparacao,
        ),
        "energia_faturada": kpi(
            "Volume faturado",
            energia_atual,
            energia_comparacao,
            "kWh",
            filtros.periodo_atual,
            filtros.periodo_comparacao,
        ),
        "ucs_ativas": kpi(
            "UCs ativas",
            ucs_atual,
            ucs_comparacao,
            "UCs",
            filtros.periodo_atual,
            filtros.periodo_comparacao,
        ),
        "inadimplencia": {
            **kpi(
                "Valor em aberto",
                aberto_atual,
                aberto_comparacao,
                "BRL",
                filtros.periodo_atual,
                filtros.periodo_comparacao,
            ),
            "percentual_receita_atual": indicador(pct_atual, "%", filtros.periodo_atual),
            "percentual_receita_comparacao": indicador(pct_comparacao, "%", filtros.periodo_comparacao),
            "variacao_pontos_percentuais": indicador(pontos_percentuais, "p.p.", filtros.periodo_atual),
        },
        "dec_medio": kpi(
            "DEC médio",
            dec_atual,
            dec_comparacao,
            "h/UC",
            filtros.periodo_atual,
            filtros.periodo_comparacao,
        ),
        "fec_medio": kpi(
            "FEC médio",
            fec_atual,
            fec_comparacao,
            "interrupcoes/UC",
            filtros.periodo_atual,
            filtros.periodo_comparacao,
        ),
    }



def montar_serie(db: Session, filtros: FiltrosDashboard) -> list[dict]:
    """Um ponto por mês do calendário da base (jul/2022–jun/2026), independente das janelas de comparação."""
    meses = dashboard_repository.meses_da_base(db)
    if not meses:
        return []
    regiao = _regiao(filtros)
    receita = dict(dashboard_repository.serie_receita(db, meses[0], meses[-1], regiao))   # {mes: BRL}
    energia = dict(dashboard_repository.serie_energia(db, meses[0], meses[-1], regiao))   # {mes: kWh}

    # Mês sem fatura ou sem leitura no recorte fica com valor None (ausente), nunca 0 e nunca fora da série
    return [
        {
            "mes": mes,
            "receita": indicador(receita.get(mes), "BRL", mes),
            "energia": indicador(energia.get(mes), "kWh", mes),
        }
        for mes in meses
    ]


# A decomposição da Gold (agg_preco_volume) só existe para P1 × P2 e por município × bairro × classe
PERIODO_P2, PERIODO_P1 = "2025-07/2026-06", "2022-07/2023-06"


def sem_decomposicao(filtros: FiltrosDashboard) -> str | None:
    """Motivo de a Gold não ter a decomposição do pedido; None quando ela existe."""
    if (filtros.periodo_atual, filtros.periodo_comparacao) != (PERIODO_P2, PERIODO_P1):
        return (f"Ponte de receita e drill-down só existem para periodo_atual={PERIODO_P2} e "
                f"periodo_comparacao={PERIODO_P1}, as janelas da decomposição da Gold.")
    if filtros.alimentador is not None:
        return "Ponte de receita e drill-down não existem por alimentador; a decomposição da Gold é por município, bairro e classe."
    return None


def montar_ponte(linhas: list[AggPrecoVolume], filtros: FiltrosDashboard) -> dict:
    """Cascata da receita de energia: comparação + efeito preço + efeito volume = atual (P1 → P2).

    Só soma os efeitos que a Gold já calculou por recorte; não refaz a decomposição.
    """
    if linhas:
        receita_comparacao = sum(linha.receita_energia_p1 for linha in linhas)
        receita_atual = sum(linha.receita_energia_p2 for linha in linhas)
        efeito_preco = sum(linha.efeito_preco for linha in linhas)
        efeito_volume = sum(linha.efeito_volume for linha in linhas)
        kwh_comparacao = sum(linha.kwh_p1 for linha in linhas)
        kwh_atual = sum(linha.kwh_p2 for linha in linhas)
    else:
        # Recorte sem linhas na Gold: ausente (None), nunca 0
        receita_comparacao = receita_atual = efeito_preco = efeito_volume = kwh_comparacao = kwh_atual = None

    # Tarifa do conjunto = receita total ÷ kWh total (somar as tarifas dos recortes não dá a tarifa média)
    tarifa_comparacao = receita_comparacao / kwh_comparacao if kwh_comparacao else None
    tarifa_atual = receita_atual / kwh_atual if kwh_atual else None

    return {
        "receita_energia_comparacao": indicador(receita_comparacao, "BRL", filtros.periodo_comparacao),
        "efeito_preco": indicador(efeito_preco, "BRL", filtros.periodo_atual),
        "efeito_volume": indicador(efeito_volume, "BRL", filtros.periodo_atual),
        "receita_energia_atual": indicador(receita_atual, "BRL", filtros.periodo_atual),
        "reajuste_percentual": indicador(variacao(tarifa_atual, tarifa_comparacao), "%", filtros.periodo_atual),
    }


def montar_drill(linhas: list[AggPrecoVolume], filtros: FiltrosDashboard) -> dict:
    """Uma linha por item do nível pedido, ordenada pela maior queda de kWh (depois nome), paginada."""
    nivel = filtros.nivel
    grupos: dict[str, list[AggPrecoVolume]] = {}
    for linha in linhas:
        grupos.setdefault(getattr(linha, nivel), []).append(linha)

    itens = []
    for nome, grupo in grupos.items():
        receita_comparacao = sum(linha.receita_energia_p1 for linha in grupo)
        receita_atual = sum(linha.receita_energia_p2 for linha in grupo)
        kwh_comparacao = sum(linha.kwh_p1 for linha in grupo)
        kwh_atual = sum(linha.kwh_p2 for linha in grupo)
        # Filtros para reenviar com o próximo nível: os atuais mais o valor desta linha
        linha_filtros = {campo: getattr(filtros, campo) for campo in ("municipio", "bairro", "classe")}
        linha_filtros[nivel] = nome
        itens.append({
            "nivel": nivel,
            "nome": nome,
            "receita_energia_atual": indicador(receita_atual, "BRL", filtros.periodo_atual),
            "receita_energia_comparacao": indicador(receita_comparacao, "BRL", filtros.periodo_comparacao),
            "energia_atual": indicador(kwh_atual, "kWh", filtros.periodo_atual),
            "energia_comparacao": indicador(kwh_comparacao, "kWh", filtros.periodo_comparacao),
            "variacao_energia_percentual": indicador(variacao(kwh_atual, kwh_comparacao), "%", filtros.periodo_atual),
            "queda_kwh": indicador(kwh_comparacao - kwh_atual, "kWh", filtros.periodo_atual),
            "efeito_preco": indicador(sum(linha.efeito_preco for linha in grupo), "BRL", filtros.periodo_atual),
            "efeito_volume": indicador(sum(linha.efeito_volume for linha in grupo), "BRL", filtros.periodo_atual),
            "filtros": linha_filtros,
        })
    itens.sort(key=lambda item: (-item["queda_kwh"]["valor"], item["nome"]))

    vazio = {"municipio": None, "bairro": None, "classe": None}
    breadcrumb = [{"nivel": "consolidado", "rotulo": "Todos os municípios", "filtros": vazio}]
    if nivel in ("bairro", "classe"):
        breadcrumb.append({"nivel": "municipio", "rotulo": filtros.municipio,
                           "filtros": {**vazio, "municipio": filtros.municipio}})
    if nivel == "classe":
        breadcrumb.append({"nivel": "bairro", "rotulo": filtros.bairro,
                           "filtros": {**vazio, "municipio": filtros.municipio, "bairro": filtros.bairro}})
    return {"nivel": nivel, "breadcrumb": breadcrumb, **paginar(itens, filtros)}


def montar_dashboard(db: Session, filtros: FiltrosDashboard) -> dict:
    """KPIs e série calculados no banco; ponte e drill-down lidos da decomposição da Gold."""
    observacoes = ["Dados fictícios do seed, com as regras da Gold."]
    if motivo := sem_decomposicao(filtros):
        # Fora da decomposição da Gold: ponte e drill-down ausentes; KPIs e série seguem calculados
        linhas = []
        observacoes.append(motivo)
    else:
        regiao = {campo: getattr(filtros, campo) for campo in ("municipio", "bairro", "classe")}
        linhas = dashboard_repository.linhas_preco_volume(db, regiao)
    return {
        "filtros": filtros.model_dump(include={"periodo_atual", "periodo_comparacao", *_regiao(filtros)}),
        "indicadores": montar_indicadores(db, filtros),
        "serie_historica": montar_serie(db, filtros),
        "ponte_receita": montar_ponte(linhas, filtros),
        "drill_down": montar_drill(linhas, filtros),
        "metadados": {
            "dados_ficticios": True,
            "gold_atualizada_em": None,
            "observacoes": observacoes,
        },
    }
