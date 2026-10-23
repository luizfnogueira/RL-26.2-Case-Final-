from decimal import Decimal

from app.core.exceptions import CenarioStubIndisponivelException
from app.repositories import dashboard_repository
from app.services import stub_dashboard
from app.services.stubs import PERIODO_ATUAL, PERIODO_COMPARACAO, indicador
from app.schemas.common import limites
from app.schemas.dashboard import FiltrosDashboard

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


def _simulado(filtros: FiltrosDashboard) -> dict:
    """Ponte e drill-down do stub; fora dos recortes e períodos do mock, usa o consolidado simulado."""
    try:
        return stub_dashboard.montar_dashboard(filtros)
    except CenarioStubIndisponivelException:
        consolidado = FiltrosDashboard(periodo_atual=PERIODO_ATUAL, periodo_comparacao=PERIODO_COMPARACAO,
                                       page=filtros.page, page_size=filtros.page_size)
        return stub_dashboard.montar_dashboard(consolidado)


def montar_dashboard(db: Session, filtros: FiltrosDashboard) -> dict:
    """KPIs e série vêm do banco; ponte e drill-down seguem do stub até a B3b."""
    simulado = _simulado(filtros)
    return {
        "filtros": filtros.model_dump(include={"periodo_atual", "periodo_comparacao", *_regiao(filtros)}),
        "indicadores": montar_indicadores(db, filtros),
        "serie_historica": montar_serie(db, filtros),
        "ponte_receita": simulado["ponte_receita"],
        "drill_down": simulado["drill_down"],
        "metadados": {
            **simulado["metadados"],
            "observacoes": ["Indicadores e série histórica calculados no banco; "
                            "ponte de receita e drill-down simulados (B3b)."],
        },
    }
