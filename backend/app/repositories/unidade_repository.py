"""V1a: consultas da Visão 360 sobre a Gold real (GOLD_SOURCE=real). Sem regra de negócio."""
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Protocol

from sqlalchemy import and_, case, false, func, null, or_, select
from sqlalchemy.orm import Session

from app.models.gold_real import DimMes, DimUC, FatoUCMes, UCAtendimentos, UCConsumoComparativo, UCInterrupcoes
from app.repositories.gold_metadata import metadados_gold

DURACAO_MINIMA_MIN = 3          # gold_dec_fec.DURACAO_MINIMA_DEC_MIN
STATUS_EM_ABERTO = 'EM ABERTO'
STATUS_PAGA = 'PAGA'


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


@dataclass(frozen=True)
class UnidadeResumo:
    id_uc: str
    nome_titular: str
    municipio: str
    bairro: str
    classe: str
    alimentador: str
    status: str


@dataclass(frozen=True)
class CadastroUC(UnidadeResumo):
    cpf_cnpj: str
    logradouro: str
    numero: str
    uf: str
    cep: str | None
    subgrupo_tarifario: str
    data_ligacao: date | None
    latitude: Decimal
    longitude: Decimal


@dataclass(frozen=True)
class MedidorUC:
    id_medidor: str
    modelo: str
    tipo: str
    data_instalacao: date


@dataclass(frozen=True)
class GeracaoDistribuidaUC:
    potencia_kwp: Decimal
    modalidade: str
    data_conexao: date
    energia_injetada_media_mensal: Decimal | None


@dataclass(frozen=True)
class FichaUC:
    """Uma linha da dim_uc: cadastro, medidor ativo e GD."""
    cadastro: CadastroUC
    medidor: MedidorUC | None
    gd: GeracaoDistribuidaUC | None


@dataclass(frozen=True)
class FaturaUC:
    id_fatura: str
    mes_referencia: str
    valor_energia: Decimal
    tributos: Decimal
    valor_total: Decimal
    bandeira_tarifaria: str
    data_emissao: date
    data_vencimento: date
    data_pagamento: date | None
    status: str


@dataclass(frozen=True)
class LeituraUC:
    data: date
    leitura_kwh: Decimal
    tipo_leitura: str


@dataclass(frozen=True)
class InterrupcaoUC:
    id_ocorrencia: str
    alimentador: str
    tipo: str
    causa: str
    data_abertura: datetime
    data_encerramento: datetime
    duracao_min: int                 # duracao_efetiva_min: a mesma do DEC, sem o trecho sobreposto


@dataclass(frozen=True)
class ChamadoUC:
    protocolo: str
    canal: str
    assunto: str
    subassunto: str
    data_abertura: datetime
    data_fechamento: datetime
    nota_satisfacao: Decimal | None
    tempo_atendimento_h: Decimal


class UnidadeRepositoryInterface(Protocol):
    def buscar(self, *, busca: Optional[str] = None, municipio: Optional[str] = None,
               bairro: Optional[str] = None, classe: Optional[str] = None,
               alimentador: Optional[str] = None, page: int = 1,
               page_size: int = 20) -> tuple[list[UnidadeResumo], int]: ...
    def ultimo_mes(self) -> str | None: ...
    def ficha(self, id_uc: str) -> FichaUC | None: ...
    def consumo(self, id_uc: str, inicio: str, fim: str) -> list[MesConsumo]: ...
    def faturas_abertas(self, id_uc: str) -> list[FaturaUC]: ...
    def faturas_pagas(self, id_uc: str, inicio: str, fim: str) -> list[FaturaUC]: ...
    def ultima_leitura(self, id_uc: str) -> LeituraUC | None: ...
    def interrupcoes(self, id_uc: str, inicio: str, fim: str, limite: int) -> tuple[list[InterrupcaoUC], int]: ...
    def chamados(self, id_uc: str) -> list[ChamadoUC]: ...
    def metadados(self) -> dict: ...


