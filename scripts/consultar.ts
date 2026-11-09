/** Consulta o corpus pela linha de comando. Uso: npm run consultar -- "dispensa por valor em obras" */
import { Corpus } from "../src/corpus/corpus.js";
import { BuscaHibrida } from "../src/busca/hibrida.js";

const consulta = process.argv.slice(2).join(" ");
if (!consulta) {
  console.error('Uso: npm run consultar -- "sua pergunta"');
  process.exit(1);
}
const corpus = Corpus.deArquivo("corpus/gerado/lei-14133.json");
const resultados = await new BuscaHibrida(corpus).buscar(consulta, { k: 6 });
for (const r of resultados) {
  const d = r.dispositivo;
  console.log(`\n[${r.origens.join("+")}] ${d.citacao}`);
  console.log(`  ${d.texto.slice(0, 260)}${d.texto.length > 260 ? "..." : ""}`);
  if (d.valorAtualizado) {
    const v = d.valorAtualizado;
    console.log(`  VALOR VIGENTE: ${v.valor} desde ${v.vigenteDesde} (${v.norma}). O valor no texto acima é o original.`);
  }
  if (d.anotacoes.length) console.log(`  Anotações: ${d.anotacoes.join(" ")}`);
}
