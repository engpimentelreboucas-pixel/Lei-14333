/** Sobe a API do expert. Requer ANTHROPIC_API_KEY. Uso: npm run servidor (porta em PORTA, padrão 3000) */
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";
import { Expert } from "../src/expert/expert.js";
import { ModeloClaude } from "../src/expert/claude.js";
import { criarServidor } from "../src/api/servidor.js";

const corpus = Corpus.deArquivo("corpus/gerado/lei-14133.json");
const expert = new Expert(corpus, new BuscaHibrida(corpus), new ModeloClaude());
const porta = Number(process.env.PORTA ?? 3000);
criarServidor(expert).listen(porta, () => console.log(`Expert ouvindo em http://localhost:${porta}`));
