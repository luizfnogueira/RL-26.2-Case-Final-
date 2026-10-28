from datetime import date
from typing import Annotated, Literal

from pydantic import AwareDatetime, Field, StringConstraints, model_validator

from app.schemas.common import (
    FiltrosRegiao, Indicador, Mes, Metadados, Pagina, Paginacao, Periodo, Schema, duracao,
)

# Domínio de tipo_leitura na Silver/Gold (silver_medicao)
TipoLeitura = Literal['REAL', 'ESTIMADA', 'MEDIA', 'AUTENTICADA', 'NAO REALIZADA']
MESES_JANELA = 12


class FiltrosUnidades(FiltrosRegiao, Paginacao):
    busca: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=100)] | None = None


class FiltroUnidade(Schema):
    # Sem período, a API usa os 12 meses que terminam no último mês da Gold.
    periodo_atual: Periodo | None = None

    @model_validator(mode='after')
    def validar_janela(self):
        if self.periodo_atual is not None and duracao(self.periodo_atual) != MESES_JANELA:
            raise ValueError(f'periodo_atual deve ter {MESES_JANELA} meses')
        return self


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
    latitude: float
    longitude: float


class ConsumoMes(Schema):
    mes: Mes
    atual: Indicador
    ano_anterior: Indicador
    tipo_leitura: TipoLeitura


class DiagnosticoConta(Schema):
    periodo_referencia: Mes | None            # mês analisado: o último da janela com dado da UC
    conta_alta: bool | None
    veredito: str | None
    ultimo_mes: Indicador
    mesmo_mes_ano_anterior: Indicador
    media_12_meses: Indicador                 # 12 meses anteriores ao mês analisado, sem incluí-lo
    meses_media: int = Field(ge=0, le=12)
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
    data_encerramento: AwareDatetime
    duracao_min: float


class Chamado(Schema):
    protocolo: str
    canal: str
    assunto: str
    subassunto: str
    data_abertura: AwareDatetime
    data_fechamento: AwareDatetime
    nota_satisfacao: float | None             # não preenchida: null, nunca 0
    tempo_atendimento_h: float


class Unidade360(Schema):
    periodo_referencia: Periodo
    cadastro: Cadastro
    consumo: list[ConsumoMes]
    diagnostico_conta: DiagnosticoConta
    faturas_abertas: list[Fatura]
    faturas_pagas: list[Fatura]
    medidor: Medidor | None
    geracao_distribuida: GeracaoDistribuida | None   # bloco inteiro null para UC sem GD
    interrupcoes_recentes: list[Interrupcao]   # até 10, as mais recentes da janela
    total_interrupcoes: Indicador              # todas as da janela, sem oscilação e sem anteriores à ligação
    chamados: list[Chamado]
    metadados: Metadados
