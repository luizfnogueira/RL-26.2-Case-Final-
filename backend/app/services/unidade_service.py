"""V1a: Visão 360 (GET /unidades e /unidades/{id}): diagnóstico da conta e montagem da resposta."""
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.core.config import GOLD_SOURCE
from app.core.exceptions import GoldNaoCarregadaException, UCInexistenteException
from app.repositories.unidade_repository import (
    ChamadoUC, FaturaUC, FichaUC, InterrupcaoUC, LeituraUC, MesConsumo, UnidadeRepositoryInterface,
)
from app.schemas.common import limites
from app.schemas.unidades import MESES_JANELA, FiltroUnidade, FiltrosUnidades
from app.services.stubs import exemplo, filtrar_regiao, paginar, verificar_cenario

# Mesmo limiar da flag_conta_alta da Gold (p95 da variação), aplicado pela API à média dos meses anteriores.
LIMIAR_MEDIA_PCT = 20
MESES_MEDIA = 12
LIMITE_INTERRUPCOES = 10
HORA_LOCAL = timezone(timedelta(hours=-3))   # Recife, sem horário de verão
# UCs com visão detalhada no fixture (GOLD_SOURCE=seed): uma completa e uma recente, sem GD e estimada.
UC_EXEMPLOS = {'UC-DEMO-001': 'unidade', 'UC-DEMO-007': 'unidade_recente'}


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


def janela_padrao(ultimo_mes: str) -> str:
    """Os 12 meses que terminam no último mês da Gold (acompanha cada recarga)."""
    return f'{somar_meses(ultimo_mes, -(MESES_JANELA - 1))}/{ultimo_mes}'


def _numero(valor: Decimal | None) -> float | None:
    return None if valor is None else float(valor)


def hora_local(instante: datetime) -> datetime:
    """Hora de negócio (interrupções e chamados): a origem exporta hora local e o CSV a marca como UTC.

    Lê o relógio em UTC e troca só o rótulo para -03:00, sem converter. Não vale para
    gold_atualizada_em, que é UTC de verdade.
    """
    return instante.astimezone(timezone.utc).replace(tzinfo=HORA_LOCAL)


def _consumo(meses: list[MesConsumo], periodo: str) -> list[dict]:
    """Os 12 meses da janela, cada um com o mesmo mês do ano anterior.

    Como na série do /dashboard, mês sem dado entra com valores null, nunca some: eixo fixo no gráfico.
    """
    inicio, _ = limites(periodo)
    por_mes = {m.mes: m for m in meses}
    resultado = []
    for i in range(MESES_JANELA):
        mes = somar_meses(inicio, i)
        m = por_mes.get(mes)
        resultado.append({
            'mes': mes,
            'atual': _indicador(m.consumo_kwh if m else None, 'kWh', mes),
            'ano_anterior': _indicador(m.consumo_kwh_ano_anterior if m else None, 'kWh', somar_meses(mes, -12)),
            'tipo_leitura': m.tipo_leitura if m else None,
        })
    return resultado


def _fatura(f: FaturaUC) -> dict:
    return {'id_fatura': f.id_fatura, 'mes_referencia': f.mes_referencia,
            'valor_energia': _numero(f.valor_energia), 'tributos': _numero(f.tributos),
            'valor_total': _numero(f.valor_total), 'bandeira_tarifaria': f.bandeira_tarifaria,
            'data_emissao': f.data_emissao, 'data_vencimento': f.data_vencimento,
            'data_pagamento': f.data_pagamento, 'status': f.status}


def _medidor(ficha: FichaUC, leitura: LeituraUC | None) -> dict | None:
    if ficha.medidor is None:
        return None
    m = ficha.medidor
    return {'id_medidor': m.id_medidor, 'modelo': m.modelo, 'tipo': m.tipo, 'data_instalacao': m.data_instalacao,
            'ultima_leitura': None if leitura is None else {
                'data': leitura.data, 'leitura_kwh': _numero(leitura.leitura_kwh),
                'tipo_leitura': leitura.tipo_leitura}}


def _gd(ficha: FichaUC, periodo: str) -> dict | None:
    if ficha.gd is None:
        return None
    gd = ficha.gd
    return {'potencia_kwp': _numero(gd.potencia_kwp), 'data_conexao': gd.data_conexao, 'modalidade': gd.modalidade,
            'energia_injetada_media_mensal': _indicador(gd.energia_injetada_media_mensal, 'kWh', periodo)}


def _interrupcao(i: InterrupcaoUC) -> dict:
    return {'id_ocorrencia': i.id_ocorrencia, 'alimentador': i.alimentador, 'tipo': i.tipo, 'causa': i.causa,
            'data_abertura': hora_local(i.data_abertura), 'data_encerramento': hora_local(i.data_encerramento),
            'duracao_min': int(i.duracao_min)}


