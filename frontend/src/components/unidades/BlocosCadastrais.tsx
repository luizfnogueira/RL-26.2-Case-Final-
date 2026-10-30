import { Gauge, SunMedium } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import EmptyState from '@/components/ui/EmptyState'
import type { Periodo } from '@/types/comum'
import type { Cadastro, GeracaoDistribuida, Medidor } from '@/types/unidades'
import { formatarData } from '@/utils/datas'
import { formatarCep, formatarIndicador, formatarNome } from '@/utils/formatacao'
import { limitesDoPeriodo } from '@/utils/periodos'
import ListaDados from './ListaDados'
import { rotuloModalidadeGd } from './rotulos'

const NAO_INFORMADO = 'Não informado'
const leitura = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const potencia = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

/** Bloco 1: quem é o cliente e onde está a UC. */
export function BlocoCadastro({ cadastro: c }: { cadastro: Cadastro }) {
  return (
    <Card titulo="Cadastro" aria-label="Cadastro">
      <ListaDados
        itens={[
          { rotulo: 'Titular', valor: formatarNome(c.nome_titular) },
          { rotulo: 'CPF/CNPJ', valor: c.cpf_cnpj_mascarado },
          // Telefone fica de fora: não há fonte na Gold e viria null em todas as UCs.
          {
            rotulo: 'Endereço',
            valor: `${formatarNome(c.logradouro)}, ${c.numero} · ${formatarNome(c.bairro)}, ${formatarNome(c.municipio)} – ${c.uf}`,
          },
          { rotulo: 'CEP', valor: c.cep ? formatarCep(c.cep) : NAO_INFORMADO },
          {
            rotulo: 'Classe e subgrupo',
            valor: `${formatarNome(c.classe)} · ${c.subgrupo_tarifario}`,
          },
          { rotulo: 'Alimentador', valor: c.alimentador },
          {
            rotulo: 'Ligada em',
            valor: c.data_ligacao ? formatarData(c.data_ligacao) : 'Não informada',
          },
        ]}
      />
    </Card>
  )
}

/**
 * Medidor trocado no período: instalado dentro da janela analisada e depois da ligação da UC. O
 * instalado no dia da ligação é o primeiro medidor, não uma troca; sem a data de ligação, não dá
 * para afirmar. Datas "AAAA-MM-DD" comparadas como texto, sem passar por fuso.
 */
function trocadoNoPeriodo(instalacao: string, ligacao: string | null, periodo: Periodo): boolean {
  const limites = limitesDoPeriodo(periodo)
  if (!limites || ligacao === null || instalacao <= ligacao) return false
  const mes = instalacao.slice(0, 7)
  return limites.inicio <= mes && mes <= limites.fim
}

/** Bloco 6: medidor ativo e a leitura acumulada do registrador. */
export function BlocoMedidor({
  medidor,
  periodo,
  dataLigacao,
}: {
  medidor: Medidor | null
  periodo: Periodo
  dataLigacao: string | null
}) {
  if (!medidor) {
    return (
      <Card titulo="Medidor" aria-label="Medidor">
        <EmptyState
          icone={<Gauge size={26} strokeWidth={1.5} />}
          titulo="Sem medidor ativo"
          descricao="Não há medidor ativo cadastrado para esta unidade."
        />
      </Card>
    )
  }
  const ultima = medidor.ultima_leitura
  return (
    <Card titulo="Medidor" aria-label="Medidor">
      <ListaDados
        className="sm:grid-cols-1"
        itens={[
          { rotulo: 'Número', valor: medidor.id_medidor },
          { rotulo: 'Tipo e modelo', valor: `${formatarNome(medidor.tipo)} · ${medidor.modelo}` },
          { rotulo: 'Instalado em', valor: formatarData(medidor.data_instalacao) },
          {
            // Valor do registrador, não o consumo do mês: o nome evita a confusão.
            rotulo: 'Leitura acumulada',
            valor: ultima ? (
              <span className="flex flex-wrap items-center gap-2">
                {/* Valor exato do registrador, para conferir com o visor do medidor; sem quebra. */}
                <span className="whitespace-nowrap">
                  {`${leitura.format(ultima.leitura_kwh)} kWh em ${formatarData(ultima.data)}`}
                </span>
                {/* Só a leitura estimada pede atenção; a real não leva selo. */}
                {ultima.tipo_leitura === 'ESTIMADA' && <Badge variante="alerta">Estimada</Badge>}
              </span>
            ) : (
              'Sem leitura registrada'
            ),
          },
        ]}
      />
      {trocadoNoPeriodo(medidor.data_instalacao, dataLigacao, periodo) && (
        // Mesmo estilo da nota da GD: explica de onde vêm as leituras de antes da troca.
        <p className="mt-3 text-legenda text-ink-2">
          Medidor instalado durante o período analisado. As leituras anteriores a{' '}
          {formatarData(medidor.data_instalacao)} são do medidor antigo.
        </p>
      )}
    </Card>
  )
}

/** Bloco 7: geração distribuída (painel solar etc.). O bloco inteiro é null quando a UC não tem. */
export function BlocoGeracao({ gd }: { gd: GeracaoDistribuida | null }) {
  if (!gd) {
    return (
      <Card titulo="Geração distribuída" aria-label="Geração distribuída">
        <EmptyState
          icone={<SunMedium size={26} strokeWidth={1.5} />}
          titulo="Sem geração distribuída"
          descricao="Esta unidade não tem painel solar ou outra geração própria cadastrada."
        />
      </Card>
    )
  }
  return (
    <Card titulo="Geração distribuída" aria-label="Geração distribuída">
      <ListaDados
        className="sm:grid-cols-1"
        itens={[
          { rotulo: 'Potência instalada', valor: `${potencia.format(gd.potencia_kwp)} kWp` },
          { rotulo: 'Modalidade', valor: rotuloModalidadeGd(gd.modalidade) },
          { rotulo: 'Conectada em', valor: formatarData(gd.data_conexao) },
          {
            rotulo: 'Energia injetada (média mensal)',
            valor: formatarIndicador(gd.energia_injetada_media_mensal),
          },
        ]}
      />
      <p className="mt-3 text-legenda text-ink-2">
        Média do cadastro da GD, não a geração medida no período.
      </p>
    </Card>
  )
}
