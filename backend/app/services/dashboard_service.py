from decimal import Decimal

from app.repositories import dashboard_repository
from app.services.stubs import indicador
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
            round(valor, 4) for valor in (dec_atual, fec_atual, dec_comparacao, fec_comparacao))

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



MESES_SERIE = 48


def montar_serie(db: Session, filtros: FiltrosDashboard) -> list[dict]:
    """48 meses de receita e energia, terminando no último mês do período atual."""
    _, fim = limites(filtros.periodo_atual)
    # Volta 47 meses a partir do fim: com fim 2026-06, o início é 2022-07
    indice_fim = int(fim[:4]) * 12 + int(fim[5:]) - 1
    indice_inicio = indice_fim - (MESES_SERIE - 1)
    inicio = f"{indice_inicio // 12}-{indice_inicio % 12 + 1:02d}"

    regiao = _regiao(filtros)
    receita = dashboard_repository.serie_receita(db, inicio, fim, regiao)
    energia = dict(dashboard_repository.serie_energia(db, inicio, fim, regiao))   # {mes: kWh}

    # Um ponto por mês; mês sem leitura fica com energia None (ausente), nunca 0
    return [
        {
            "mes": mes,
            "receita": indicador(valor_receita, "BRL", mes),
            "energia": indicador(energia.get(mes), "kWh", mes),
        }
        for mes, valor_receita in receita
    ]
