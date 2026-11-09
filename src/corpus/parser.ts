import type {
  ContextoEstrutural,
  Dispositivo,
  StatusDispositivo,
  TipoDispositivo,
} from "./tipos.js";

/**
 * Parser do texto compilado de uma lei federal (formato do Planalto, extraído com
 * `pdftotext -layout`). Produz a lista de dispositivos com hierarquia, status de
 * vigência e forma de citação.
 *
 * Regras de estrutura:
 * - inciso antes de qualquer parágrafo pertence ao caput do artigo; depois, ao parágrafo;
 * - alínea pertence ao último inciso (ou ao parágrafo/caput, se não houver inciso);
 * - item numerado pertence à última alínea;
 * - texto entre aspas tipográficas que transcreve outra norma fica dentro do
 *   dispositivo que o introduz e não gera dispositivos próprios.
 *
 * Regras de vigência (a compilação mantém redações antigas, sem marca no texto extraído):
 * - quando o mesmo rótulo se repete sob o mesmo pai, a última ocorrência válida é a
 *   vigente e as demais são `redacao_anterior`;
 * - texto incluído ou alterado por medida provisória com "Vigência encerrada" é
 *   `vigencia_encerrada`;
 * - revogação feita por medida provisória com vigência encerrada não produz efeito.
 */

interface No {
  tipo: TipoDispositivo;
  numero: string;
  linhas: string[];
  pai: No | null;
  filhos: No[];
  contexto: ContextoEstrutural;
  ordem: number;
  temCitacao: boolean;
}

const RE_ARTIGO = /^Art\.\s*(\d+)\s*[º°o]?(-[A-Z])?\s*\.?\s+(.*)$/;
const RE_PARAGRAFO = /^§\s*(\d+)\s*[º°o]?(-[A-Z])?\s*\.?\s+(.*)$/;
const RE_PARAGRAFO_UNICO = /^Parágrafo único\s*\.?\s*(.*)$/;
const RE_INCISO = /^([IVXLCDM]+)(-[A-Z])?\s*[-–—]\s*(.*)$/;
const RE_ALINEA = /^([a-z])\)\s*(.*)$/;
const RE_ITEM = /^(\d{1,2})\.\s+(.*)$/;
const RE_TITULO = /^(TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO|Seção|Subseção)\s+([IVXLCDM]+(?:-[A-Z])?|ÚNIC[OA]|Únic[oa])\s*$/;

/** Recuo mínimo (em espaços) de uma linha que inicia dispositivo. Continuações não têm recuo. */
const RECUO_ROTULO = 3;
/** Recuo mínimo de uma linha centralizada (títulos, capítulos, seções). */
const RECUO_CENTRALIZADO = 20;

const RE_ANOTACAO =
  /\((?:Reda[cç][aã]o dada|Inclu[ií]d[oa]|Revogad[oa]|Vide|Regulamento|Vig[eê]ncia|Promulga[cç][aã]o|Produ[cç][aã]o de efeitos?|Mensagem de veto)[^()]*(?:\([^()]*\)[^()]*)*\)/gi;
const RE_VIGENCIA_ENCERRADA = /Vig[eê]ncia encerrada/gi;
/** Links "Vigência" soltos no fim do dispositivo (um por decreto de atualização de valores). */
const RE_VIGENCIA_SOLTA = /(?:\s+Vigência)+\s*$/;

