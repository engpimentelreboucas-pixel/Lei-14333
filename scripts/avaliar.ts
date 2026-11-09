/** Roda a avaliação da busca contra as perguntas de referência. Uso: npm run avaliar */
import { readFileSync } from "node:fs";
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { avaliarBusca, validarGabarito, type PerguntaDeReferencia } from "../src/avaliacao/runner.js";

const corpus = Corpus.deArquivo("corpus/gerado/lei-14133.json");
const perguntas = JSON.parse(readFileSync("avaliacao/perguntas.json", "utf8")) as PerguntaDeReferencia[];

const erros = validarGabarito(corpus, perguntas);
if (erros.length) {
  console.error("Gabarito inválido:\n" + erros.join("\n"));
  process.exit(1);
}

const relatorio = await avaliarBusca(new BuscaHibrida(corpus), perguntas, 5);
for (const r of relatorio.resultados) {
  const marca = r.posicao === null ? "FALHOU" : `pos ${r.posicao}`;
  console.log(`${r.id} [${marca}] ${r.pergunta}`);
  if (r.posicao === null) console.log(`     retornou: ${r.artigosRetornados.join(", ")}`);
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`\nPerguntas: ${relatorio.total}`);
console.log(`Artigo esperado em 1º: ${pct(relatorio.acertoNoPrimeiro)}`);
console.log(`Artigo esperado entre os ${relatorio.k} primeiros: ${pct(relatorio.acertoNosK)}`);
