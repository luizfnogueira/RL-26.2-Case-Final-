from datetime import date
from typing import Annotated

from pydantic import AwareDatetime, StringConstraints

from app.schemas.common import FiltrosRegiao, Indicador, Mes, Paginacao, Schema


class FiltrosUnidades(FiltrosRegiao, Paginacao):
    busca: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None


class FiltroUnidade(Schema):
    periodo_atual: Mes | None = None


class Unidade(Schema):
    id_uc: str
    nome_titular: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    status: str


class Cadastro(Unidade):
    logradouro: str
    numero: str
    uf: str
    cep: str
    subgrupo_tarifario: str
    data_ligacao: date
    latitude: float | None
    longitude: float | None


class Fatura(Schema):
    id_fatura: str
    mes_referencia: Mes
    valor_energia: float
    tributos: float
    valor_total: float
    moeda: str
    bandeira_tarifaria: str
    data_emissao: date
    data_vencimento: date
    data_pagamento: date | None
    status: str


class Medidor(Schema):
    id_medidor: str
    modelo: str
    tipo: str
    data_instalacao: date
    data_retirada: date | None
    data_ultima_manutencao: date | None
    status: str


class GeracaoDistribuida(Schema):
    potencia_kwp: float
    data_conexao: date
    modalidade: str
    energia_injetada_kwh_media_mensal: float


class Interrupcao(Schema):
    id_ocorrencia: str
    alimentador: str
    tipo: str
    causa: str
    data_abertura: AwareDatetime
    data_encerramento: AwareDatetime | None
    duracao_min: float | None


class EventoChamado(Schema):
    sequencia: int
    data: AwareDatetime
    acao: str
    canal: str


class Chamado(Schema):
    protocolo: str
    canal: str
    assunto: str
    subassunto: str | None
    data_abertura: AwareDatetime
    data_fechamento: AwareDatetime | None
    nota_satisfacao: float | None
    historico: list[EventoChamado]


class Unidade360(Schema):
    periodo_referencia: Mes | None
    cadastro: Cadastro
    consumo: list[Indicador]
    faturas: list[Fatura]
    medidores: list[Medidor]
    geracao_distribuida: list[GeracaoDistribuida]
    interrupcoes: list[Interrupcao]
    chamados: list[Chamado]
