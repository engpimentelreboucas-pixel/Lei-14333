/** Busca lexical BM25 em memória, com normalização para português. */

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por para pelo pela pelos pelas com sem sob sobre " +
    "e ou que se ao aos à às como mais menos ja nao sim ser sera sao foi este esta estes estas esse essa isso isto " +
    "aquele aquela seu sua seus suas qual quais quando onde quem cujo cuja entre ate apos desde tambem lei desta " +
    "deste artigo caput inciso alinea paragrafo nesta neste dela dele eu me meu minha posso pode podem devo deve " +
    "preciso tem ter ha existe sobre quanto quantos quantas"
  ).split(/\s+/),
);

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Redução leve de plural e gênero; suficiente para casar "contratos"/"contrato", "licitações"/"licitação". */
function radical(palavra: string): string {
  let p = palavra;
  if (p.length > 4) {
    if (p.endsWith("oes") || p.endsWith("aes")) p = p.slice(0, -3) + "ao";
    else if (p.endsWith("ais")) p = p.slice(0, -3) + "al";
    else if (p.endsWith("eis")) p = p.slice(0, -3) + "el";
    else if (p.endsWith("res") || p.endsWith("zes")) p = p.slice(0, -2);
    else if (p.endsWith("ns")) p = p.slice(0, -2) + "m";
    else if (p.endsWith("s")) p = p.slice(0, -1);
  }
  return p;
}

export function tokenizar(texto: string): string[] {
  const tokens: string[] = [];
  for (const bruto of semAcento(texto.toLowerCase()).split(/[^a-z0-9]+/)) {
    if (bruto.length < 2 || STOPWORDS.has(bruto)) continue;
    tokens.push(radical(bruto));
  }
  return tokens;
}

export interface Documento {
  id: string;
  /** Campos com peso: o termo conta `peso` vezes. */
  campos: { texto: string; peso: number }[];
}

export interface Pontuado {
  id: string;
  score: number;
}

export class IndiceLexical {
  private readonly k1 = 1.4;
  private readonly b = 0.6;
  private readonly postings = new Map<string, Map<number, number>>();
  private readonly tamanhos: number[] = [];
  private readonly ids: string[] = [];
  private tamanhoMedio = 0;

  constructor(documentos: Documento[]) {
    let total = 0;
    documentos.forEach((doc, i) => {
      this.ids.push(doc.id);
      let tamanho = 0;
      for (const campo of doc.campos) {
        for (const termo of tokenizar(campo.texto)) {
          let lista = this.postings.get(termo);
          if (!lista) this.postings.set(termo, (lista = new Map()));
          lista.set(i, (lista.get(i) ?? 0) + campo.peso);
          tamanho += campo.peso;
        }
      }
      this.tamanhos.push(tamanho);
      total += tamanho;
    });
    this.tamanhoMedio = documentos.length ? total / documentos.length : 0;
  }

  buscar(consulta: string, k: number): Pontuado[] {
    const n = this.ids.length;
    const scores = new Map<number, number>();
    for (const termo of new Set(tokenizar(consulta))) {
      const lista = this.postings.get(termo);
      if (!lista) continue;
      const idf = Math.log(1 + (n - lista.size + 0.5) / (lista.size + 0.5));
      for (const [doc, tf] of lista) {
        const norma = 1 - this.b + (this.b * this.tamanhos[doc]!) / this.tamanhoMedio;
        const parcial = (idf * (tf * (this.k1 + 1))) / (tf + this.k1 * norma);
        scores.set(doc, (scores.get(doc) ?? 0) + parcial);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([doc, score]) => ({ id: this.ids[doc]!, score }));
  }
}
