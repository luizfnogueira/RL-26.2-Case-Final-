import { useContext } from 'react'
import { ContextoAuth } from './contexto'

export function useIdentidade() {
  const consulta = useContext(ContextoAuth)
  const usuario = consulta?.dados
  const nomes = usuario?.nome.trim().split(/\s+/) ?? []
  const iniciais = nomes.length
    ? [nomes[0], ...(nomes.length > 1 ? [nomes.at(-1)!] : [])]
        .map((nome) => Array.from(nome)[0])
        .join('')
        .toLocaleUpperCase('pt-BR')
    : '—'
  return {
    nome:
      usuario?.nome ??
      (consulta?.carregando
        ? 'Carregando conta…'
        : consulta?.erro
          ? 'Conta indisponível'
          : 'Visitante'),
    cargo: usuario
      ? usuario.cargo || (usuario.perfil === 'administrador' ? 'Administrador' : 'Usuário')
      : '',
    iniciais,
    carregando: consulta?.carregando ?? false,
    erro: consulta?.erro ?? null,
    recarregar: consulta?.recarregar,
  }
}
