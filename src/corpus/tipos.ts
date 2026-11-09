/** Tipos do corpus normativo. A unidade mínima é o dispositivo. */

export type TipoDispositivo = "artigo" | "paragrafo" | "inciso" | "alinea" | "item";

export type StatusDispositivo =
  /** Texto em vigor. */
  | "vigente"
  /** Redação substituída por outra posterior do mesmo dispositivo. */
  | "redacao_anterior"
  /** Texto de medida provisória cuja vigência foi encerrada. */
  | "vigencia_encerrada"
  | "revogado"
  | "vetado";

/** Posição do dispositivo na estrutura da norma (títulos, capítulos, seções). */
export interface ContextoEstrutural {
  titulo?: string;
  capitulo?: string;
  secao?: string;
  subsecao?: string;
}

export interface Dispositivo {
  /** Identificador estável, ex.: `art-75/inc-VIII/ali-a`. Versões não vigentes levam `@vN`. */
  id: string;
  idPai: string | null;
  /** Identificador do artigo a que pertence (o próprio id, se for artigo). */
  idArtigo: string;
  tipo: TipoDispositivo;
  /** Rótulo do dispositivo: "75", "184-A", "1", "unico", "VIII", "a". */
  numero: string;
  /** Texto do dispositivo, sem anotações editoriais. */
  texto: string;
  /** Anotações editoriais da compilação: "(Incluído pela Lei nº ...)", "(Vide ...)" etc. */
  anotacoes: string[];
  status: StatusDispositivo;
  /** Verdadeiro só se o dispositivo e todos os seus ascendentes estão vigentes. */
  vigente: boolean;
  /** Forma de citar, ex.: `art. 75, caput, inciso VIII, alínea "a"`. */
  citacao: string;
  contexto: ContextoEstrutural;
  /** O texto transcreve alteração feita em outra norma (ex.: Código Penal). */
  contemTextoDeOutraNorma: boolean;
  /** Posição na ordem de leitura da norma. */
  ordem: number;
}

export interface Norma {
  id: string;
  tipo: string;
  numero: string;
  ano: number;
  nome: string;
  esfera: "federal" | "estadual" | "municipal";
  fonte: string;
  /** Data em que a compilação foi obtida (ISO). */
  compiladoEm: string;
  dispositivos: Dispositivo[];
}
