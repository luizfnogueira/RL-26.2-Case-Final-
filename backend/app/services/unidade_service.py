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


MESES_TEXTO = ('jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez')


def mes_texto(mes: str) -> str:
    """Mês para ler no veredito e no alerta: '2026-06' → 'jun/2026'."""
    return f'{MESES_TEXTO[int(mes[5:]) - 1]}/{mes[:4]}'


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
        avisos.append(f'Leitura estimada em {mes_texto(ultimo.mes)}: o consumo pode ser ajustado '
                      'na próxima leitura real.')
    if anterior and anterior.tipo_leitura == 'ESTIMADA':
        avisos.append(f'Leitura estimada em {mes_texto(anterior.mes)}: a comparação com o ano anterior é fraca.')
    for mes in (ultimo, anterior):
        if mes and mes.troca_medidor:
            avisos.append(f'Troca de medidor em {mes_texto(mes.mes)}: a primeira leitura após a troca '
                          'pode distorcer a comparação.')
    return ' '.join(avisos) or None


CAUSA_NAO_E_CONSUMO = ('Se o valor da conta subiu, a causa não é o consumo, '
                       'e sim tarifa, bandeira tarifária ou tributos.')
CONSUMO_EXPLICA = 'O aumento do consumo explica a conta mais alta.'
# Regra 3×3 (ano anterior × média), cada lado acima, em linha ou abaixo: título e orientação ao
# atendente. Os números ficam no detalhe, montado à parte.
VEREDITOS = {
    ('acima', 'acima'): ('Consumo subiu', CONSUMO_EXPLICA),
    ('acima', 'em linha'): ('Consumo subindo ao longo do ano',
                            'O aumento do consumo explica a conta mais alta: não é um pico só deste mês.'),
    ('acima', 'abaixo'): ('Consumo caindo nos últimos meses',
                          'Contra o ano anterior, o consumo explica a conta mais alta; '
                          'contra os últimos meses, não.'),
    ('em linha', 'acima'): ('Alta sazonal',
                            'O consumo maior é típico desta época do ano e explica a conta mais alta.'),
    ('em linha', 'em linha'): ('Consumo estável', CAUSA_NAO_E_CONSUMO),
    ('em linha', 'abaixo'): ('Consumo caiu', CAUSA_NAO_E_CONSUMO),
    ('abaixo', 'acima'): ('Consumo voltou a subir',
                          'Contra os últimos meses, o consumo explica a conta mais alta; '
                          'contra o ano anterior, não.'),
    ('abaixo', 'em linha'): ('Consumo caiu', CAUSA_NAO_E_CONSUMO),
    ('abaixo', 'abaixo'): ('Consumo caiu', CAUSA_NAO_E_CONSUMO),
}
# Sem o mesmo mês do ano anterior, só a média decide.
VEREDITOS_SEM_ANO_ANTERIOR = {
    'acima': ('Consumo acima da média', CONSUMO_EXPLICA),
    'em linha': ('Consumo em linha com a média', CAUSA_NAO_E_CONSUMO),
    'abaixo': ('Consumo abaixo da média', CAUSA_NAO_E_CONSUMO),
}


def _percentual(valor: Decimal | float) -> str:
    """Percentual inteiro e sem sinal para o texto (−37,4 → '37%'); o meio arredonda para cima."""
    return f'{int(abs(float(valor)) + 0.5)}%'


def _contra(estado: str, percentual: str | None, de: str, com: str) -> str:
    """Uma comparação no texto: '37% abaixo da média…', 'acima de jun/2025' ou 'em linha com …'."""
    if estado == 'em linha':
        return f'em linha {com}'
    return f'{percentual} {estado} {de}' if percentual else f'{estado} {de}'


def _base_media(meses_media: int) -> str:
    """Base da média no texto; com menos de 12 meses, diz quantos tinham consumo."""
    if meses_media == MESES_MEDIA:
        return f'média dos {MESES_MEDIA} meses anteriores'
    if meses_media == 1:
        return 'média de 1 mês anterior com consumo'
    return f'média dos {meses_media} meses anteriores com consumo'


