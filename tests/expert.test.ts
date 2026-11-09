import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { Expert, escolherNivel } from "../src/expert/expert.js";
import { ModeloSimulado } from "../src/expert/modelo.js";
import { montarContexto } from "../src/expert/contexto.js";
import { AVISO, REGRAS } from "../src/expert/prompt.js";
import { criarServidor } from "../src/api/servidor.js";

let corpus: Corpus;
let busca: BuscaHibrida;

beforeAll(() => {
  corpus = Corpus.deArquivo("corpus/gerado/lei-14133.json");
  busca = new BuscaHibrida(corpus);
});

const BOA = `A dispensa por valor para compras está no art. 75, caput, inciso II. O valor vigente é R$ 65.492,11, fixado pelo Decreto nº 12.807, de 29 de dezembro de 2025; o valor no texto da lei é o original. ${AVISO}`;
const RUIM = `A dispensa por valor está no art. 75, caput, inciso XXXV. ${AVISO}`;
const PERGUNTA = "Até que valor posso dispensar licitação em compras?";

describe("contexto", () => {
  it("traz o artigo inteiro do topo, com o valor vigente, e só dispositivos vigentes", async () => {
    const contexto = montarContexto(corpus, await busca.buscar(PERGUNTA, { k: 10 }));
    expect(contexto.texto).toContain("[art. 75, caput, inciso II]");
    expect(contexto.texto).toContain("Valor vigente: R$ 65.492,11, desde 01/01/2026");
    expect(contexto.ids.every((id) => corpus.obter(id)?.vigente)).toBe(true);
    expect(new Set(contexto.ids).size).toBe(contexto.ids.length);
  });
});

describe("expert", () => {
  it("entrega a resposta quando todas as citações conferem", async () => {
    const modelo = new ModeloSimulado([BOA]);
    const r = await new Expert(corpus, busca, modelo).responder(PERGUNTA, "fornecedor");
    expect(r.desfecho).toBe("resposta");
    expect(r.texto).toBe(BOA);
    expect(r.tentativas).toBe(1);
    expect(r.citacoes.map((c) => c.dispositivo?.id)).toEqual(["art-75/inc-II"]);
    const pedido = modelo.pedidos[0]!;
    expect(pedido.sistema).toBe(REGRAS);
    expect(pedido.mensagem).toContain("fornecedor que participa de licitações");
    expect(pedido.mensagem).toContain(`PERGUNTA: ${PERGUNTA}`);
    expect(pedido.mensagem).toContain("[art. 75, caput, inciso II]");
  });

  it("refaz uma vez quando a citação não confere e informa os motivos ao modelo", async () => {
    const modelo = new ModeloSimulado([RUIM, BOA]);
    const r = await new Expert(corpus, busca, modelo).responder(PERGUNTA);
    expect(r.desfecho).toBe("resposta");
    expect(r.tentativas).toBe(2);
    expect(modelo.pedidos[1]!.mensagem).toContain("não existe na Lei nº 14.133");
    expect(modelo.pedidos[1]!.nivel).toBe("padrao");
  });

  it("bloqueia quando o modelo insiste na citação errada e não entrega o texto dele", async () => {
    const modelo = new ModeloSimulado([RUIM, RUIM]);
    const r = await new Expert(corpus, busca, modelo).responder(PERGUNTA);
    expect(r.desfecho).toBe("bloqueada");
    expect(r.texto).not.toContain("XXXV");
    expect(r.motivos.join(" ")).toContain("XXXV");
    expect(modelo.pedidos).toHaveLength(2);
  });

  it("bloqueia resposta sem nenhuma citação", async () => {
    const r = await new Expert(corpus, busca, new ModeloSimulado(["Pode sim.", "Pode sim."])).responder(PERGUNTA);
    expect(r.desfecho).toBe("bloqueada");
  });

  it("devolve sem cobertura quando o modelo declara que o contexto não responde", async () => {
    const r = await new Expert(corpus, busca, new ModeloSimulado(["SEM_COBERTURA"])).responder(PERGUNTA);
    expect(r.desfecho).toBe("sem_cobertura");
    expect(r.tentativas).toBe(1);
  });

  it("não chama o modelo quando a busca não acha nada", async () => {
    const modelo = new ModeloSimulado([]);
    const r = await new Expert(corpus, busca, modelo).responder("xyzzy qwfp zxcvb");
    expect(r.desfecho).toBe("sem_cobertura");
    expect(modelo.pedidos).toHaveLength(0);
  });

  it("roteia leitura de dispositivo para o modelo rápido e o resto para o padrão", () => {
    expect(escolherNivel("O que diz o art. 75, II?")).toBe("rapido");
    expect(escolherNivel("Explique o § 4º do art. 59")).toBe("rapido");
    expect(escolherNivel(PERGUNTA)).toBe("padrao");
    expect(escolherNivel("Com base no art. 75, II, posso fracionar a compra em vários contratos pequenos ao longo do ano?")).toBe("padrao");
  });
});

describe("api", () => {
  it("responde em /perguntar e valida a entrada", async () => {
    const expert = new Expert(corpus, busca, new ModeloSimulado([BOA]));
    const servidor = criarServidor(expert);
    await new Promise<void>((ok) => servidor.listen(0, ok));
    const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    try {
      expect(await (await fetch(`${base}/saude`)).json()).toEqual({ ok: true });

      const vazia = await fetch(`${base}/perguntar`, { method: "POST", body: JSON.stringify({}) });
      expect(vazia.status).toBe(400);
      const invalida = await fetch(`${base}/perguntar`, { method: "POST", body: "isto não é json" });
      expect(invalida.status).toBe(400);

      const boa = await fetch(`${base}/perguntar`, {
        method: "POST",
        body: JSON.stringify({ pergunta: PERGUNTA, perfil: "fornecedor" }),
      });
      expect(boa.status).toBe(200);
      const corpo = (await boa.json()) as { desfecho: string; citacoes: { id: string; status: string }[] };
      expect(corpo.desfecho).toBe("resposta");
      expect(corpo.citacoes).toEqual([{ trecho: "art. 75, caput, inciso II", status: "ok", id: "art-75/inc-II" }]);
    } finally {
      await new Promise((ok) => servidor.close(ok));
    }
  });
});
