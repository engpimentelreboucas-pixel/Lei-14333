/** Pergunta ao expert com o modelo real. Requer ANTHROPIC_API_KEY. Uso: npm run perguntar -- "sua pergunta" */
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { Expert } from "../src/expert/expert.js";
import { ModeloClaude } from "../src/expert/claude.js";

const pergunta = process.argv.slice(2).join(" ");
if (!pergunta) {
  console.error('Uso: npm run perguntar -- "sua pergunta"');
  process.exit(1);
}
const corpus = Corpus.deArquivo("corpus/gerado/lei-14133.json");
const expert = new Expert(corpus, new BuscaHibrida(corpus), new ModeloClaude());
const r = await expert.responder(pergunta);
console.log(`[${r.desfecho}] tentativas: ${r.tentativas} | modelos: ${r.modelos.join(", ")} | tokens: ${r.uso.tokensEntrada} entrada, ${r.uso.tokensSaida} saída\n`);
console.log(r.texto);
if (r.motivos.length) console.log("\nMotivos:\n- " + r.motivos.join("\n- "));
