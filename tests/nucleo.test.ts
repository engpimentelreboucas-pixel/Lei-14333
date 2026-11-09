import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { parsearLei, separarAnotacoes } from "../src/corpus/parser.js";
import { Corpus } from "../src/corpus/corpus.js";
import type { Norma } from "../src/corpus/tipos.js";
import { extrairReferencias, resolverReferencia } from "../src/busca/referencia.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { verificarCitacoes } from "../src/citacoes/verificador.js";
import { avaliarBusca, validarGabarito, type PerguntaDeReferencia } from "../src/avaliacao/runner.js";

let corpus: Corpus;

beforeAll(() => {
  const dispositivos = parsearLei(readFileSync("corpus/fontes/lei-14133.txt", "utf8"));
  const norma: Norma = {
    id: "lei-14133-2021",
    tipo: "lei",
    numero: "14.133",
    ano: 2021,
    nome: "Lei de Licitações e Contratos Administrativos",
    esfera: "federal",
    fonte: "teste",
    compiladoEm: "2026-11-09",
    dispositivos,
  };
  corpus = new Corpus(norma);
});

const obter = (id: string) => {
  const d = corpus.obter(id);
  if (!d) throw new Error(`dispositivo ausente: ${id}`);
  return d;
};

describe("parser", () => {
  it("encontra os artigos 1 a 194, com 172 e 188 vetados", () => {
    for (let n = 1; n <= 194; n++) {
      const d = obter(`art-${n}`);
      expect(d.tipo).toBe("artigo");
      if (n === 172 || n === 188) expect(d.status).toBe("vetado");
      else expect(d.vigente, `art. ${n}`).toBe(true);
    }
  });

  it("reconhece artigos acrescidos por lei posterior", () => {
    expect(obter("art-184-A").vigente).toBe(true);
    expect(obter("art-44-A").anotacoes.join(" ")).toMatch(/Incluído pela Lei/);
  });

  it("gera ids únicos", () => {
    const ids = corpus.dispositivos.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("separa incisos do caput dos incisos de parágrafo", () => {
    expect(obter("art-75/inc-II").citacao).toBe("art. 75, caput, inciso II");
    expect(obter("art-75/par-1/inc-I").citacao).toBe("art. 75, § 1º, inciso I");
    expect(obter("art-6/inc-XVIII/ali-a").citacao).toBe('art. 6º, caput, inciso XVIII, alínea "a"');
    expect(obter("art-1/par-3/inc-II/ali-a").idArtigo).toBe("art-1");
  });

  it("junta linhas quebradas e mantém o texto do dispositivo", () => {
    expect(obter("art-28").texto).toBe("São modalidades de licitação:");
    expect(obter("art-28/inc-I").texto).toBe("pregão;");
    expect(obter("art-59/par-4").texto).toMatch(/inferiores a 75% \(setenta e cinco por cento\)/);
  });

  it("tira anotações editoriais do texto e as preserva à parte", () => {
    const d = obter("art-75/inc-I");
    expect(d.texto).not.toMatch(/Vide|Vigência/);
    expect(d.texto.endsWith("veículos automotores;")).toBe(true);
    expect(d.anotacoes.some((a) => /Vide Decreto/.test(a))).toBe(true);
    for (const x of corpus.dispositivos) {
      expect(x.texto, x.id).not.toMatch(/\((Incluíd|Redação dada|Vide |Regulamento)/);
    }
  });

  it("marca redação anterior e mantém vigente a última redação", () => {
    expect(obter("art-87@v1").status).toBe("redacao_anterior");
    expect(obter("art-87").vigente).toBe(true);
    expect(obter("art-75/inc-XVI").anotacoes.join(" ")).toMatch(/Redação dada pela Lei nº 15\.471/);
    expect(obter("art-75/inc-XVI@v1").vigente).toBe(false);
  });

  it("trata medida provisória com vigência encerrada", () => {
    expect(obter("art-191@v2").status).toBe("vigencia_encerrada");
    expect(obter("art-191@v2/inc-I@v1").vigente).toBe(false);
    expect(obter("art-191").vigente).toBe(true);
    expect(obter("art-191/par-unico").vigente).toBe(true);
    expect(obter("art-75/inc-XVII@v1").status).toBe("vigencia_encerrada");
  });

  it("mantém a transcrição do Código Penal dentro do art. 178", () => {
    expect(obter("art-178").contemTextoDeOutraNorma).toBe(true);
    expect(corpus.obter("art-337-E")).toBeUndefined();
    expect(obter("art-179").vigente).toBe(true);
  });

  it("registra título, capítulo e seção", () => {
    const c = obter("art-28").contexto;
    expect(c.titulo).toBe("TÍTULO II - DAS LICITAÇÕES");
    expect(c.secao).toBe("Seção II - Das Modalidades de Licitação");
  });

  it("separarAnotacoes cobre anotação quebrada e vigência encerrada", () => {
    const r = separarAnotacoes("texto da regra;   (Incluído pela Medida\nProvisória nº 1.167, de 2023) Vigência encerrada");
    expect(r.texto).toBe("texto da regra;");
    expect(r.encerrada).toBe(true);
    expect(r.anotacoes).toHaveLength(1);
  });
});

describe("referências", () => {
  const unica = (texto: string) => {
    const refs = extrairReferencias(texto);
    expect(refs).toHaveLength(1);
    return refs[0]!;
  };

  it("lê a forma direta", () => {
    expect(unica("conforme o art. 75, II, da lei")).toMatchObject({ artigo: "75", inciso: "II" });
    expect(unica("art. 75, § 1º, inciso I")).toMatchObject({ artigo: "75", paragrafo: "1", inciso: "I" });
    expect(unica('art. 6º, XVIII, "a"')).toMatchObject({ artigo: "6", inciso: "XVIII", alinea: "a" });
    expect(unica("artigo 191, parágrafo único")).toMatchObject({ artigo: "191", paragrafo: "unico" });
    expect(unica("art. 75, caput, inciso VIII, alínea a")).toMatchObject({ caput: true, inciso: "VIII", alinea: "a" });
    expect(unica("Art. 184-A")).toMatchObject({ artigo: "184-A" });
  });

  it("lê a forma inversa", () => {
    expect(unica("o § 4º do art. 59 trata disso")).toMatchObject({ artigo: "59", paragrafo: "4" });
    expect(unica("inciso II do caput do art. 75")).toMatchObject({ artigo: "75", inciso: "II", caput: true });
    expect(unica("alínea c do inciso IV do art. 75")).toMatchObject({ artigo: "75", inciso: "IV", alinea: "c" });
  });

  it("não confunde texto comum com inciso ou alínea", () => {
    expect(unica("o art. 28 e a prática de mercado")).toEqual(expect.objectContaining({ artigo: "28" }));
    expect(unica("o art. 28 e a prática de mercado").inciso).toBeUndefined();
    expect(unica("veja o art. 5º. Depois disso").alinea).toBeUndefined();
  });

  it("lê listas e identifica outra norma", () => {
    expect(extrairReferencias("arts. 74 e 75").map((r) => r.artigo)).toEqual(["74", "75"]);
    expect(unica("art. 24, II, da Lei nº 8.666, de 1993").normaCitada).toMatch(/8\.666/);
    expect(unica("art. 75 da Lei nº 14.133/2021").normaCitada).toMatch(/14\.133/);
  });

  it("resolve de forma estrita", () => {
    const r = (t: string) => resolverReferencia(corpus, extrairReferencias(t)[0]!);
    expect(r("art. 75, II").dispositivo?.id).toBe("art-75/inc-II");
    expect(r("art. 75, § 1º, I").dispositivo?.id).toBe("art-75/par-1/inc-I");
    expect(r("art. 28, XX")).toEqual({});
    expect(r("art. 250")).toEqual({});
    expect(r("art. 172").naoVigente?.status).toBe("vetado");
  });
});

describe("verificador de citações", () => {
  it("aprova resposta com citações existentes e vigentes", () => {
    const v = verificarCitacoes(
      corpus,
      "A dispensa por valor para compras está no art. 75, II. O prazo de impugnação está no art. 164.",
    );
    expect(v.aprovada).toBe(true);
    expect(v.citacoes.map((c) => c.status)).toEqual(["ok", "ok"]);
  });

  it("reprova artigo, inciso ou parágrafo que não existe", () => {
    expect(verificarCitacoes(corpus, "Conforme o art. 312 da lei.").aprovada).toBe(false);
    expect(verificarCitacoes(corpus, "Conforme o art. 28, inciso XX.").aprovada).toBe(false);
    const v = verificarCitacoes(corpus, "Vale o art. 164 e também o art. 75, § 15.");
    expect(v.aprovada).toBe(false);
    expect(v.citacoes.map((c) => c.status)).toEqual(["ok", "inexistente"]);
  });

  it("reprova dispositivo vetado", () => {
    const v = verificarCitacoes(corpus, "Segundo o art. 172, a regra é esta.");
    expect(v.aprovada).toBe(false);
    expect(v.citacoes[0]?.status).toBe("nao_vigente");
  });

  it("reprova resposta sem citação", () => {
    expect(verificarCitacoes(corpus, "Pode dispensar, sem problema.").aprovada).toBe(false);
  });

  it("não confere norma fora do corpus e sinaliza", () => {
    const v = verificarCitacoes(corpus, "Antes valia o art. 24, II, da Lei nº 8.666; hoje, o art. 75, II.");
    expect(v.citacoes.map((c) => c.status)).toEqual(["norma_fora_do_corpus", "ok"]);
    expect(v.aprovada).toBe(false);
    expect(
      verificarCitacoes(corpus, "Antes valia o art. 24, II, da Lei nº 8.666; hoje, o art. 75, II.", {
        reprovarNormaForaDoCorpus: false,
      }).aprovada,
    ).toBe(true);
  });
});

describe("busca", () => {
  it("resolve consulta por número de dispositivo em primeiro lugar", async () => {
    const r = await new BuscaHibrida(corpus).buscar("o que diz o art. 75, II?");
    expect(r[0]?.dispositivo.id).toBe("art-75/inc-II");
    expect(r[0]?.origens).toContain("referencia");
  });

  it("só devolve dispositivos vigentes por padrão", async () => {
    const busca = new BuscaHibrida(corpus);
    const padrao = await busca.buscar("registro cadastral unificado de licitantes", { k: 20 });
    expect(padrao.every((x) => x.dispositivo.vigente)).toBe(true);
    const todos = await busca.buscar("registro cadastral unificado de licitantes", { k: 20, incluirNaoVigentes: true });
    expect(todos.some((x) => !x.dispositivo.vigente)).toBe(true);
  });

  it("mantém o desempenho nas perguntas de referência", async () => {
    const perguntas = JSON.parse(readFileSync("avaliacao/perguntas.json", "utf8")) as PerguntaDeReferencia[];
    expect(validarGabarito(corpus, perguntas)).toEqual([]);
    const rel = await avaliarBusca(new BuscaHibrida(corpus), perguntas, 5);
    // Piso de regressão da busca lexical; sobe quando a busca vetorial entrar.
    expect(rel.acertoNosK).toBeGreaterThanOrEqual(0.9);
  });
});