function contar(texto: string, caractere: string): number {
  let n = 0;
  for (const c of texto) if (c === caractere) n++;
  return n;
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

interface TextoLimpo {
  texto: string;
  anotacoes: string[];
  encerrada: boolean;
}

/** Separa o texto normativo das anotações editoriais da compilação. */
export function separarAnotacoes(bruto: string): TextoLimpo {
  let texto = normalizarEspacos(bruto);
  const anotacoes: string[] = [];
  texto = texto.replace(RE_ANOTACAO, (trecho) => {
    anotacoes.push(normalizarEspacos(trecho));
    return " ";
  });
  const encerrada = RE_VIGENCIA_ENCERRADA.test(texto);
  RE_VIGENCIA_ENCERRADA.lastIndex = 0;
  texto = texto.replace(RE_VIGENCIA_ENCERRADA, " ");
  texto = texto.replace(RE_VIGENCIA_SOLTA, " ");
  // Ênclise quebrada pela extração: "aplicar- se-á" -> "aplicar-se-á".
  texto = texto.replace(/(\p{L})- (se|lhe|lhes)\b/gu, "$1-$2");
  return { texto: normalizarEspacos(texto), anotacoes, encerrada };
}

function ordinal(numero: string): string {
  const m = /^(\d+)(-[A-Z])?$/.exec(numero);
  if (!m) return numero;
  const n = Number(m[1]);
  return `${n}${n < 10 ? "º" : ""}${m[2] ?? ""}`;
}

function segmento(no: No): string {
  switch (no.tipo) {
    case "artigo":
      return `art-${no.numero}`;
    case "paragrafo":
      return `par-${no.numero}`;
    case "inciso":
      return `inc-${no.numero}`;
    case "alinea":
      return `ali-${no.numero}`;
    case "item":
      return `item-${no.numero}`;
  }
}

function citacaoDe(cadeia: No[]): string {
  const partes: string[] = [];
  const artigo = cadeia[0];
  if (!artigo) return "";
  partes.push(`art. ${ordinal(artigo.numero)}`);
  const temParagrafo = cadeia.some((n) => n.tipo === "paragrafo");
  if (cadeia.length > 1 && !temParagrafo) partes.push("caput");
  for (const no of cadeia.slice(1)) {
    if (no.tipo === "paragrafo") {
      partes.push(no.numero === "unico" ? "parágrafo único" : `§ ${ordinal(no.numero)}`);
    } else if (no.tipo === "inciso") {
      partes.push(`inciso ${no.numero}`);
    } else if (no.tipo === "alinea") {
      partes.push(`alínea "${no.numero}"`);
    } else if (no.tipo === "item") {
      partes.push(`item ${no.numero}`);
    }
  }
  return partes.join(", ");
}

export interface OpcoesParser {
  /** Linha que marca o fim do corpo da norma. Padrão: fecho "Brasília, ...". */
  fimDoCorpo?: RegExp;
}

export function parsearLei(textoBruto: string, opcoes: OpcoesParser = {}): Dispositivo[] {
  const fim = opcoes.fimDoCorpo ?? /^\s*Brasília,\s/;
  const linhas = textoBruto.replace(/\f/g, "\n").split(/\r?\n/);

  const raizes: No[] = [];
  const contexto: ContextoEstrutural = {};
  let artigo: No | null = null;
  let paragrafo: No | null = null;
  let inciso: No | null = null;
  let alinea: No | null = null;
  let atual: No | null = null;
  let saldoAspas = 0;
  let ordem = 0;
  /** Nível de título cujo nome ainda está sendo lido. */
  let lendoNomeDe: keyof ContextoEstrutural | null = null;

  const novo = (tipo: TipoDispositivo, numero: string, resto: string, pai: No | null): No => {
    const no: No = {
      tipo,
      numero,
      linhas: [resto],
      pai,
      filhos: [],
      contexto: { ...contexto },
      ordem: ordem++,
      temCitacao: false,
    };
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
    atual = no;
    lendoNomeDe = null;
    return no;
  };

  for (const linha of linhas) {
    if (fim.test(linha)) break;
    const conteudo = linha.trim();
    if (conteudo === "") continue;
    const recuo = linha.length - linha.trimStart().length;
    const dentroDeCitacao = saldoAspas > 0;
    const abreCitacao = conteudo.startsWith("“");
    saldoAspas = Math.max(0, saldoAspas + contar(conteudo, "“") - contar(conteudo, "”"));

    // Transcrição de outra norma: fica dentro do dispositivo que a introduz.
    if (dentroDeCitacao || abreCitacao) {
      const destino = atual as No | null;
      if (destino) {
        destino.linhas.push(conteudo);
        if (/^“?\s*(Art\.|CAP[IÍ]TULO|§)/.test(conteudo) || /\.{8,}/.test(conteudo)) {
          destino.temCitacao = true;
        }
      }
      continue;
    }

    if (recuo >= RECUO_CENTRALIZADO) {
      const t = RE_TITULO.exec(conteudo);
      if (t) {
        const nivel = t[1]!.toUpperCase();
        const rotulo = `${t[1]} ${t[2]}`;
        if (nivel === "TÍTULO") {
          contexto.titulo = rotulo;
          delete contexto.capitulo;
          delete contexto.secao;
          delete contexto.subsecao;
          lendoNomeDe = "titulo";
        } else if (nivel === "CAPÍTULO") {
          contexto.capitulo = rotulo;
          delete contexto.secao;
          delete contexto.subsecao;
          lendoNomeDe = "capitulo";
        } else if (nivel === "SEÇÃO") {
          contexto.secao = rotulo;
          delete contexto.subsecao;
          lendoNomeDe = "secao";
        } else {
          contexto.subsecao = rotulo;
          lendoNomeDe = "subsecao";
        }
        atual = null;
        continue;
      }
      if (lendoNomeDe && atual === null) {
        const nome = separarAnotacoes(conteudo).texto;
        if (nome) {
          const base = contexto[lendoNomeDe] ?? "";
          contexto[lendoNomeDe] = base.includes(" - ") ? `${base} ${nome}` : `${base} - ${nome}`;
        }
        continue;
      }
    }

    if (recuo >= RECUO_ROTULO) {
      let m: RegExpExecArray | null;
      if ((m = RE_ARTIGO.exec(conteudo))) {
        artigo = novo("artigo", `${m[1]}${m[2] ?? ""}`, m[3] ?? "", null);
        paragrafo = inciso = alinea = null;
        continue;
      }
      if (artigo) {
        if ((m = RE_PARAGRAFO.exec(conteudo))) {
          paragrafo = novo("paragrafo", `${m[1]}${m[2] ?? ""}`, m[3] ?? "", artigo);
          inciso = alinea = null;
          continue;
        }
        if ((m = RE_PARAGRAFO_UNICO.exec(conteudo))) {
          paragrafo = novo("paragrafo", "unico", m[1] ?? "", artigo);
          inciso = alinea = null;
          continue;
        }
        if ((m = RE_INCISO.exec(conteudo))) {
          inciso = novo("inciso", `${m[1]}${m[2] ?? ""}`, m[3] ?? "", paragrafo ?? artigo);
          alinea = null;
          continue;
        }
        if ((m = RE_ALINEA.exec(conteudo))) {
          alinea = novo("alinea", m[1]!, m[2] ?? "", inciso ?? paragrafo ?? artigo);
          continue;
        }
        if (alinea && (m = RE_ITEM.exec(conteudo))) {
          novo("item", m[1]!, m[2] ?? "", alinea);
          continue;
        }
      }
    }

    // Continuação do dispositivo corrente.
    const destino = atual as No | null;
    if (destino) destino.linhas.push(conteudo);
  }

  return montar(raizes);
}

interface Avaliado {
  no: No;
  limpo: TextoLimpo;
  revogado: boolean;
  vetado: boolean;
  /** Texto de medida provisória que perdeu a vigência. */
  caducou: boolean;
}

function avaliar(no: No): Avaliado {
  const limpo = separarAnotacoes(no.linhas.join(" "));
  const anotadoRevogado = limpo.anotacoes.some((a) => /^\(Revogad/i.test(a));
  const textoRevogado = /^\(?\s*revogad[oa]\s*\)?[.;]?$/i.test(limpo.texto);
  // Revogação por medida provisória que caducou não produz efeito: o texto segue válido.
  const revogacaoCaduca = anotadoRevogado && limpo.encerrada;
  return {
    no,
    limpo,
    revogado: (anotadoRevogado || textoRevogado) && !revogacaoCaduca,
    vetado: /^\(?\s*VETADO\s*\)?[.;]?$/i.test(limpo.texto),
    caducou: limpo.encerrada && !anotadoRevogado,
  };
}

function montar(raizes: No[]): Dispositivo[] {
  const saida: Dispositivo[] = [];

  const visitar = (irmaos: No[], cadeiaPai: No[], idPai: string | null, paiVigente: boolean, idArtigo: string | null) => {
    const avaliados = irmaos.map(avaliar);
    const grupos = new Map<string, Avaliado[]>();
    for (const a of avaliados) {
      const chave = `${a.no.tipo}:${a.no.numero}`;
      const g = grupos.get(chave);
      if (g) g.push(a);
      else grupos.set(chave, [a]);
    }

    for (const a of avaliados) {
      const grupo = grupos.get(`${a.no.tipo}:${a.no.numero}`)!;
      const validos = grupo.filter((g) => !g.caducou);
      const corrente = validos[validos.length - 1] ?? null;
      let status: StatusDispositivo;
      if (a.caducou) status = "vigencia_encerrada";
      else if (a !== corrente) status = "redacao_anterior";
      else if (a.revogado) status = "revogado";
      else if (a.vetado) status = "vetado";
      else status = "vigente";

      const ehCorrente = a === corrente;
      const versao = grupo.indexOf(a) + 1;
      const seg = segmento(a.no) + (ehCorrente ? "" : `@v${versao}`);
      const id = idPai ? `${idPai}/${seg}` : seg;
      const cadeia = [...cadeiaPai, a.no];
      const vigente = paiVigente && status === "vigente";
      const artigoId = idArtigo ?? id;

      saida.push({
        id,
        idPai,
        idArtigo: artigoId,
        tipo: a.no.tipo,
        numero: a.no.numero,
        texto: a.limpo.texto,
        anotacoes: a.limpo.anotacoes,
        status,
        vigente,
        citacao: citacaoDe(cadeia),
        contexto: a.no.contexto,
        contemTextoDeOutraNorma: a.no.temCitacao,
        ordem: a.no.ordem,
      });

      visitar(a.no.filhos, cadeia, id, vigente, artigoId);
    }
  };

  visitar(raizes, [], null, true, null);
  return saida.sort((x, y) => x.ordem - y.ordem);
}
