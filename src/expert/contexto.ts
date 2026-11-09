import type { Corpus } from "../corpus/corpus.js";
import type { Dispositivo } from "../corpus/tipos.js";
import type { Resultado } from "../busca/hibrida.js";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Frase sobre o valor vigente de um dispositivo, quando houver atualização por decreto. */
export function fraseDoValor(d: Dispositivo): string {
  const v = d.valorAtualizado;
  if (!v) return "";
  return `Valor vigente: ${v.valor}, desde ${dataBR(v.vigenteDesde)} (${v.norma}). O valor no texto é o original.`;
}

export interface OpcoesContexto {
  /** Quantos artigos do topo entram por inteiro. */
  artigosInteiros?: number;
  /** Teto de dispositivos por artigo inteiro. */
  maxPorArtigo?: number;
  /** Teto de caracteres por dispositivo. */
  maxCaracteres?: number;
}

export interface Contexto {
  /** Texto entregue ao modelo: uma linha por dispositivo, `[citação] texto {valor vigente}`. */
  texto: string;
  /** Ids dos dispositivos incluídos. */
  ids: string[];
}

/**
 * Monta o contexto do modelo: os artigos mais relevantes por inteiro, mais os demais
 * dispositivos encontrados com seus ascendentes. Só dispositivos vigentes entram.
 */
export function montarContexto(corpus: Corpus, resultados: Resultado[], opcoes: OpcoesContexto = {}): Contexto {
  const artigosInteiros = opcoes.artigosInteiros ?? 3;
  const maxPorArtigo = opcoes.maxPorArtigo ?? 60;
  const maxCaracteres = opcoes.maxCaracteres ?? 1200;
  const ids: string[] = [];
  const linhas: string[] = [];
  const incluir = (d: Dispositivo) => {
    if (!d.vigente || ids.includes(d.id)) return;
    ids.push(d.id);
    const texto = d.texto.length > maxCaracteres ? `${d.texto.slice(0, maxCaracteres)} [...]` : d.texto;
    const valor = fraseDoValor(d);
    linhas.push(`[${d.citacao}] ${texto}${valor ? ` {${valor}}` : ""}`);
  };

  const artigos: string[] = [];
  for (const r of resultados) {
    if (!artigos.includes(r.dispositivo.idArtigo)) artigos.push(r.dispositivo.idArtigo);
  }
  for (const idArtigo of artigos.slice(0, artigosInteiros)) {
    corpus.dispositivos.filter((d) => d.idArtigo === idArtigo).slice(0, maxPorArtigo).forEach(incluir);
  }
  for (const r of resultados) corpus.cadeia(r.dispositivo.id).forEach(incluir);

  return { texto: linhas.join("\n"), ids };
}
