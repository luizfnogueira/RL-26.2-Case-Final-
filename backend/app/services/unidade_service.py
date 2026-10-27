"""V1a: regras da Visão 360 (GET /unidades/{id}) que não dependem do banco."""
from dataclasses import dataclass
from decimal import Decimal

from app.schemas.common import limites

# Mesmo limiar da flag_conta_alta da Gold (p95 da variação), aplicado pela API à média dos meses anteriores.
LIMIAR_MEDIA_PCT = 20
MESES_MEDIA = 12


@dataclass(frozen=True)
class MesConsumo:
    """Um mês da UC: consumo e comparação da uc_consumo_comparativo + troca de medidor do fato_uc_mes."""
    mes: str
    consumo_kwh: Decimal | None
    consumo_kwh_ano_anterior: Decimal | None
    variacao_pct: Decimal | None
    flag_conta_alta: bool | None
    tipo_leitura: str | None
    troca_medidor: bool = False


def _indicador(valor: Decimal | float | None, unidade: str, periodo: str) -> dict:
    return {'valor': None if valor is None else round(float(valor), 2),
            'unidade': unidade, 'periodo_referencia': periodo}


def somar_meses(mes: str, n: int) -> str:
    total = int(mes[:4]) * 12 + int(mes[5:]) - 1 + n
    return f'{total // 12}-{total % 12 + 1:02d}'


def periodo_media(mes_analisado: str) -> str:
    """Os 12 meses anteriores ao mês analisado, sem incluí-lo (ex.: 2026-06 → 2025-06/2026-05)."""
    return f'{somar_meses(mes_analisado, -MESES_MEDIA)}/{somar_meses(mes_analisado, -1)}'


def media_12_meses(meses: list[MesConsumo], mes_analisado: str) -> tuple[float | None, int]:
    """Média dos 12 meses anteriores ao mês analisado com consumo > 0, e quantos meses entraram.

    Não depende da janela pedida. Com menos de 12 meses válidos, usa os que existirem.
    """
    inicio, fim = limites(periodo_media(mes_analisado))
    validos = [m.consumo_kwh for m in meses
               if inicio <= m.mes <= fim and m.consumo_kwh is not None and m.consumo_kwh > 0]
    if not validos:
        return None, 0
    return round(float(sum(validos) / len(validos)), 2), len(validos)


def _alerta(ultimo: MesConsumo | None, anterior: MesConsumo | None) -> str | None:
    avisos = []
    if ultimo and ultimo.tipo_leitura == 'ESTIMADA':
        avisos.append(f'Leitura ESTIMADA em {ultimo.mes}: o consumo pode ser ajustado na próxima leitura real.')
    if anterior and anterior.tipo_leitura == 'ESTIMADA':
        avisos.append(f'Leitura ESTIMADA em {anterior.mes}: a comparação com o ano anterior é fraca.')
    for mes in (ultimo, anterior):
        if mes and mes.troca_medidor:
            avisos.append(f'Troca de medidor em {mes.mes}: a primeira leitura após a troca '
                          'pode distorcer a comparação.')
    return ' '.join(avisos) or None


def _veredito(mes: str, consumo: Decimal | None, conta_alta: bool | None,
              media: float | None, meses_media: int) -> str:
    if consumo is None or consumo <= 0:
        return f'Sem consumo válido em {mes}: não é possível avaliar a conta.'
    acima_media = media is not None and float(consumo) > media * (1 + LIMIAR_MEDIA_PCT / 100)
    limiar = f'{LIMIAR_MEDIA_PCT}%'
    base = f'média dos meses anteriores ({meses_media} {"mês" if meses_media == 1 else "meses"})'
    if conta_alta is None:
        if media is None:
            return f'Sem base de comparação para {mes}: não há o mesmo mês do ano anterior nem meses anteriores com consumo.'
        if acima_media:
            return (f'Sem o mesmo mês do ano anterior para comparar; o consumo de {mes} ficou '
                    f'mais de {limiar} acima da {base}.')
        return (f'Sem o mesmo mês do ano anterior para comparar; o consumo de {mes} está '
                f'em linha com a {base}.')
    if conta_alta and acima_media:
        return (f'Consumo subiu: {mes} ficou mais de {limiar} acima do mesmo mês do ano anterior '
                f'e da {base}. O aumento do consumo explica a conta mais alta.')
    if conta_alta:
        return (f'Consumo mais de {limiar} acima do mesmo mês do ano anterior, mas em linha com a {base}: '
                'o consumo vem subindo ao longo do ano, não só neste mês.')
    if acima_media:
        return (f'Consumo em linha com o mesmo mês do ano anterior, mas mais de {limiar} acima da {base}: '
                'efeito sazonal do mês.')
    return ('Consumo estável: se o valor da conta subiu, a causa não é o consumo, '
            'e sim tarifa, bandeira tarifária ou tributos.')


def diagnosticar_conta(meses: list[MesConsumo], periodo: str) -> dict:
    """Diagnóstico "a conta veio alta?" do mês analisado: o último mês da janela com dado da UC.

    `meses` traz a janela e os 12 meses anteriores a ela (média, tipo de leitura e troca de
    medidor do mesmo mês do ano anterior). Variação e conta alta vêm da Gold, sem recalcular.
    Janela sem nenhum mês da UC: veredito e mês analisado nulos.
    """
    inicio, fim = limites(periodo)
    na_janela = [m for m in meses if inicio <= m.mes <= fim]
    ultimo = max(na_janela, key=lambda m: m.mes) if na_janela else None
    analisado = ultimo.mes if ultimo else fim
    mes_anterior = somar_meses(analisado, -12)
    anterior = {m.mes: m for m in meses}.get(mes_anterior)
    media, meses_media = media_12_meses(meses, analisado)
    conta_alta = ultimo.flag_conta_alta if ultimo else None
    return {
        'periodo_referencia': ultimo.mes if ultimo else None,
        'conta_alta': conta_alta,
        'veredito': _veredito(analisado, ultimo.consumo_kwh, conta_alta, media, meses_media) if ultimo else None,
        'ultimo_mes': _indicador(ultimo.consumo_kwh if ultimo else None, 'kWh', analisado),
        'mesmo_mes_ano_anterior': _indicador(ultimo.consumo_kwh_ano_anterior if ultimo else None,
                                             'kWh', mes_anterior),
        'media_12_meses': _indicador(media, 'kWh', periodo_media(analisado)),
        'meses_media': meses_media,
        'variacao_percentual': _indicador(ultimo.variacao_pct if ultimo else None, '%', analisado),
        'leitura_estimada': any(m is not None and m.tipo_leitura == 'ESTIMADA' for m in (ultimo, anterior)),
        'alerta': _alerta(ultimo, anterior) if ultimo else None,
    }
