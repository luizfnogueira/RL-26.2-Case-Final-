"""Leitura da continuidade pronta na Gold; não reprocessa ocorrências da Silver."""
from sqlalchemy import literal, select
from sqlalchemy.orm import Session

from app.core.config import GOLD_SOURCE
from app.schemas.common import limites
from app.schemas.operacao import FiltrosOperacao

if GOLD_SOURCE == 'real':
    from app.db.gold_contract import TABLES
    MENSAL = TABLES['agg_dec_fec_mensal']
    CADASTRO = TABLES['dim_uc']
else:
    from app.models.gold import DecFecAlimentadorMes, UnidadeConsumidora
    MENSAL = DecFecAlimentadorMes.__table__
    CADASTRO = UnidadeConsumidora.__table__


def consultar_meses(db: Session, filtros: FiltrosOperacao) -> list[dict]:
    inicio, fim = limites(filtros.periodo_atual)
    c = MENSAL.c
    cc = c.ucs_atendidas if GOLD_SOURCE == 'real' else c.ucs_total
    consulta = select(
        c.alimentador, c.municipio, c.mes_referencia, cc.label('ucs_atendidas'),
        c.interrupcoes, c.horas_interrupcao, c.dec, c.fec,
        *[(c[n] if GOLD_SOURCE == 'real' else literal(None)).label(n)
          for n in ('dec_sem_dia_critico', 'fec_sem_dia_critico')],
    ).where(c.mes_referencia.between(inicio, fim))
    if filtros.municipio is not None:
        consulta = consulta.where(c.municipio == filtros.municipio)
    if filtros.alimentador is not None:
        consulta = consulta.where(c.alimentador == filtros.alimentador)
    if filtros.bairro is not None:
        # EXISTS evita multiplicar as métricas por UC. Seleciona alimentadores,
        # preservando o denominador mensal completo de cada um.
        consulta = consulta.where(select(CADASTRO.c.id_uc).where(
            CADASTRO.c.alimentador == c.alimentador,
            CADASTRO.c.municipio == filtros.municipio,
            CADASTRO.c.bairro == filtros.bairro,
        ).exists())
    return [dict(r) for r in db.execute(
        consulta.order_by(c.alimentador, c.mes_referencia)
    ).mappings()]


def consultar_bairros(db: Session, alimentadores: list[str]) -> dict[str, list[str]]:
    """Nomes exatos do cadastro Gold, sem interpretar o texto concatenado da dimensão.

    DISTINCT evita repetir bairro por UC. Um nome de bairro pode conter vírgula;
    dividir dim_alimentador.bairros_atendidos por vírgulas alteraria esse nome.
    """
    if not alimentadores:
        return {}
    linhas = db.execute(select(CADASTRO.c.alimentador, CADASTRO.c.bairro)
                        .where(CADASTRO.c.alimentador.in_(alimentadores)).distinct()
                        .order_by(CADASTRO.c.alimentador, CADASTRO.c.bairro))
    bairros = {}
    for alimentador, bairro in linhas:
        if bairro is not None:
            bairros.setdefault(alimentador, []).append(bairro)
    return {a: sorted(b) for a, b in bairros.items()}
