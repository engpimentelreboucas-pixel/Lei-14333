// Gera web/pagina.html: núcleo e corpus embutidos em um único arquivo. Uso: node web/montar.mjs
import { readFileSync, writeFileSync } from "node:fs";
const modelo = readFileSync("web/modelo.html", "utf8");
const nucleo = readFileSync("web/nucleo.js", "utf8").replace(/<\/script/gi, "<\\/script");
const corpus = JSON.stringify(JSON.parse(readFileSync("corpus/gerado/lei-14133.json", "utf8"))).replace(/</g, "\\u003c");
const saida = modelo.replace("/*NUCLEO*/", () => nucleo).replace("/*CORPUS*/", () => corpus);
writeFileSync("web/pagina.html", saida);
console.log(`web/pagina.html: ${(saida.length / 1024).toFixed(0)} KB`);