def _escapar_like(texto: str) -> str:
    """`%` e `_` digitados são texto, não curinga."""
    return texto.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _relevancia_do_nome(termo: str):
    """Grupo de relevância da busca pelo titular (termo já escapado para o LIKE).

    1: o nome começa com o termo; 2: outra palavra começa com ele; 3: o termo está no meio de uma
    palavra; 4: só o código da UC casa. Os nomes da Gold só separam palavras por espaço.
    """
    nome = DimUC.nome_titular
    return case(
        (nome.ilike(f'{termo}%', escape='\\'), 1),
        (nome.ilike(f'% {termo}%', escape='\\'), 2),
        (nome.ilike(f'%{termo}%', escape='\\'), 3),
        else_=4,
    )


def _condicoes_regiao(**filtros: Optional[str]) -> list:
    """Filtros geográficos por AND, com o valor exato da Gold (RECIFE, BOA VISTA), como o /dashboard.

    Os valores vêm do GET /filtros; só a busca livre por ID e titular ignora maiúsculas.
    """
    return [getattr(DimUC, campo) == valor for campo, valor in filtros.items() if valor is not None]


def _mes_da_ocorrencia(coluna):
    """YYYY-MM da hora como a origem registrou (hora local de Recife).

    A origem exporta hora local e o pipeline não converte fuso: o CSV marca esse horário como
    UTC. Lemos o relógio em UTC, sem converter; independe do TimeZone da sessão do PostgreSQL.
    """
    return func.to_char(func.timezone('UTC', coluna), 'YYYY-MM')


def _fatura(linha) -> FaturaUC:
    return FaturaUC(linha.id_fatura, linha.mes_referencia, linha.valor_energia, linha.tributos,
                    linha.valor_total, linha.bandeira_tarifaria, linha.data_emissao,
                    linha.data_vencimento, linha.data_pagamento, linha.status)


class SqlAlchemyUnidadeRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def buscar(self, *, busca: Optional[str] = None, municipio: Optional[str] = None,
               bairro: Optional[str] = None, classe: Optional[str] = None,
               alimentador: Optional[str] = None, page: int = 1,
               page_size: int = 20) -> tuple[list[UnidadeResumo], int]:
        condicoes = _condicoes_regiao(municipio=municipio, bairro=bairro, classe=classe,
                                      alimentador=alimentador)
        ordem = [DimUC.id_uc]
        if busca:
            termo = _escapar_like(busca.strip())
            condicoes.append(or_(DimUC.id_uc.ilike(f'%{termo}%', escape='\\'),
                                 DimUC.nome_titular.ilike(f'%{termo}%', escape='\\')))
            # Por relevância do nome e, no grupo, alfabética palavra por palavra (COLLATE "C": a
            # en_US ignora espaços e poria ANDREIA antes de ANDRE TORRES). Quem casa só pelo código
            # fica por último, pelo ID, como antes; o ID também desempata a paginação.
            relevancia = _relevancia_do_nome(termo)
            ordem = [relevancia, case((relevancia == 4, null()), else_=DimUC.nome_titular.collate('C')),
                     DimUC.id_uc]
        linhas = self.db.execute(
            select(DimUC.id_uc, DimUC.nome_titular, DimUC.municipio, DimUC.bairro, DimUC.classe,
                   DimUC.alimentador, DimUC.status)
            .where(*condicoes)
            .order_by(*ordem)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        total = self.db.scalar(select(func.count()).select_from(DimUC).where(*condicoes)) or 0
        return [UnidadeResumo(*linha) for linha in linhas], int(total)

    def ultimo_mes(self) -> str | None:
        return self.db.scalar(select(func.max(DimMes.mes_referencia)))

    def ficha(self, id_uc: str) -> FichaUC | None:
        uc = self.db.get(DimUC, id_uc)
        if uc is None:
            return None
        cadastro = CadastroUC(
            uc.id_uc, uc.nome_titular, uc.municipio, uc.bairro, uc.classe, uc.alimentador, uc.status,
            uc.cpf_cnpj, uc.logradouro, uc.numero, uc.uf, uc.cep, uc.subgrupo_tarifario,
            uc.data_ligacao, uc.latitude, uc.longitude)
        medidor = (MedidorUC(uc.id_medidor, uc.modelo_medidor, uc.tipo_medidor, uc.data_instalacao_medidor)
                   if uc.id_medidor else None)
        gd = (GeracaoDistribuidaUC(uc.gd_potencia_kwp, uc.gd_modalidade, uc.gd_data_conexao,
                                   uc.gd_energia_injetada_kwh_media_mensal)
              if uc.flag_tem_gd else None)
        return FichaUC(cadastro, medidor, gd)

    def consumo(self, id_uc: str, inicio: str, fim: str) -> list[MesConsumo]:
        c, f = UCConsumoComparativo, FatoUCMes
        linhas = self.db.execute(
            select(c.mes_referencia, c.consumo_kwh, c.consumo_kwh_ano_anterior, c.variacao_pct,
                   c.flag_conta_alta, c.tipo_leitura,
                   func.coalesce(f.flag_primeira_leitura_pos_troca, false()))
            .outerjoin(f, and_(f.id_uc == c.id_uc, f.mes_referencia == c.mes_referencia))
            .where(c.id_uc == id_uc, c.mes_referencia.between(inicio, fim))
            .order_by(c.mes_referencia)
        ).all()
        return [MesConsumo(*linha) for linha in linhas]

    def faturas_abertas(self, id_uc: str) -> list[FaturaUC]:
        return [_fatura(f) for f in self.db.scalars(
            select(FatoUCMes)
            .where(FatoUCMes.id_uc == id_uc, FatoUCMes.status == STATUS_EM_ABERTO)
            .order_by(FatoUCMes.mes_referencia.desc()))]

    def faturas_pagas(self, id_uc: str, inicio: str, fim: str) -> list[FaturaUC]:
        return [_fatura(f) for f in self.db.scalars(
            select(FatoUCMes)
            .where(FatoUCMes.id_uc == id_uc, FatoUCMes.status == STATUS_PAGA,
                   FatoUCMes.mes_referencia.between(inicio, fim))
            .order_by(FatoUCMes.mes_referencia.desc()))]

    def ultima_leitura(self, id_uc: str) -> LeituraUC | None:
        linha = self.db.execute(
            select(FatoUCMes.data_leitura, FatoUCMes.leitura_atual, FatoUCMes.tipo_leitura)
            .where(FatoUCMes.id_uc == id_uc, FatoUCMes.id_leitura.is_not(None))
            .order_by(FatoUCMes.mes_referencia.desc())
            .limit(1)
        ).first()
        return LeituraUC(*linha) if linha else None

    def interrupcoes(self, id_uc: str, inicio: str, fim: str, limite: int) -> tuple[list[InterrupcaoUC], int]:
        i = UCInterrupcoes
        # Mesmas regras do DEC/FEC (gold_dec_fec), para a Visão 360 bater com a Operação:
        # oscilação não é falta de energia; antes da ligação a UC não existia; abaixo de 3 min não é
        # interrupção longa (PRODIST); duração efetiva 0 é o mesmo apagão registrado duas vezes.
        condicoes = [i.id_uc == id_uc, _mes_da_ocorrencia(i.data_abertura).between(inicio, fim),
                     ~func.coalesce(i.flag_sem_interrupcao, false()),
                     ~func.coalesce(i.flag_antes_ligacao, false()),
                     i.duracao_min >= DURACAO_MINIMA_MIN,
                     i.duracao_efetiva_min > 0]
        linhas = self.db.execute(
            select(i.id_ocorrencia, i.alimentador, i.tipo, i.causa, i.data_abertura,
                   i.data_encerramento, i.duracao_efetiva_min)
            .where(*condicoes)
            .order_by(i.data_abertura.desc(), i.id_ocorrencia)
            .limit(limite)
        ).all()
        total = self.db.scalar(select(func.count()).select_from(i).where(*condicoes)) or 0
        return [InterrupcaoUC(*linha) for linha in linhas], int(total)

    def chamados(self, id_uc: str) -> list[ChamadoUC]:
        a = UCAtendimentos
        linhas = self.db.execute(
            select(a.protocolo, a.canal, a.assunto, a.subassunto, a.data_abertura, a.data_fechamento,
                   a.nota_satisfacao, a.tempo_atendimento_h)
            .where(a.id_uc == id_uc)
            .order_by(a.data_abertura.desc(), a.protocolo)
        ).all()
        return [ChamadoUC(*linha) for linha in linhas]

    def metadados(self) -> dict:
        return metadados_gold(self.db, 'dim_uc', '')
