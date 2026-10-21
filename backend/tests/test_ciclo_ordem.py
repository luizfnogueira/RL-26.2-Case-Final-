from datetime import date, datetime
import pytest

from app.core.exceptions import (
    AppException,
    JustificativaObrigatoriaException,
    OrdemAtivaExistenteException,
    OrdemNaoEncontradaException,
    ResultadoIncompletoException,
    TransicaoInvalidaException,
    UCInexistenteException,
)
from app.repositories.inspecao_repository import MemoriaOrdemInspecaoRepository
from app.schemas.inspecao import (
    OrdemInspecaoAvancarCampo,
    OrdemInspecaoCancelar,
    OrdemInspecaoCreate,
    ResultadoInspecao,
    StatusOrdem,
)
from app.services.inspecao_service import OrdemInspecaoService


@pytest.fixture
def repo_com_ucs() -> MemoriaOrdemInspecaoRepository:
    return MemoriaOrdemInspecaoRepository(
        ucs_iniciais={"UC100001", "UC100002", "UC100003"}
    )


@pytest.fixture
def service(repo_com_ucs: MemoriaOrdemInspecaoRepository) -> OrdemInspecaoService:
    return OrdemInspecaoService(repository=repo_com_ucs)


class TestCriacaoOrdem:
    def test_criar_ordem_sucesso(self, service: OrdemInspecaoService):
        dados = OrdemInspecaoCreate(
            id_uc="UC100001",
            equipe_responsavel="Equipe Alpha",
            data_prevista=date(2026, 10, 25),
            motivo="Queda brusca de consumo sem GD",
            kwh_estimado=450.0,
            observacoes="Suspeita de adulteração no medidor",
        )

        ordem = service.criar_ordem(dados, usuario="operador_gabriel")

        assert ordem.id_ordem > 0
        assert ordem.id_uc == "UC100001"
        assert ordem.status == StatusOrdem.ABERTA
        assert ordem.equipe_responsavel == "Equipe Alpha"
        assert ordem.data_prevista == date(2026, 10, 25)
        assert ordem.motivo == "Queda brusca de consumo sem GD"
        assert ordem.kwh_estimado == 450.0
        assert ordem.resultado is None
        assert len(ordem.historico) == 1
        assert ordem.historico[0].status_anterior is None
        assert ordem.historico[0].status_novo == StatusOrdem.ABERTA

    def test_criar_ordem_uc_inexistente_lanca_404(self, service: OrdemInspecaoService):
        dados = OrdemInspecaoCreate(
            id_uc="UC999999",
            equipe_responsavel="Equipe Beta",
        )

        with pytest.raises(UCInexistenteException) as exc_info:
            service.criar_ordem(dados)

        assert exc_info.value.status_code == 404
        assert exc_info.value.codigo == "UC_INEXISTENTE"
        assert "UC999999" in exc_info.value.mensagem

    def test_criar_ordem_com_dict_invalido_lanca_dados_invalidos(self, service: OrdemInspecaoService):
        with pytest.raises(AppException) as exc_info:
            service.criar_ordem({"id_uc": "UC100001"})

        assert exc_info.value.status_code == 422
        assert exc_info.value.codigo == "DADOS_INVALIDOS"

    def test_criar_ordem_duplicada_quando_aberta_lanca_409(self, service: OrdemInspecaoService):
        dados1 = OrdemInspecaoCreate(
            id_uc="UC100001",
            equipe_responsavel="Equipe Alpha",
        )
        service.criar_ordem(dados1)

        dados2 = OrdemInspecaoCreate(
            id_uc="UC100001",
            equipe_responsavel="Equipe Beta",
        )
        with pytest.raises(OrdemAtivaExistenteException) as exc_info:
            service.criar_ordem(dados2)

        assert exc_info.value.status_code == 409
        assert exc_info.value.codigo == "ORDEM_ATIVA_EXISTENTE"
        assert "UC100001" in exc_info.value.mensagem

    def test_criar_ordem_duplicada_quando_em_campo_lanca_409(self, service: OrdemInspecaoService):
        dados1 = OrdemInspecaoCreate(
            id_uc="UC100001",
            equipe_responsavel="Equipe Alpha",
        )
        ordem1 = service.criar_ordem(dados1)
        service.avancar_para_campo(ordem1.id_ordem)

        dados2 = OrdemInspecaoCreate(
            id_uc="UC100001",
            equipe_responsavel="Equipe Beta",
        )
        with pytest.raises(OrdemAtivaExistenteException) as exc_info:
            service.criar_ordem(dados2)

        assert exc_info.value.status_code == 409
        assert exc_info.value.codigo == "ORDEM_ATIVA_EXISTENTE"

    def test_criar_nova_ordem_apos_conclusao_sucesso(self, service: OrdemInspecaoService):
        ordem1 = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem1.id_ordem)
        resultado = ResultadoInspecao(
            irregularidade_detectada=True,
            tipo_irregularidade="DESVIO NO RAMAL",
            kwh_recuperado=1200.0,
            observacoes="Desvio sanado no local.",
        )
        service.concluir_ordem(ordem1.id_ordem, resultado)

        ordem2 = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Gama")
        )
        assert ordem2.id_ordem != ordem1.id_ordem
        assert ordem2.status == StatusOrdem.ABERTA

    def test_criar_nova_ordem_apos_cancelamento_sucesso(self, service: OrdemInspecaoService):
        ordem1 = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100002", equipe_responsavel="Equipe Alpha")
        )
        service.cancelar_ordem(ordem1.id_ordem, justificativa="Cliente ausente")

        ordem2 = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100002", equipe_responsavel="Equipe Beta")
        )
        assert ordem2.id_ordem != ordem1.id_ordem
        assert ordem2.status == StatusOrdem.ABERTA


