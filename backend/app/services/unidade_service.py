"""V1a: regras da Visão 360 (GET /unidades/{id}) que não dependem do banco."""
from dataclasses import dataclass
from decimal import Decimal

from app.schemas.common import limites

# Mesmo limiar da flag_conta_alta da Gold (p95 da variação), aplicado pela API à média de 12 meses.
LIMIAR_MEDIA_PCT = 20


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


def _ano_anterior(mes: str) -> str:
    return f'{int(mes[:4]) - 1}{mes[4:]}'


def media_12_meses(meses: list[MesConsumo], periodo: str) -> float | None:
    """Média dos meses da janela com consumo > 0; nulos e não positivos ficam de fora."""
    inicio, fim = limites(periodo)
    validos = [m.consumo_kwh for m in meses
               if inicio <= m.mes <= fim and m.consumo_kwh is not None and m.consumo_kwh > 0]
    return round(float(sum(validos) / len(validos)), 2) if validos else None


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


def _veredito(fim: str, consumo: Decimal | None, conta_alta: bool | None, media: float | None) -> str:
    if consumo is None or consumo <= 0:
        return f'Sem consumo válido em {fim}: não é possível avaliar a conta.'
    acima_media = media is not None and float(consumo) > media * (1 + LIMIAR_MEDIA_PCT / 100)
    limiar = f'{LIMIAR_MEDIA_PCT}%'
    if conta_alta is None:
        if media is None:
            return f'Sem base de comparação para {fim}: não há o mesmo mês do ano anterior nem média de 12 meses.'
        if acima_media:
            return (f'Sem o mesmo mês do ano anterior para comparar; o consumo de {fim} ficou '
                    f'mais de {limiar} acima da média de 12 meses.')
        return (f'Sem o mesmo mês do ano anterior para comparar; o consumo de {fim} está '
                'em linha com a média de 12 meses.')
    if conta_alta and acima_media:
        return (f'Consumo subiu: {fim} ficou mais de {limiar} acima do mesmo mês do ano anterior '
                'e da média de 12 meses. O aumento do consumo explica a conta mais alta.')
    if conta_alta:
        return (f'Consumo mais de {limiar} acima do mesmo mês do ano anterior, mas em linha com a média '
                'de 12 meses: o consumo vem subindo ao longo do ano, não só neste mês.')
    if acima_media:
        return (f'Consumo em linha com o mesmo mês do ano anterior, mas mais de {limiar} acima da média '
                'de 12 meses: efeito sazonal do mês.')
    return ('Consumo estável: se o valor da conta subiu, a causa não é o consumo, '
            'e sim tarifa, bandeira tarifária ou tributos.')


def diagnosticar_conta(meses: list[MesConsumo], periodo: str) -> dict:
    """Diagnóstico "a conta veio alta?" do último mês da janela.

    `meses` traz a janela e, se houver, os 12 meses anteriores (tipo de leitura e troca de
    medidor do mesmo mês do ano anterior). Variação e conta alta vêm da Gold, sem recalcular.
    """
    _, fim = limites(periodo)
    mes_anterior = _ano_anterior(fim)
    por_mes = {m.mes: m for m in meses}
    ultimo, anterior = por_mes.get(fim), por_mes.get(mes_anterior)
    media = media_12_meses(meses, periodo)
    consumo = ultimo.consumo_kwh if ultimo else None
    conta_alta = ultimo.flag_conta_alta if ultimo else None
    alerta = _alerta(ultimo, anterior)
    return {
        'conta_alta': conta_alta,
        'veredito': _veredito(fim, consumo, conta_alta, media),
        'ultimo_mes': _indicador(consumo, 'kWh', fim),
        'mesmo_mes_ano_anterior': _indicador(ultimo.consumo_kwh_ano_anterior if ultimo else None,
                                             'kWh', mes_anterior),
        'media_12_meses': _indicador(media, 'kWh', periodo),
        'variacao_percentual': _indicador(ultimo.variacao_pct if ultimo else None, '%', fim),
        'leitura_estimada': any(m is not None and m.tipo_leitura == 'ESTIMADA' for m in (ultimo, anterior)),
        'alerta': alerta,
    }
