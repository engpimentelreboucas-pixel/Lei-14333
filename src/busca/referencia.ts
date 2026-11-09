import type { Corpus } from "../corpus/corpus.js";
import type { Dispositivo } from "../corpus/tipos.js";

/** Referência a um dispositivo encontrada em texto livre. */
export interface Referencia {
  artigo: string;
  /** "1", "2", "unico". */
  paragrafo?: string;
  /** A referência diz "caput" expressamente. */
  caput?: boolean;
  inciso?: string;
  alinea?: string;
  /** Norma citada junto da referência, se houver (ex.: "Lei nº 8.666"). */
  normaCitada?: string;
  /** Trecho original. */
  trecho: string;
  inicio: number;
  fim: number;
}

const ROMANO = "[IVXLCDM]+(?:-[A-Z])?";
const RE_ARTIGO = /\b(?:arts?\.|artigos?)\s*(\d+)\s*[º°]?(-[A-Z])?/gi;
const RE_CAUDA = new RegExp(
  "^\\s*,?\\s*(?:" +
    "(caput)" +
    "|(?:§|par[aá]grafo)\\s*(\\d+)\\s*[º°]?" +
    "|(par[aá]grafo\\s+[uú]nico)" +
    `|(?:incisos?|inc\\.)\\s*(${ROMANO})` +
    "|(?:al[ií]neas?)\\s*[\"“”']?([a-z])[\"“”')]?" +
    `|(${ROMANO})(?=\\s*(?:[,;.:?!)\\]]|$|\\s+(?:e|ou|d[aoe]s?)\\b|\\s*[-–]))` +
    "|[\"“']([a-z])[\"”']" +
    "|([a-z])\\)" +
    ")",
  "i",
);
// Forma inversa: "inciso II do art. 75", "§ 1º do art. 75", "alínea a do inciso II do caput do art. 75".
const RE_CABECA = new RegExp(
  "(?:al[ií]nea\\s*[\"“']?([a-z])[\"”']?\\s*,?\\s*d[oa]\\s+)?" +
    `(?:inciso\\s+(${ROMANO})\\s*,?\\s*d[oa]\\s+)?` +
    "(?:(?:(?:§|par[aá]grafo)\\s*(\\d+)\\s*[º°]?|(par[aá]grafo\\s+[uú]nico))\\s*,?\\s*d[oa]\\s+)?" +
    "(?:(caput)\\s*,?\\s*d[oa]\\s+)?$",
  "i",
);
const RE_NORMA = /^\s*,?\s*(?:d[ao]|n[ao])\s+((?:Lei(?:\s+Complementar)?|LC|Decreto(?:-Lei)?|Medida\s+Provis[oó]ria|MP|Constitui[cç][aã]o|C[oó]digo|Instru[cç][aã]o\s+Normativa|IN)\b(?:[^,.;)]|(?<=\d)\.(?=\d)){0,60})/i;

