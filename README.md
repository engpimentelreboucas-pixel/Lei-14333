# Experts — núcleo do Expert Lei 14.133

Primeiro corte da fase 1 da especificação do MVP: ingestão da Lei nº 14.133/2021 em
dispositivos, busca, verificador de citações e avaliação. Ainda sem interface, sem LLM
e sem banco de dados.

## O que existe

| Parte | Arquivo | O que faz |
| --- | --- | --- |
| Parser | `src/corpus/parser.ts` | Converte o texto compilado da lei em dispositivos (artigo, parágrafo, inciso, alínea, item) com hierarquia, status de vigência e forma de citação |
| Corpus | `src/corpus/corpus.ts` | Acesso em memória por id, filhos e cadeia de ascendentes |
| Referências | `src/busca/referencia.ts` | Lê citações em texto livre ("art. 75, II", "§ 4º do art. 59") e resolve contra o corpus |
| Busca | `src/busca/hibrida.ts`, `src/busca/lexical.ts` | Referência exata + BM25, com ponto de encaixe para busca vetorial |
| Verificador | `src/citacoes/verificador.ts` | Confere cada citação de uma resposta; reprova citação inexistente, não vigente ou não conferível |
| Avaliação | `src/avaliacao/runner.ts`, `avaliacao/perguntas.json` | 30 perguntas de referência com o artigo esperado |

## Como usar

Requer Node 22.

```bash
npm install
npm run ingerir                                  # texto da lei -> corpus/gerado/lei-14133.json
npm run consultar -- "prazo para impugnar o edital"
npm run avaliar                                  # desempenho da busca nas perguntas de referência
npm test
```

Para reingerir a partir de um PDF novo do Planalto (requer poppler):

```bash
pdftotext -layout L14133.pdf corpus/fontes/lei-14133.txt && npm run ingerir
```

## Estado atual

- 1.459 dispositivos; 194 artigos numerados de 1 a 194 (172 e 188 vetados), mais os arts. 44-A e 184-A.
- Busca só lexical: artigo esperado entre os 5 primeiros em 93% das perguntas de referência e em 1º em 67%.
- 9 dispositivos com valor em reais atualizado pelo Decreto nº 12.807/2025.
- 26 testes automatizados.

## Regras de vigência aplicadas pelo parser

A compilação do Planalto mantém redações antigas, e o texto extraído do PDF não traz o
tachado. O parser decide assim:

- rótulo repetido sob o mesmo pai: a última ocorrência válida é a vigente; as demais são `redacao_anterior`;
- texto incluído ou alterado por medida provisória com "Vigência encerrada": `vigencia_encerrada`;
- revogação feita por medida provisória que perdeu a vigência não produz efeito;
- filho de dispositivo não vigente nunca é vigente.

Versões não vigentes recebem sufixo no id (`art-87@v1`). O id da versão vigente é estável.

## Limites conhecidos

- **Valores em reais.** O texto da lei traz os valores originais. Os vigentes ficam em
  `valorAtualizado`, carregados de `corpus/fontes/valores-decreto-12807.json` (Decreto nº 12.807/2025,
  em vigor desde 01/01/2026; tabela transcrita da publicação da Câmara dos Deputados). O decreto
  delega as próximas atualizações ao Ministro da Gestão: a cada virada de ano é preciso conferir o
  ato novo e trocar o arquivo. A ingestão falha se algum dispositivo com valor ficar sem atualização.
- **Vigência por heurística.** As regras acima foram conferidas nos 22 casos de versão não
  vigente desta compilação. Uma compilação futura precisa de nova conferência.
- **Sem datas de vigência.** O status é o da data da compilação (2026-11-09). Datas de início e
  fim por dispositivo ainda não são extraídas.
- **Busca sem semântica.** Perguntas em linguagem distante do texto legal falham
  ("a prefeitura quer me multar"). A busca vetorial entra pela interface `IndiceVetorial`.
- **Só a Lei 14.133.** Citações de outras normas são marcadas `norma_fora_do_corpus` e reprovadas
  por padrão, porque não podem ser conferidas.
- **Transcrições de outras normas** (Código Penal no art. 178 etc.) ficam dentro do dispositivo
  que as introduz e não são citáveis individualmente.

## Próximos passos

1. Postgres com pgvector: persistir dispositivos e implementar `IndiceVetorial`.
2. Ingerir as demais normas da lista do corpus (decretos regulamentadores, instruções normativas).
3. Orquestração do expert: busca, geração com LLM, verificação de citações, nova tentativa ou recusa.
4. Ampliar as perguntas de referência para 200 a 300, com revisão de quem domina a lei.
5. API e chat web com streaming.

Credenciais nunca entram no repositório: tudo será lido de variáveis de ambiente.