class TestAvancoParaCampo:
    def test_avancar_de_aberta_para_em_campo_sucesso(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )

        dados_campo = OrdemInspecaoAvancarCampo(
            equipe_responsavel="Equipe Campo 1",
            observacoes="Equipe a caminho",
        )
        ordem_atualizada = service.avancar_para_campo(ordem.id_ordem, dados_campo)

        assert ordem_atualizada.status == StatusOrdem.EM_CAMPO
        assert ordem_atualizada.equipe_responsavel == "Equipe Campo 1"
        assert ordem_atualizada.data_inicio_campo is not None
        assert len(ordem_atualizada.historico) == 2
        assert ordem_atualizada.historico[-1].status_anterior == StatusOrdem.ABERTA
        assert ordem_atualizada.historico[-1].status_novo == StatusOrdem.EM_CAMPO

    def test_avancar_ordem_ja_em_campo_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)

        with pytest.raises(TransicaoInvalidaException) as exc_info:
            service.avancar_para_campo(ordem.id_ordem)

        assert exc_info.value.status_code == 400
        assert exc_info.value.codigo == "TRANSICAO_INVALIDA"

    def test_avancar_ordem_concluida_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)
        service.concluir_ordem(
            ordem.id_ordem,
            ResultadoInspecao(
                irregularidade=False,
                observacoes="Vistoria concluída sem alteração.",
            ),
        )

        with pytest.raises(TransicaoInvalidaException):
            service.avancar_para_campo(ordem.id_ordem)

    def test_avancar_ordem_cancelada_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.cancelar_ordem(ordem.id_ordem, justificativa="Cancelamento de rotina")

        with pytest.raises(TransicaoInvalidaException):
            service.avancar_para_campo(ordem.id_ordem)

    def test_avancar_ordem_inexistente_lanca_404(self, service: OrdemInspecaoService):
        with pytest.raises(OrdemNaoEncontradaException) as exc_info:
            service.avancar_para_campo(9999)

        assert exc_info.value.status_code == 404
        assert exc_info.value.codigo == "ORDEM_NAO_ENCONTRADA"


