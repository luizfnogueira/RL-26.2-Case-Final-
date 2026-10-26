"""Tabelas do schema `gold` (provisórias).

Espelham as colunas de negócio e as flags das Silvers de data-engineering/bronze-to-silver,
sem as colunas de rastreio (_source_file, _ingestion_timestamp). Quando o time de dados
fechar o contrato da Gold, os ajustes ficam aqui e nos repositories; nada muda no portal.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import GoldBase

Dinheiro = Numeric(14, 2)
Energia = Numeric(14, 2)


def flag() -> Mapped[bool]:
    return mapped_column(Boolean, nullable=False, default=False)


class UnidadeConsumidora(GoldBase):
    """silver.tb_unidades_consumidoras"""

    __tablename__ = "unidades_consumidoras"

    id_uc: Mapped[str] = mapped_column(String(8), primary_key=True)
    cpf_cnpj: Mapped[str] = mapped_column(String(14))
    nome_titular: Mapped[str] = mapped_column(String(200))
    logradouro: Mapped[str] = mapped_column(String(200))
    numero: Mapped[str] = mapped_column(String(20))
    bairro: Mapped[str] = mapped_column(String(100), index=True)
    municipio: Mapped[str] = mapped_column(String(100), index=True)
    uf: Mapped[str] = mapped_column(String(2))
    cep: Mapped[str | None] = mapped_column(String(8))
    classe: Mapped[str] = mapped_column(String(20), index=True)
    subgrupo_tarifario: Mapped[str] = mapped_column(String(2))
    alimentador: Mapped[str] = mapped_column(String(20), index=True)
    data_ligacao: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))
    latitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal] = mapped_column(Numeric(9, 6))
    flag_data_ligacao_suspeita: Mapped[bool] = flag()
    flag_documento_classe_inconsistente: Mapped[bool] = flag()
    flag_classe_subgrupo_inconsistente: Mapped[bool] = flag()
    flag_alimentador_municipio_inconsistente: Mapped[bool] = flag()


class FilaPerdasAuditoria(GoldBase):
    __tablename__ = "tb_fila_perdas_auditoria"
    id_uc: Mapped[str] = mapped_column(String(8), primary_key=True)

class FilaPerdas(GoldBase):
    __tablename__ = "tb_fila_perdas"

    id_uc: Mapped[str] = mapped_column(String(8), primary_key=True)
    posicao_fila: Mapped[int | None] = mapped_column(Integer)
    status_triagem: Mapped[str] = mapped_column(String(20), index=True)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    kwh_estimado: Mapped[Decimal] = mapped_column(Energia)
    motivos_json: Mapped[str] = mapped_column(Text)
    confianca_evidencia: Mapped[str] = mapped_column(String(20))


class Medidor(GoldBase):
    """silver.tb_medidores"""

    __tablename__ = "medidores"

    id_medidor: Mapped[str] = mapped_column(String(20), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    modelo: Mapped[str] = mapped_column(String(20))
    tipo: Mapped[str] = mapped_column(String(20))
    data_instalacao: Mapped[date] = mapped_column(Date)
    data_retirada: Mapped[date | None] = mapped_column(Date)
    data_ultima_manutencao: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))
    flag_status_retirada_inconsistente: Mapped[bool] = flag()
    flag_retirada_antes_instalacao: Mapped[bool] = flag()
    flag_modelo_tipo_inconsistente: Mapped[bool] = flag()


class Fatura(GoldBase):
    """silver.tb_faturas"""

    __tablename__ = "faturas"
    __table_args__ = (UniqueConstraint("id_uc", "mes_referencia"),)

    id_fatura: Mapped[str] = mapped_column(String(20), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    mes_referencia: Mapped[str] = mapped_column(String(7), index=True)
    valor_energia: Mapped[Decimal] = mapped_column(Dinheiro)
    tributos: Mapped[Decimal] = mapped_column(Dinheiro)
    valor_total: Mapped[Decimal] = mapped_column(Dinheiro)
    bandeira_tarifaria: Mapped[str] = mapped_column(String(20))
    data_emissao: Mapped[date] = mapped_column(Date)
    data_vencimento: Mapped[date] = mapped_column(Date)
    data_pagamento: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))
    flag_total_inconsistente: Mapped[bool] = flag()
    flag_status_pagamento_inconsistente: Mapped[bool] = flag()


class Leitura(GoldBase):
    """silver.tb_leituras (chave id_medidor + mes_referencia, a mesma da Silver sem id_leitura)."""

    __tablename__ = "leituras"

    id_medidor: Mapped[str] = mapped_column(String(20), primary_key=True)
    mes_referencia: Mapped[str] = mapped_column(String(7), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    data_leitura: Mapped[date] = mapped_column(Date)
    leitura_anterior: Mapped[Decimal | None] = mapped_column(Energia)
    leitura_atual: Mapped[Decimal] = mapped_column(Energia)
    consumo_kwh: Mapped[Decimal] = mapped_column(Energia)
    tipo_leitura: Mapped[str] = mapped_column(String(20))
    flag_primeira_leitura_pos_troca: Mapped[bool] = flag()
    flag_leitura_anterior_ausente: Mapped[bool] = flag()
    flag_leitura_estimada: Mapped[bool] = flag()
    flag_consumo_negativo: Mapped[bool] = flag()
    flag_consumo_inconsistente: Mapped[bool] = flag()


class GeracaoDistribuida(GoldBase):
    """silver.tb_geracao_distribuida"""

    __tablename__ = "geracao_distribuida"

    id_uc: Mapped[str] = mapped_column(String(8), primary_key=True)
    potencia_kwp: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    data_conexao: Mapped[date] = mapped_column(Date)
    modalidade: Mapped[str] = mapped_column(String(60))
    energia_injetada_kwh_media_mensal: Mapped[Decimal] = mapped_column(Energia)
    flag_potencia_escala_suspeita: Mapped[bool] = flag()
    flag_potencia_nao_positiva: Mapped[bool] = flag()
    flag_energia_injetada_negativa: Mapped[bool] = flag()
    flag_data_conexao_fora_historico: Mapped[bool] = flag()


class Inspecao(GoldBase):
    """silver.tb_inspecoes: histórico de inspeções da fonte (não são as ordens do portal)."""

    __tablename__ = "inspecoes"

    id_inspecao: Mapped[str] = mapped_column(String(20), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    data: Mapped[date] = mapped_column(Date)
    inspetor: Mapped[str] = mapped_column(String(100))
    resultado: Mapped[str] = mapped_column(String(40))
    tipo_irregularidade: Mapped[str | None] = mapped_column(String(60))
    kwh_recuperado: Mapped[Decimal] = mapped_column(Energia)
    flag_recuperacao_negativa: Mapped[bool] = flag()
    flag_resultado_tipo_inconsistente: Mapped[bool] = flag()
    flag_confirmada_sem_tipo: Mapped[bool] = flag()
    flag_recuperacao_sem_irregularidade: Mapped[bool] = flag()
    flag_inspecao_fora_historico: Mapped[bool] = flag()
    flag_data_fora_periodo_aba: Mapped[bool] = flag()


class OcorrenciaRede(GoldBase):
    """silver.tb_ocorrencias_rede"""

    __tablename__ = "ocorrencias_rede"

    id_ocorrencia: Mapped[str] = mapped_column(String(20), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    alimentador: Mapped[str] = mapped_column(String(20), index=True)
    tipo: Mapped[str] = mapped_column(String(40))
    causa: Mapped[str] = mapped_column(String(40))
    data_abertura: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data_encerramento: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duracao_min: Mapped[int] = mapped_column(Integer)
    flag_longa_duracao: Mapped[bool] = flag()
    flag_duracao_teto: Mapped[bool] = flag()
    flag_sobreposicao: Mapped[bool] = flag()
    flag_duracao_inconsistente: Mapped[bool] = flag()
    flag_encerramento_antes_abertura: Mapped[bool] = flag()
    flag_alimentador_inconsistente: Mapped[bool] = flag()


class Atendimento(GoldBase):
    """silver.tb_atendimentos"""

    __tablename__ = "atendimentos"

    protocolo: Mapped[str] = mapped_column(String(20), primary_key=True)
    id_uc: Mapped[str] = mapped_column(String(8), index=True)
    canal: Mapped[str] = mapped_column(String(20))
    assunto: Mapped[str] = mapped_column(String(60))
    subassunto: Mapped[str] = mapped_column(String(60))
    data_abertura: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data_fechamento: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    nota_satisfacao: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    flag_fechamento_antes_abertura: Mapped[bool] = flag()
    flag_assunto_subassunto_inconsistente: Mapped[bool] = flag()


class AtendimentoHistorico(GoldBase):
    """silver.tb_atendimentos_historico"""

    __tablename__ = "atendimentos_historico"

    protocolo: Mapped[str] = mapped_column(String(20), primary_key=True)
    sequencia: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    acao: Mapped[str] = mapped_column(String(40))
    canal: Mapped[str] = mapped_column(String(20))
    flag_sequencia_inconsistente: Mapped[bool] = flag()
    flag_evento_fora_atendimento: Mapped[bool] = flag()
    flag_canal_diferente_atendimento: Mapped[bool] = flag()


class DecFecAlimentadorMes(GoldBase):
    """gold_dec_fec_alimentador_mes do cronograma (D-R, Arthur).

    DEC = Σ horas de interrupção das UCs ÷ total de UCs do alimentador;
    FEC = nº de interrupções de UC ÷ total de UCs do alimentador.
    """

    __tablename__ = "dec_fec_alimentador_mes"

    alimentador: Mapped[str] = mapped_column(String(20), primary_key=True)
    mes_referencia: Mapped[str] = mapped_column(String(7), primary_key=True)
    municipio: Mapped[str] = mapped_column(String(100), index=True)
    ucs_total: Mapped[int] = mapped_column(Integer)
    interrupcoes: Mapped[int] = mapped_column(Integer)
    horas_interrupcao: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    dec: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    fec: Mapped[Decimal] = mapped_column(Numeric(10, 4))


class AggPrecoVolume(GoldBase):
    """gold.agg_preco_volume (gold_receita): preço × volume da receita de energia, P1 × P2, por recorte.

    efeito_volume = (kWh P2 − kWh P1) × tarifa P1; efeito_preco = variacao_receita − efeito_volume.
    Tarifa nula quando o kWh do período é 0.
    """

    __tablename__ = "agg_preco_volume"

    municipio: Mapped[str] = mapped_column(String(100), primary_key=True)
    bairro: Mapped[str] = mapped_column(String(100), primary_key=True)
    classe: Mapped[str] = mapped_column(String(20), primary_key=True)
    receita_energia_p1: Mapped[Decimal] = mapped_column(Dinheiro)
    receita_energia_p2: Mapped[Decimal] = mapped_column(Dinheiro)
    kwh_p1: Mapped[Decimal] = mapped_column(Energia)
    kwh_p2: Mapped[Decimal] = mapped_column(Energia)
    tarifa_p1: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    tarifa_p2: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    variacao_receita: Mapped[Decimal] = mapped_column(Dinheiro)
    efeito_volume: Mapped[Decimal] = mapped_column(Dinheiro)
    efeito_preco: Mapped[Decimal] = mapped_column(Dinheiro)