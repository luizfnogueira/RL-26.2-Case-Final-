from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, StringConstraints

from app.schemas.common import FiltrosRegiao, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema

# Domínio de tipo_leitura na Silver/Gold (silver_medicao)
TipoLeitura = Literal['REAL', 'ESTIMADA', 'MEDIA', 'AUTENTICADA', 'NAO REALIZADA']


class FiltrosUnidades(FiltrosRegiao, Paginacao):
    busca: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None


class FiltroUnidade(Schema):
    periodo_atual: Periodo | None = None


class Unidade(Schema):
    id_uc: str
    nome_titular: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    status: str


class Unidades(Pagina[Unidade]):
    metadados: Metadados


class Cadastro(Unidade):
    cpf_cnpj_mascarado: str
    telefone: str | None
    logradouro: str
    numero: str
    uf: str
    cep: str | None
    subgrupo_tarifario: str
    data_ligacao: date | None
    latitude: float | None
    longitude: float | None


class ConsumoMes(Schema):
    mes: Mes
    atual: Indicador
    ano_anterior: Indicador
    tipo_leitura: TipoLeitura


class DiagnosticoConta(Schema):
    conta_alta: bool | None
    veredito: str
    ultimo_mes: Indicador
    mesmo_mes_ano_anterior: Indicador
    media_12_meses: Indicador
    variacao_percentual: Indicador
    leitura_estimada: bool
    alerta: str | None


class Fatura(Schema):
    id_fatura: str
    mes_referencia: Mes
    valor_energia: float
    tributos: float
    valor_total: float
    bandeira_tarifaria: str
    data_emissao: date
    data_vencimento: date
    data_pagamento: date | None
    status: str


class Leitura(Schema):
    data: date
    leitura_kwh: float
    tipo_leitura: TipoLeitura


class Medidor(Schema):
    id_medidor: str
    modelo: str
    tipo: str
    data_instalacao: date
    ultima_leitura: Leitura | None


class GeracaoDistribuida(Schema):
    potencia_kwp: float
    data_conexao: date
    modalidade: str
    energia_injetada_media_mensal: Indicador


class Interrupcao(Schema):
    id_ocorrencia: str
    alimentador: str
    tipo: str
    causa: str
    data_abertura: AwareDatetime
    data_encerramento: AwareDatetime | None
    duracao_min: float | None


class Chamado(Schema):
    protocolo: str
    canal: str
    assunto: str
    subassunto: str | None
    data_abertura: AwareDatetime
    data_fechamento: AwareDatetime | None
    nota_satisfacao: float | None
    tempo_atendimento_h: float | None


class Unidade360(Schema):
    periodo_referencia: Periodo
    cadastro: Cadastro
    consumo: list[ConsumoMes]
    diagnostico_conta: DiagnosticoConta
    faturas_abertas: list[Fatura]
    faturas_pagas: list[Fatura]
    medidor: Medidor | None
    geracao_distribuida: GeracaoDistribuida | None
    interrupcoes_recentes: list[Interrupcao]
    chamados: list[Chamado]
    metadados: Metadados