class TestConclusaoOrdem:
    def test_concluir_com_irregularidade_confirmada_sucesso(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)

        resultado = ResultadoInspecao(
            irregularidade_detectada=True,
            tipo_irregularidade="MEDIDOR ADULTERADO",
            kwh_recuperado=850.75,
            observacoes="Lacre rompido e engrenagem travada. Medidor substituído.",
            inspetor="Carlos Técnico",
        )

        ordem_concluida = service.concluir_ordem(ordem.id_ordem, resultado)

        assert ordem_concluida.status == StatusOrdem.CONCLUIDA
        assert ordem_concluida.data_conclusao is not None
        assert ordem_concluida.resultado is not None
        assert ordem_concluida.resultado.irregularidade_detectada is True
        assert ordem_concluida.resultado.tipo_irregularidade == "MEDIDOR ADULTERADO"
        assert ordem_concluida.resultado.kwh_recuperado == 850.75
        assert ordem_concluida.resultado.observacoes == "Lacre rompido e engrenagem travada. Medidor substituído."
        assert ordem_concluida.resultado.inspetor == "Carlos Técnico"

        assert len(ordem_concluida.historico) == 3
        ultimo_evento = ordem_concluida.historico[-1]
        assert ultimo_evento.status_anterior == StatusOrdem.EM_CAMPO
        assert ultimo_evento.status_novo == StatusOrdem.CONCLUIDA

    def test_concluir_sem_irregularidade_sucesso(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)

        resultado = ResultadoInspecao(
            irregularidade_detectada=False,
            kwh_recuperado=0.0,
            observacoes="Instalação em conformidade técnica. Nenhuma anomalia.",
        )

        ordem_concluida = service.concluir_ordem(ordem.id_ordem, resultado)

        assert ordem_concluida.status == StatusOrdem.CONCLUIDA
        assert ordem_concluida.resultado.irregularidade_detectada is False
        assert ordem_concluida.resultado.tipo_irregularidade is None
        assert ordem_concluida.resultado.kwh_recuperado == 0.0

    def test_concluir_direto_de_aberta_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )

        resultado = ResultadoInspecao(
            irregularidade=False,
            observacoes="Tentando pular status",
        )

        with pytest.raises(TransicaoInvalidaException) as exc_info:
            service.concluir_ordem(ordem.id_ordem, resultado)

        assert exc_info.value.status_code == 400
        assert "EM_CAMPO" in exc_info.value.mensagem

    def test_concluir_ordem_cancelada_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.cancelar_ordem(ordem.id_ordem, justificativa="Cancelada")

        with pytest.raises(TransicaoInvalidaException):
            service.concluir_ordem(
                ordem.id_ordem,
                {"irregularidade": False, "observacoes": "teste"},
            )

    def test_concluir_ordem_ja_concluida_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)
        service.concluir_ordem(
            ordem.id_ordem,
            ResultadoInspecao(irregularidade=False, observacoes="Ok"),
        )

        with pytest.raises(TransicaoInvalidaException):
            service.concluir_ordem(
                ordem.id_ordem,
                ResultadoInspecao(irregularidade=False, observacoes="Ok de novo"),
            )


class TestValidacaoResultadoCampo:
    def test_irregularidade_sem_tipo_lanca_erro(self):
        with pytest.raises(ValueError, match="tipo de irregularidade é obrigatório"):
            ResultadoInspecao(
                irregularidade_detectada=True,
                tipo_irregularidade=None,
                kwh_recuperado=100.0,
                observacoes="Constatado desvio",
            )

    def test_irregularidade_com_tipo_em_branco_lanca_erro(self):
        with pytest.raises(ValueError, match="tipo de irregularidade é obrigatório"):
            ResultadoInspecao(
                irregularidade_detectada=True,
                tipo_irregularidade="   ",
                kwh_recuperado=100.0,
                observacoes="Constatado desvio",
            )

    def test_resultado_sem_observacoes_lanca_erro(self):
        with pytest.raises(ValueError, match="observações"):
            ResultadoInspecao(
                irregularidade_detectada=False,
                observacoes="   ",
            )

    def test_sem_irregularidade_com_kwh_positivo_lanca_erro(self):
        with pytest.raises(ValueError, match="deve ser 0"):
            ResultadoInspecao(
                irregularidade_detectada=False,
                kwh_recuperado=50.0,
                observacoes="Sem irregularidade mas lançou kWh",
            )

    def test_sem_irregularidade_com_tipo_preenchido_lanca_erro(self):
        with pytest.raises(ValueError, match="Tipo de irregularidade não deve ser preenchido"):
            ResultadoInspecao(
                irregularidade_detectada=False,
                tipo_irregularidade="DESVIO NO RAMAL",
                observacoes="Sem irregularidade mas informou tipo",
            )

    def test_concluir_via_service_com_dict_invalido_lanca_dados_invalidos(
        self, service: OrdemInspecaoService
    ):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)

        with pytest.raises(AppException) as exc_info:
            service.concluir_ordem(
                ordem.id_ordem,
                {
                    "irregularidade": True,
                    "kwh_recuperado": 100,
                    "observacoes": "Desvio",
                },
            )
        assert exc_info.value.status_code == 422
        assert exc_info.value.codigo == "DADOS_INVALIDOS"


