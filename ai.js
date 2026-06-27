/*
  ai.js — fala com a API de IA para extrair dados de um vinho.

  REGRA INEGOCIÁVEL embutida no pedido (system prompt): a IA só preenche o que
  a fonte realmente traz. Campo sem dado confiável volta VAZIO. Preço e janela
  de consumo vêm marcados como "fonte" (confirmado), "estimativa" ou "vazio".
  Nunca inventar.

  A chave de API é fornecida por você nos Ajustes e fica só no aparelho.
  Padrão: Anthropic (Claude) com busca web. OpenAI é uma alternativa.
*/

const IA = (() => {
  // Texto que orienta a IA. É aqui que a honestidade vira regra.
  const INSTRUCAO = `Você ajuda a catalogar vinhos. Pesquise na web para confirmar os dados do rótulo.
REGRAS:
- Só preencha um campo se houver fonte confiável. Sem fonte, devolva vazio (null ou "").
- NUNCA invente preço nem janela de consumo. Se não achar, marque origem "vazio".
- Para PREÇO e JANELA, marque "origem": "fonte" se veio de fonte clara, "estimativa" se é uma dedução sua sem fonte direta, "vazio" se não há base.
- Janela de consumo é sempre uma FAIXA de anos (início e fim), nunca data exata.
- "tipo" deve ser "tinto" ou "branco" (rosé/espumante: trate como "branco").
Responda SOMENTE com um objeto JSON neste formato, sem texto fora dele:
{
  "nome": "", "produtor": "", "regiao": "", "pais": "",
  "uvas": [], "safra": null, "tipo": null,
  "preco": { "min": null, "max": null, "moeda": "R$", "origem": "vazio" },
  "janela": { "inicio": null, "fim": null, "origem": "vazio" },
  "fontes": [], "observacao": ""
}`;

  // Extrai o primeiro bloco { ... } de um texto (a IA às vezes adiciona conversa).
  function extrairJSON(texto) {
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini === -1 || fim === -1) throw new Error("A IA não devolveu um JSON reconhecível.");
    return JSON.parse(texto.slice(ini, fim + 1));
  }

  // —— Anthropic (Claude) ——
  async function viaAnthropic({ apiKey, modelo, texto, fotoBase64, fotoMime }) {
    const conteudo = [];
    if (fotoBase64) {
      conteudo.push({
        type: "image",
        source: { type: "base64", media_type: fotoMime, data: fotoBase64 },
      });
    }
    conteudo.push({ type: "text", text: texto || "Extraia os dados deste vinho." });

    let messages = [{ role: "user", content: conteudo }];
    let resposta;

    // A busca web roda no servidor da Anthropic em várias etapas. Se ele
    // "pausar" (pause_turn), reenviamos para continuar — até 5 vezes.
    for (let i = 0; i < 6; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          // Permite chamar a API direto do navegador (Safari).
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 2048,
          system: INSTRUCAO,
          tools: [{ type: "web_search_20260209", name: "web_search" }],
          messages,
        }),
      });
      if (!r.ok) {
        const erro = await r.text();
        throw new Error(`Erro da API (${r.status}): ${erro.slice(0, 300)}`);
      }
      resposta = await r.json();
      if (resposta.stop_reason === "pause_turn") {
        // Continua de onde parou.
        messages = [...messages, { role: "assistant", content: resposta.content }];
        continue;
      }
      break;
    }
    // Junta todos os blocos de texto da resposta final.
    const texto_resp = (resposta.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return extrairJSON(texto_resp);
  }

  // —— OpenAI (alternativa; pode variar conforme o modelo) ——
  async function viaOpenAI({ apiKey, modelo, texto, fotoBase64, fotoMime }) {
    const conteudo = [{ type: "input_text", text: (texto || "Extraia os dados deste vinho.") + "\n\n" + INSTRUCAO }];
    if (fotoBase64) {
      conteudo.push({
        type: "input_image",
        image_url: `data:${fotoMime};base64,${fotoBase64}`,
      });
    }
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelo,
        tools: [{ type: "web_search" }],
        input: [{ role: "user", content: conteudo }],
      }),
    });
    if (!r.ok) {
      const erro = await r.text();
      throw new Error(`Erro da API (${r.status}): ${erro.slice(0, 300)}`);
    }
    const data = await r.json();
    // Procura o texto de saída em formatos comuns da Responses API.
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
    // Função única usada pelo app. Decide o provedor e devolve o objeto extraído.
    async extrair({ provedor, apiKey, modelo, texto, fotoBase64, fotoMime }) {
      if (!apiKey) throw new Error("Configure sua chave de API nos Ajustes primeiro.");
      const args = { apiKey, modelo, texto, fotoBase64, fotoMime };
      return provedor === "openai" ? viaOpenAI(args) : viaAnthropic(args);
    },
  };
})();
