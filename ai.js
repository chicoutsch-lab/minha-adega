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
  "janela": { "inicio": null, "fim": null, "origem": "vazio" },
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

  function extrairJSON(texto) {
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini === -1 || fim === -1) throw new Error("A IA não devolveu um JSON reconhecível.");
    return JSON.parse(texto.slice(ini, fim + 1));
  }

  // —— Anthropic (Claude) ——
  async function viaAnthropic({ apiKey, modelo, texto, fotoBase64, fotoMime, comBusca }) {
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
          system: comBusca ? INSTRUCAO_COMPLETA : INSTRUCAO_RAPIDA,
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
  async function viaOpenAI({ apiKey, modelo, texto, fotoBase64, fotoMime, comBusca }) {
    const instrucao = comBusca ? INSTRUCAO_COMPLETA : INSTRUCAO_RAPIDA;
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
    // comBusca = true por padrão (modo completo). O lote chama com false.
    async extrair({ provedor, apiKey, modelo, texto, fotoBase64, fotoMime, comBusca = true }) {
      if (!apiKey) throw new Error("Configure sua chave de API nos Ajustes primeiro.");
      const args = { apiKey, modelo, texto, fotoBase64, fotoMime, comBusca };
      return provedor === "openai" ? viaOpenAI(args) : viaAnthropic(args);
    },
  };
})();