class TestCancelamentoOrdem:
    def test_cancelar_em_aberta_com_justificativa_sucesso(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )

        ordem_cancelada = service.cancelar_ordem(
            ordem.id_ordem,
            justificativa="Endereço não localizado pelo despachador",
            usuario="supervisor_pedro",
        )

        assert ordem_cancelada.status == StatusOrdem.CANCELADA
        assert ordem_cancelada.justificativa_cancelamento == "Endereço não localizado pelo despachador"
        assert ordem_cancelada.data_cancelamento is not None
        assert len(ordem_cancelada.historico) == 2
        assert ordem_cancelada.historico[-1].status_anterior == StatusOrdem.ABERTA
        assert ordem_cancelada.historico[-1].status_novo == StatusOrdem.CANCELADA

    def test_cancelar_em_campo_com_justificativa_sucesso(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)

        ordem_cancelada = service.cancelar_ordem(
            ordem.id_ordem,
            justificativa="Área de risco sem condições de segurança para a equipe",
            usuario="equipe_campo",
        )

        assert ordem_cancelada.status == StatusOrdem.CANCELADA
        assert ordem_cancelada.justificativa_cancelamento == "Área de risco sem condições de segurança para a equipe"
        assert ordem_cancelada.data_cancelamento is not None
        assert len(ordem_cancelada.historico) == 3
        assert ordem_cancelada.historico[-1].status_anterior == StatusOrdem.EM_CAMPO
        assert ordem_cancelada.historico[-1].status_novo == StatusOrdem.CANCELADA

    def test_cancelar_sem_justificativa_lanca_erro(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )

        with pytest.raises(JustificativaObrigatoriaException) as exc_info:
            service.cancelar_ordem(ordem.id_ordem, justificativa="   ")

        assert exc_info.value.status_code == 400
        assert exc_info.value.codigo == "JUSTIFICATIVA_OBRIGATORIA"

    def test_cancelar_ordem_concluida_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.avancar_para_campo(ordem.id_ordem)
        service.concluir_ordem(
            ordem.id_ordem,
            ResultadoInspecao(irregularidade=False, observacoes="Ok"),
        )

        with pytest.raises(TransicaoInvalidaException) as exc_info:
            service.cancelar_ordem(ordem.id_ordem, justificativa="Tentando cancelar concluída")

        assert exc_info.value.status_code == 400
        assert "CONCLUIDA" in exc_info.value.mensagem

    def test_cancelar_ordem_ja_cancelada_lanca_transicao_invalida(self, service: OrdemInspecaoService):
        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Equipe Alpha")
        )
        service.cancelar_ordem(ordem.id_ordem, justificativa="Motivo 1")

        with pytest.raises(TransicaoInvalidaException):
            service.cancelar_ordem(ordem.id_ordem, justificativa="Motivo 2")

    def test_cancelar_ordem_inexistente_lanca_404(self, service: OrdemInspecaoService):
        with pytest.raises(OrdemNaoEncontradaException) as exc_info:
            service.cancelar_ordem(8888, justificativa="Inexistente")

        assert exc_info.value.status_code == 404


class TestConsultasEFiltros:
    def test_listar_com_filtros(self, service: OrdemInspecaoService):
        o1 = service.criar_ordem(OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Eq1"))
        o2 = service.criar_ordem(OrdemInspecaoCreate(id_uc="UC100002", equipe_responsavel="Eq2"))
        service.avancar_para_campo(o2.id_ordem)

        abertas = service.listar_ordens(status=StatusOrdem.ABERTA)
        assert len(abertas) == 1
        assert abertas[0].id_ordem == o1.id_ordem

        em_campo = service.listar_ordens(status=StatusOrdem.EM_CAMPO)
        assert len(em_campo) == 1
        assert em_campo[0].id_ordem == o2.id_ordem

        por_uc = service.listar_ordens(id_uc="UC100002")
        assert len(por_uc) == 1
        assert por_uc[0].id_ordem == o2.id_ordem

    def test_verificar_ordem_ativa(self, service: OrdemInspecaoService):
        assert service.tem_ordem_ativa("UC100001") is False

        ordem = service.criar_ordem(
            OrdemInspecaoCreate(id_uc="UC100001", equipe_responsavel="Eq1")
        )
        assert service.tem_ordem_ativa("UC100001") is True
        assert service.obter_ordem_ativa("UC100001").id_ordem == ordem.id_ordem

        service.avancar_para_campo(ordem.id_ordem)
        assert service.tem_ordem_ativa("UC100001") is True

        service.cancelar_ordem(ordem.id_ordem, justificativa="Cancelada")
        assert service.tem_ordem_ativa("UC100001") is False


class TestNormalizacaoStatus:
    @pytest.mark.parametrize(
        "entrada,esperado",
        [
            ("ABERTA", StatusOrdem.ABERTA),
            ("aberta", StatusOrdem.ABERTA),
            ("EM CAMPO", StatusOrdem.EM_CAMPO),
            ("EM_CAMPO", StatusOrdem.EM_CAMPO),
            ("em campo", StatusOrdem.EM_CAMPO),
            ("CONCLUÍDA", StatusOrdem.CONCLUIDA),
            ("CONCLUIDA", StatusOrdem.CONCLUIDA),
            ("concluída", StatusOrdem.CONCLUIDA),
            ("CANCELADA", StatusOrdem.CANCELADA),
            ("cancelada", StatusOrdem.CANCELADA),
        ],
    )
    def test_normalizacao_status_ordem(self, entrada: str, esperado: StatusOrdem):
        assert StatusOrdem(entrada) == esperado
