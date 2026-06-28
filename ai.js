/*
  ai.js — fala com a API de IA para extrair dados de um vinho.

  Dois modos (parâmetro "comBusca"):
    - comBusca: false → RÁPIDO. Só lê o rótulo da foto (nome, produtor, safra,
      uva, região). Não pesquisa na web. Usado no cadastro em lote.
    - comBusca: true  → COMPLETO. Pesquisa na web para trazer também preço e
      janela de consumo. Mais lento. Usado quando você quer enriquecer um vinho.

  REGRA INEGOCIÁVEL: a IA só preenche o que a fonte traz. Sem dado confiável,
  o campo volta vazio. Preço e janela vêm marcados como "fonte"/"estimativa"/
  "vazio". Nunca inventar. A chave de API fica só no aparelho.
*/

const IA = (() => {
  // Formato de resposta comum aos dois modos.
  const FORMATO = `Responda SOMENTE com um objeto JSON neste formato, sem texto fora dele:
{
  "nome": "", "produtor": "", "regiao": "", "pais": "",
  "uvas": [], "safra": null, "tipo": null,
  "preco": { "min": null, "max": null, "moeda": "R$", "origem": "vazio" },
  "janela": { "inicio": null, "fim": null, "origem": "vazio", "base": "" },
  "fontes": [], "observacao": ""
}`;

  // Modo RÁPIDO: só o rótulo, sem pesquisa.
  const INSTRUCAO_RAPIDA = `Você cataloga vinhos. Leia o RÓTULO desta foto e preencha o que estiver
visível ou que você reconheça com segurança: nome, produtor, região, país, uvas, safra, tipo
("tinto" ou "branco"; rosé/espumante trate como "branco").
NÃO pesquise na web. Deixe preço e janela com valores null e "origem": "vazio".
Se um campo não estiver legível, deixe vazio.
${FORMATO}`;

  // Modo COMPLETO: pesquisa na web para preço e janela.
  const INSTRUCAO_COMPLETA = `Você cataloga vinhos. Pesquise na web para confirmar os dados.
REGRAS:
- Só preencha um campo se houver fonte confiável. Sem fonte, devolva vazio (null ou "").
- NUNCA invente preço nem janela. Se não achar, marque origem "vazio".
- Para PREÇO e JANELA: "origem" = "fonte" (fonte clara), "estimativa" (dedução sua) ou "vazio".
- Janela de consumo é sempre uma FAIXA de anos (início e fim), nunca data exata.
- "tipo" = "tinto" ou "branco" (rosé/espumante: "branco").
${FORMATO}`;

  // Modo FOCADO EM JANELA: o ponto mais importante do app. Sommelier que pesquisa.
  const INSTRUCAO_JANELA = `Você é um sommelier experiente. Sua tarefa é determinar a JANELA DE CONSUMO
(faixa de anos ideal para beber) do vinho descrito. Esta é a informação mais importante.
PASSOS:
1) PESQUISE na web por "drink window" / janela de guarda deste vinho e safra: críticos
   (Wine Spectator, Decanter, Vinous/Antonio Galloni, Wine Advocate/Robert Parker, James
   Suckling), notas do produtor e o consenso de comunidades (CellarTracker, Vivino).
2) Se ACHAR fonte com janela: janela.origem = "fonte" e janela.base = qual fonte/crítico e o ano.
3) Se NÃO achar janela publicada (normal em vinhos comuns): faça uma ESTIMATIVA fundamentada
   pela uva, região, qualidade da safra e potencial de guarda do estilo. janela.origem =
   "estimativa" e janela.base = explique o raciocínio em uma frase curta. NÃO deixe vazio se
   for possível estimar com responsabilidade.
4) A janela é SEMPRE uma FAIXA de anos (início e fim), nunca data exata.
5) Dê a janela para uma garrafa PADRÃO de 750ml — o app ajusta sozinho para magnum. Não some o
   efeito do formato você mesmo.
6) Se também encontrar preço com fonte, preencha (mesma regra de origem). Os demais campos pode
   deixar vazios — o foco é a janela.
${FORMATO}`;

  // Modo FOCADO EM PREÇO: busca o preço de varejo ATUAL no Brasil.
  const INSTRUCAO_PRECO = `Você é especialista em vinhos. Encontre o PREÇO DE VAREJO ATUAL no BRASIL do vinho descrito.
PASSOS:
1) Pesquise lojas brasileiras (Evino, Wine.com.br, Grand Cru, Mistral, Divvino, Lab21, etc.).
2) Se achar → preco.origem = "fonte" e preco.base = qual(is) loja(s) e a referência (ex.: "Grand Cru R$X").
3) Se só achar preço internacional → converta (~5,4 BRL/USD) e marque preco.origem = "estimativa".
4) Se não achar → preco com min/max null e origem "vazio".
Foque no PREÇO; os demais campos pode deixar vazios.
${FORMATO}`;

  // Modo FOCADO EM PREÇO NA ORIGEM: preço de prateleira no país de origem do vinho.
  const INSTRUCAO_PRECO_ORIGEM = `Você é especialista em vinhos. Encontre o PREÇO DE VAREJO no PAÍS DE ORIGEM do vinho
(ou no maior mercado dessa origem), para comparar com o preço brasileiro. NÃO é o custo de importar.
PASSOS:
1) Identifique o país de origem (Argentina, Chile, França, Itália, Espanha, Portugal, EUA…).
2) Pesquise o preço de varejo LÁ: Wine-Searcher (preço médio/mín global), idealwine/Millésima (Europa),
   wine.com/Total Wine (EUA), lojas locais (Argentina/Chile).
3) Devolva o preço em MOEDA LOCAL (US$, €, AR$, CLP$…) e uma conversão APROXIMADA para reais (brlAprox),
   usando o câmbio atual aproximado.
4) "fonteTipo": "fonte" se achou loja/Wine-Searcher claro; "estimativa" se deduziu/converteu; "vazio" se nada.
5) NÃO some impostos de importação — é só o preço de prateleira na origem.
Responda SOMENTE com este JSON, sem texto fora:
{
  "origem": { "min": null, "max": null, "moeda": "", "pais": "", "brlAprox": null, "fonteTipo": "vazio", "base": "" }
}`;

  function extrairJSON(texto) {
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini === -1 || fim === -1) throw new Error("A IA não devolveu um JSON reconhecível.");
    return JSON.parse(texto.slice(ini, fim + 1));
  }

  // —— Anthropic (Claude) ——
  async function viaAnthropic({ apiKey, modelo, texto, fotoBase64, fotoMime, comBusca, instrucao }) {
    const conteudo = [];
    if (fotoBase64) {
      conteudo.push({
        type: "image",
        source: { type: "base64", media_type: fotoMime, data: fotoBase64 },
      });
    }
    conteudo.push({ type: "text", text: texto || "Extraia os dados deste vinho." });

    const ferramentas = comBusca ? [{ type: "web_search_20260209", name: "web_search" }] : [];
    let messages = [{ role: "user", content: conteudo }];
    let resposta;

    // Com busca web, o servidor pode "pausar" (pause_turn) — reenviamos para continuar.
    for (let i = 0; i < 6; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 2048,
          system: instrucao,
          tools: ferramentas,
          messages,
        }),
      });
      if (!r.ok) {
        const erro = await r.text();
        throw new Error(`Erro da API (${r.status}): ${erro.slice(0, 300)}`);
      }
      resposta = await r.json();
      if (resposta.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: resposta.content }];
        continue;
      }
      break;
    }
    const texto_resp = (resposta.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return extrairJSON(texto_resp);
  }

  // —— OpenAI (alternativa) ——
  async function viaOpenAI({ apiKey, modelo, texto, fotoBase64, fotoMime, comBusca, instrucao }) {
    const conteudo = [{ type: "input_text", text: (texto || "Extraia os dados deste vinho.") + "\n\n" + instrucao }];
    if (fotoBase64) {
      conteudo.push({ type: "input_image", image_url: `data:${fotoMime};base64,${fotoBase64}` });
    }
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        tools: comBusca ? [{ type: "web_search" }] : [],
        input: [{ role: "user", content: conteudo }],
      }),
    });
    if (!r.ok) {
      const erro = await r.text();
      throw new Error(`Erro da API (${r.status}): ${erro.slice(0, 300)}`);
    }
    const data = await r.json();
    let saida = data.output_text;
    if (!saida && Array.isArray(data.output)) {
      saida = data.output
        .flatMap((o) => o.content || [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text)
        .join("\n");
    }
    if (!saida) throw new Error("Resposta da OpenAI em formato inesperado.");
    return extrairJSON(saida);
  }

  return {
    // foco: "rapido" (só rótulo, sem web) | "completo" (web) | "janela" (web, focado na janela).
    // comBusca segue o foco; o lote usa foco "rapido".
    async extrair({ provedor, apiKey, modelo, texto, fotoBase64, fotoMime, comBusca = true, foco }) {
      if (!apiKey) throw new Error("Configure sua chave de API nos Ajustes primeiro.");
      let instrucao, busca;
      if (foco === "janela") { instrucao = INSTRUCAO_JANELA; busca = true; }
      else if (foco === "preco") { instrucao = INSTRUCAO_PRECO; busca = true; }
      else if (foco === "precoOrigem") { instrucao = INSTRUCAO_PRECO_ORIGEM; busca = true; }
      else if (foco === "rapido" || comBusca === false) { instrucao = INSTRUCAO_RAPIDA; busca = false; }
      else { instrucao = INSTRUCAO_COMPLETA; busca = true; }
      const args = { apiKey, modelo, texto, fotoBase64, fotoMime, comBusca: busca, instrucao };
      return provedor === "openai" ? viaOpenAI(args) : viaAnthropic(args);
    },
  };
})();