def estados_consumo(consumo: Decimal, conta_alta: bool | None, variacao: Decimal | None,
                    media: float | None) -> tuple[str | None, str | None]:
    """Consumo válido (> 0) do mês contra o ano anterior e contra a média: 'acima', 'abaixo' ou 'em linha'.

    None quando falta a base. Fonte única do veredito e dos fatos do resumo por IA (V1c).
    """
    # Média com três estados e o mesmo limiar nos dois sentidos: acima, abaixo ou em linha.
    estado_media = None
    if media is not None:
        fator = LIMIAR_MEDIA_PCT / 100
        acima_media = float(consumo) > media * (1 + fator)
        abaixo_media = float(consumo) < media * (1 - fator)
        estado_media = 'acima' if acima_media else 'abaixo' if abaixo_media else 'em linha'
    # Ano anterior também com três estados: acima (flag da Gold), abaixo (variacao_pct da Gold
    # abaixo de −20%, estrito) ou em linha. Nenhum dos dois é recalculado aqui.
    estado_ano = None
    if conta_alta is not None:
        caiu_no_ano = conta_alta is False and variacao is not None and variacao < -LIMIAR_MEDIA_PCT
        estado_ano = 'acima' if conta_alta else 'abaixo' if caiu_no_ano else 'em linha'
    return estado_ano, estado_media


def _veredito(mes: str, consumo: Decimal | None, conta_alta: bool | None, variacao: Decimal | None,
              media: float | None, meses_media: int) -> dict:
    """Veredito em três partes: título curto, detalhe com os números e orientação ao atendente."""
    rotulo = mes_texto(mes).capitalize()
    if consumo is None or consumo <= 0:
        return {'titulo': 'Sem consumo válido',
                'detalhe': f'{rotulo} não tem consumo válido: não é possível avaliar a conta.',
                'orientacao': None}
    if conta_alta is None and media is None:
        return {'titulo': 'Sem base de comparação',
                'detalhe': f'{rotulo} não tem o mesmo mês do ano anterior nem meses anteriores com '
                           'consumo para comparar.',
                'orientacao': None}
    estado_ano, estado_media = estados_consumo(consumo, conta_alta, variacao, media)
    # Sem média (só com ano anterior), o texto trata a média como em linha, como sempre tratou.
    estado_media = estado_media or 'em linha'
    desvio_media = None if media is None else _percentual((float(consumo) / media - 1) * 100)
    base = _base_media(meses_media)
    contra_media = _contra(estado_media, desvio_media, f'da {base}', f'com a {base}')
    if conta_alta is None:
        titulo, orientacao = VEREDITOS_SEM_ANO_ANTERIOR[estado_media]
        return {'titulo': titulo,
                'detalhe': f'{rotulo} ficou {contra_media}; não há o mesmo mês do ano anterior para comparar.',
                'orientacao': orientacao}
    ano_anterior = mes_texto(somar_meses(mes, -12))
    contra_ano = _contra(estado_ano, None if variacao is None else _percentual(variacao),
                         f'de {ano_anterior}', f'com {ano_anterior}')
    # O que mudou vem primeiro; sem mudança, uma frase só.
    if estado_ano == estado_media == 'em linha':
        corpo = f'em linha com {ano_anterior} e com a {base}'
    elif estado_ano == 'em linha':
        corpo = f'{contra_media} e {contra_ano}'
    else:
        corpo = f'{contra_ano} e {contra_media}'
    titulo, orientacao = VEREDITOS[estado_ano, estado_media]
    return {'titulo': titulo, 'detalhe': f'{rotulo} ficou {corpo}.', 'orientacao': orientacao}


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
        'veredito': (_veredito(analisado, ultimo.consumo_kwh, conta_alta, ultimo.variacao_pct, media, meses_media)
                     if ultimo else None),
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


def relevancia_do_nome(nome: str, busca: str) -> int:
    """Mesma regra da busca no banco: 1 começa com o termo, 2 outra palavra começa, 3 no meio de
    uma palavra, 4 só o código casa."""
    nome, busca = nome.casefold(), busca.casefold()
    if nome.startswith(busca):
        return 1
    if f' {busca}' in nome:
        return 2
    return 3 if busca in nome else 4


def _buscar_exemplo(filtros: FiltrosUnidades) -> dict:
    base = exemplo('unidades')
    unidades = filtrar_regiao(base['items'], filtros)
    if filtros.busca:
        busca = filtros.busca.strip().casefold()
        unidades = [uc for uc in unidades
                    if busca in uc['id_uc'].casefold() or busca in uc['nome_titular'].casefold()]

    def ordem(uc: dict) -> tuple:
        if not filtros.busca:
            return (0, '', uc['id_uc'])
        grupo = relevancia_do_nome(uc['nome_titular'], filtros.busca.strip())
        return (grupo, '' if grupo == 4 else uc['nome_titular'].casefold(), uc['id_uc'])

    unidades.sort(key=ordem)
    return {**paginar(unidades, filtros), 'metadados': base['metadados']}


def _detalhar_exemplo(id_uc: str, filtros: FiltroUnidade) -> dict:
    verificar_cenario(filtros.periodo_atual)
    if id_uc not in UC_EXEMPLOS:
        raise UCInexistenteException(f"Unidade Consumidora '{id_uc}' não disponível no cenário.")
    return exemplo(UC_EXEMPLOS[id_uc])
