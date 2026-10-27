"""Contrato estrutural da exportacao Gold. Nao depende do formato intermediario."""
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, ForeignKey, MetaData, Numeric, Table, Text

COLUMNS = json.loads(Path(__file__).with_name('gold_columns.json').read_text(encoding='utf-8'))
KEYS = {
    'dim_mes': ('mes_referencia',), 'dim_alimentador': ('alimentador',),
    'dim_uc': ('id_uc',), 'fato_uc_mes': ('id_uc', 'mes_referencia'),
    'fato_alimentador_mes': ('alimentador', 'mes_referencia'),
    'agg_receita_mensal': ('mes_referencia', 'municipio', 'bairro', 'classe'),
    'agg_preco_volume': ('municipio', 'bairro', 'classe'),
    'agg_kpis_mensal': ('mes_referencia',),
    'agg_dec_fec_mensal': ('alimentador', 'mes_referencia'),
    'uc_consumo_comparativo': ('id_uc', 'mes_referencia'),
    'uc_interrupcoes': ('id_ocorrencia',), 'uc_atendimentos': ('protocolo',),
    'tb_fila_perdas_auditoria': ('id_uc',), 'tb_fila_perdas': ('id_uc',),
}
ORDER = tuple(KEYS)  # Pais antes de filhos; exclusao na ordem inversa.
FLAGS = set('queda_qualificada historico_suficiente possui_gd gd_apos_base gd_data_desconhecida houve_troca_na_janela tem_outlier_pareado tem_arredondamento_pareado tem_sem_leitura_anterior_pareada ja_inspecionada inspecao_recente'.split())
INTEGERS = set('ano mes trimestre ucs_atendidas faturas faturas_em_aberto leituras_estimadas interrupcoes ucs_interrompidas ocorrencias_sobrepostas ocorrencias_teto_48h ocorrencias_acima_24h ocorrencias_dia_critico atendimentos inspecoes inspecoes_confirmadas meses_atuais meses_comparaveis meses_estimados pares_estimados pares_observados prioridade_operacional posicao_fila duracao_min duracao_efetiva_min'.split())
DATES = set('data_ligacao data_instalacao_medidor gd_data_conexao data_emissao data_vencimento data_pagamento data_leitura primeira_conexao_gd ultima_inspecao'.split())
DECIMALS = set('latitude longitude gd_potencia_kwp gd_energia_injetada_kwh_media_mensal valor_energia tributos valor_total leitura_anterior leitura_atual consumo_kwh consumo_kwh_valido consumo_kwh_ano_anterior variacao_pct nota_satisfacao tempo_atendimento_h receita_total receita_energia tarifa_media receita_energia_p1 receita_energia_p2 kwh_p1 kwh_p2 tarifa_p1 tarifa_p2 variacao_receita efeito_volume efeito_preco valor_em_aberto inadimplencia horas_interrupcao dec fec dec_sem_dia_critico fec_sem_dia_critico satisfacao_media taxa_acerto_inspecao kwh_recuperado score score_bruto p_queda_pct p_queda_kwh p_estimada penalidades kwh_estimado kwh_potencial_bruto queda_pct queda_kwh_mensal media_anterior media_atual proporcao_pares_estimados'.split())
EXACT = set('score_bruto p_queda_pct p_queda_kwh p_estimada penalidades queda_pct queda_kwh_mensal media_anterior media_atual proporcao_pares_estimados'.split())


class GoldError(ValueError):
    """Mensagem segura: nunca inclui valores ou linhas da fonte."""


def kind(table, column):
    if column == 'mes_referencia':
        return 'date' if table.startswith('tb_fila') else 'month'
    if column in DATES:
        return 'date'
    if column in {'_atualizado_em', 'executado_em_utc', 'data_abertura', 'data_encerramento', 'data_fechamento'}:
        return 'timestamp'
    if column.startswith('flag_') or column in FLAGS:
        return 'bool'
    if column in INTEGERS:
        return 'int'
    if column.endswith('_json'):
        return 'json'
    if column in DECIMALS:
        return 'decimal'
    return 'text'


def numeric_type(column):
    if column in EXACT:
        return Numeric()  # Doubles da heuristica: preservar todos os digitos exportados.
    if column in {'latitude', 'longitude'}:
        return Numeric(9, 6)
    scale = 6 if column.startswith('tarifa_') else 4 if column in {
        'dec', 'fec', 'dec_sem_dia_critico', 'fec_sem_dia_critico', 'inadimplencia', 'taxa_acerto_inspecao'
    } else 2
    return Numeric(14, scale)


def pg_type(table, column):
    return {'date': Date(), 'month': Text(), 'timestamp': DateTime(timezone=True),
            'bool': Boolean(), 'int': BigInteger(), 'json': Text(), 'text': Text(),
            'decimal': numeric_type(column)}[kind(table, column)]


def canonical(table, column, value):
    """Representacao para COPY: exata, validada, sem float intermediario."""
    if value is None or value == '':
        if column in KEYS[table]:
            raise GoldError(f'{table}.{column}: chave nula')
        return None
    try:
        typ = kind(table, column)
        if typ == 'month':
            if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', value):
                raise ValueError()
        elif typ == 'date':
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError()
            date.fromisoformat(value)
        elif typ == 'timestamp':
            instant = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if instant.tzinfo is None:
                raise ValueError()
        elif typ == 'bool':
            if value.lower() not in {'true', 'false', '0', '1'}:
                raise ValueError()
            value = '1' if value.lower() in {'true', '1'} else '0'
        elif typ == 'int':
            if not re.fullmatch(r'-?\d+', value) or not -(2**63) <= int(value) < 2**63:
                raise ValueError()
            value = str(int(value))
        elif typ == 'decimal':
            number = Decimal(value)
            if not number.is_finite():
                raise ValueError()
            spec = numeric_type(column)
            if spec.precision:
                if abs(number) >= Decimal(10) ** (spec.precision - spec.scale):
                    raise ValueError()
                if number != number.quantize(Decimal(10) ** -spec.scale):
                    raise ValueError()
            value = format(number, 'f')
        elif typ == 'json':
            json.loads(value, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        if column == 'cpf_cnpj':
            # Exigir mascara efetiva e impedir documentos completos, mesmo pontuados.
            if not re.search(r'[*xX•]', value) or len(re.sub(r'\D', '', value)) >= 11:
                raise ValueError()
        if column == 'acao_recomendada' and table == 'tb_fila_perdas' and value not in {'INSPECAO_PRIORITARIA', 'VALIDACAO_DOCUMENTAL'}:
            raise ValueError()
        return value
    except (ValueError, InvalidOperation, OverflowError):
        raise GoldError(f'{table}.{column}: valor invalido para {kind(table, column)}') from None


def references(table):
    """FKs simples; a referencia mensal da fila e validada separadamente."""
    refs = {}
    for column, parent in [('id_uc', 'dim_uc'), ('alimentador', 'dim_alimentador'), ('mes_referencia', 'dim_mes')]:
        if column in COLUMNS[table] and table != parent and not (column == 'mes_referencia' and table.startswith('tb_fila')):
            refs[column] = parent
    return refs


metadata = MetaData(schema='gold')
TABLES = {}
for name in ORDER:
    refs = references(name)
    TABLES[name] = Table(name, metadata, *[
        Column(c, pg_type(name, c), *([ForeignKey(f'gold.{refs[c]}.{c}')] if c in refs else []),
               primary_key=c in KEYS[name], nullable=c not in KEYS[name])
        for c in COLUMNS[name]
    ])