/** Extrai todas as referências a artigos (com parágrafo, inciso e alínea) de um texto. */
export function extrairReferencias(texto: string): Referencia[] {
  const refs: Referencia[] = [];
  RE_ARTIGO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_ARTIGO.exec(texto))) {
    const ref: Referencia = {
      artigo: `${m[1]}${(m[2] ?? "").toUpperCase()}`,
      trecho: "",
      inicio: m.index,
      fim: m.index + m[0].length,
    };

    // Componentes antes do artigo (forma inversa).
    const antes = texto.slice(Math.max(0, m.index - 120), m.index);
    const cab = RE_CABECA.exec(antes);
    if (cab && cab[0].length > 0) {
      if (cab[1]) ref.alinea = cab[1].toLowerCase();
      if (cab[2]) ref.inciso = cab[2].toUpperCase();
      if (cab[3]) ref.paragrafo = cab[3];
      if (cab[4]) ref.paragrafo = "unico";
      if (cab[5]) ref.caput = true;
      ref.inicio = m.index - cab[0].length;
    }

    // Componentes depois do artigo (forma direta).
    let resto = texto.slice(ref.fim);
    for (;;) {
      const c = RE_CAUDA.exec(resto);
      if (!c) break;
      if (c[1]) ref.caput = true;
      else if (c[2]) ref.paragrafo = c[2];
      else if (c[3]) ref.paragrafo = "unico";
      else if (c[6] && c[6] !== c[6].toUpperCase()) {
        // Romano solto só vale em maiúsculas; minúscula seguida de ")" é alínea.
        if (!/^[a-z]$/.test(c[6]) || resto[c[0].length] !== ")" || ref.alinea) break;
        ref.alinea = c[6];
        ref.fim += 1;
        resto = resto.slice(1);
      } else if (c[4] ?? c[6]) {
        if (ref.inciso) break;
        ref.inciso = (c[4] ?? c[6])!.toUpperCase();
      } else if (c[5] ?? c[7] ?? c[8]) {
        if (ref.alinea) break;
        ref.alinea = (c[5] ?? c[7] ?? c[8])!.toLowerCase();
      }
      ref.fim += c[0].length;
      resto = resto.slice(c[0].length);
    }

    const norma = RE_NORMA.exec(resto);
    if (norma) ref.normaCitada = norma[1]!.trim();

    ref.trecho = texto.slice(ref.inicio, ref.fim).trim();
    refs.push(ref);

    // Lista no plural: "arts. 74 e 75", "arts. 89 a 108" (do intervalo, só os extremos).
    if (/^arts|^artigos/i.test(m[0])) {
      let pos = ref.fim;
      for (;;) {
        const prox = /^\s*(?:,|e|ou|a)\s*(\d+)\s*[º°]?(-[A-Z])?/.exec(texto.slice(pos));
        if (!prox) break;
        const inicio = pos + prox[0].indexOf(prox[1]!);
        pos += prox[0].length;
        refs.push({
          artigo: `${prox[1]}${prox[2] ?? ""}`,
          normaCitada: ref.normaCitada,
          trecho: `art. ${texto.slice(inicio, pos).trim()}`,
          inicio,
          fim: pos,
        });
      }
      const normaLista = RE_NORMA.exec(texto.slice(pos));
      if (normaLista) {
        for (const r of refs) if (r.inicio >= ref.inicio) r.normaCitada = normaLista[1]!.trim();
      }
      RE_ARTIGO.lastIndex = Math.max(RE_ARTIGO.lastIndex, pos);
    }
  }
  return refs;
}

/** Indica se a norma citada junto da referência é a própria norma do corpus. */
export function ehNormaDoCorpus(normaCitada: string | undefined, numeroDaNorma: string): boolean {
  if (!normaCitada) return true;
  const digitos = (s: string) => s.replace(/\D/g, "");
  const alvo = digitos(numeroDaNorma);
  const m = /(\d[\d.]*)/.exec(normaCitada);
  return m !== null && digitos(m[1]!) === alvo;
}

export interface Resolucao {
  /** Dispositivo vigente correspondente, se existir. */
  dispositivo?: Dispositivo;
  /** O dispositivo existe na norma, mas não está vigente (vetado, revogado etc.). */
  naoVigente?: Dispositivo;
}

/**
 * Resolve uma referência contra o corpus, de forma estrita: cada componente citado
 * precisa existir exatamente onde a referência diz.
 */
export function resolverReferencia(corpus: Corpus, ref: Referencia): Resolucao {
  const candidatos = (pai: string | null, tipo: Dispositivo["tipo"], numero: string) =>
    (pai === null ? corpus.dispositivos.filter((d) => d.idPai === null) : corpus.filhos(pai)).filter(
      (d) => d.tipo === tipo && d.numero === numero,
    );
  const escolher = (lista: Dispositivo[]): Resolucao => {
    const vigente = lista.find((d) => d.vigente);
    if (vigente) return { dispositivo: vigente };
    const corrente = lista.find((d) => !d.id.split("/").pop()!.includes("@v"));
    const outro = corrente ?? lista[lista.length - 1];
    return outro ? { naoVigente: outro } : {};
  };

  let atual = escolher(candidatos(null, "artigo", ref.artigo));
  const descer = (tipo: Dispositivo["tipo"], numero: string): boolean => {
    const base = atual.dispositivo ?? atual.naoVigente;
    if (!base) return false;
    const proximo = escolher(candidatos(base.id, tipo, numero));
    if (!proximo.dispositivo && !proximo.naoVigente) {
      atual = {};
      return false;
    }
    // Filho de dispositivo não vigente nunca é vigente.
    atual = atual.dispositivo ? proximo : { naoVigente: proximo.dispositivo ?? proximo.naoVigente };
    return true;
  };

  if (!atual.dispositivo && !atual.naoVigente) return {};
  if (ref.paragrafo && !descer("paragrafo", ref.paragrafo)) return {};
  if (ref.inciso && !descer("inciso", ref.inciso)) return {};
  if (ref.alinea && !descer("alinea", ref.alinea)) return {};
  return atual;
}