def _chamado(c: ChamadoUC) -> dict:
    return {'protocolo': c.protocolo, 'canal': c.canal, 'assunto': c.assunto, 'subassunto': c.subassunto,
            'data_abertura': hora_local(c.data_abertura), 'data_fechamento': hora_local(c.data_fechamento),
            'nota_satisfacao': _numero(c.nota_satisfacao), 'tempo_atendimento_h': _numero(c.tempo_atendimento_h)}


class UnidadeService:
    """Com GOLD_SOURCE=real lê a Gold pelo repository; com seed devolve o fixture rotulado como fictício."""

    def __init__(self, repository: UnidadeRepositoryInterface | None, fonte: str = GOLD_SOURCE) -> None:
        self.repository = repository
        self.real = fonte == 'real'

    def buscar(self, filtros: FiltrosUnidades) -> dict:
        if not self.real:
            return _buscar_exemplo(filtros)
        itens, total = self.repository.buscar(
            busca=filtros.busca, municipio=filtros.municipio, bairro=filtros.bairro, classe=filtros.classe,
            alimentador=filtros.alimentador, page=filtros.page, page_size=filtros.page_size)
        return {'items': [asdict(uc) for uc in itens], 'page': filtros.page, 'page_size': filtros.page_size,
                'total': total, 'metadados': self.repository.metadados()}

    def detalhar(self, id_uc: str, filtros: FiltroUnidade) -> dict:
        if not self.real:
            return _detalhar_exemplo(id_uc, filtros)
        repo = self.repository
        # Antes da UC: com a Gold vazia, um 404 faria parecer que o ID foi digitado errado.
        ultimo_mes = repo.ultimo_mes()
        if ultimo_mes is None:
            raise GoldNaoCarregadaException()
        ficha = repo.ficha(id_uc)
        if ficha is None:
            raise UCInexistenteException(f"Unidade Consumidora '{id_uc}' não encontrada no cadastro.")
        periodo = filtros.periodo_atual or janela_padrao(ultimo_mes)
        inicio, fim = limites(periodo)
        # 12 meses antes da janela: média e mesmo mês do ano anterior do mês analisado.
        meses = repo.consumo(id_uc, somar_meses(inicio, -12), fim)
        interrupcoes, total_interrupcoes = repo.interrupcoes(id_uc, inicio, fim, LIMITE_INTERRUPCOES)
        c = ficha.cadastro
        return {
            'periodo_referencia': periodo,
            'cadastro': {
                'id_uc': c.id_uc, 'nome_titular': c.nome_titular, 'municipio': c.municipio, 'bairro': c.bairro,
                'classe': c.classe, 'alimentador': c.alimentador, 'status': c.status,
                'cpf_cnpj_mascarado': c.cpf_cnpj, 'telefone': None, 'logradouro': c.logradouro,
                'numero': c.numero, 'uf': c.uf, 'cep': c.cep, 'subgrupo_tarifario': c.subgrupo_tarifario,
                'data_ligacao': c.data_ligacao, 'latitude': _numero(c.latitude),
                'longitude': _numero(c.longitude)},
            'consumo': _consumo(meses, periodo),
            'diagnostico_conta': diagnosticar_conta(meses, periodo),
            'faturas_abertas': [_fatura(f) for f in repo.faturas_abertas(id_uc)],
            'faturas_pagas': [_fatura(f) for f in repo.faturas_pagas(id_uc, inicio, fim)],
            'medidor': _medidor(ficha, repo.ultima_leitura(id_uc)),
            'geracao_distribuida': _gd(ficha, periodo),
            'interrupcoes_recentes': [_interrupcao(i) for i in interrupcoes],
            # Contagem: inteiro, sem o round(float()) das medidas.
            'total_interrupcoes': {'valor': total_interrupcoes, 'unidade': 'interrupcoes',
                                   'periodo_referencia': periodo},
            'chamados': [_chamado(ch) for ch in repo.chamados(id_uc)],
            'metadados': repo.metadados(),
        }


def _buscar_exemplo(filtros: FiltrosUnidades) -> dict:
    base = exemplo('unidades')
    unidades = filtrar_regiao(base['items'], filtros)
    if filtros.busca:
        busca = filtros.busca.casefold()
        unidades = [uc for uc in unidades
                    if busca in uc['id_uc'].casefold() or busca in uc['nome_titular'].casefold()]
    unidades.sort(key=lambda uc: uc['id_uc'])
    return {**paginar(unidades, filtros), 'metadados': base['metadados']}


def _detalhar_exemplo(id_uc: str, filtros: FiltroUnidade) -> dict:
    verificar_cenario(filtros.periodo_atual)
    if id_uc not in UC_EXEMPLOS:
        raise UCInexistenteException(f"Unidade Consumidora '{id_uc}' não disponível no cenário.")
    return exemplo(UC_EXEMPLOS[id_uc])
