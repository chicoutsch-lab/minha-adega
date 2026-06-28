/*
  app.js — junta tudo: navegação, telas, formulário, IA, detalhe e ajustes.
  Lê dados de db.js, usa as regras de logic.js e a IA de ai.js.
*/

// ————— Apoios gerais —————
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const gerarId = () => "v" + Date.now() + Math.floor(Math.random() * 1000);

// Guarda a foto atual do formulário (em formato dataURL e base64 para a IA).
let fotoAtual = { dataURL: "", base64: "", mime: "" };

// Registra o service worker (offline). Só funciona em https ou localhost.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

// ————— Navegação entre telas —————
function irPara(idTela) {
  $$(".tela").forEach((t) => t.classList.toggle("ativa", t.id === idTela));
  $$(".barra button").forEach((b) =>
    b.classList.toggle("ativo", b.dataset.ir === idTela)
  );
  window.scrollTo(0, 0);
  if (idTela === "tela-inicio") renderInicio();
}
$$("[data-ir]").forEach((b) => b.addEventListener("click", () => irPara(b.dataset.ir)));
$("#nav-adicionar").addEventListener("click", () => abrirFormNovo());

// ————— Preenche os seletores de porta e nível a partir das regras —————
function montarSelecaoPosicao() {
  $("#f-porta").innerHTML = PORTAS.map(
    (p) => `<option value="${p.porta}">Porta ${p.porta} (${p.tipo})</option>`
  ).join("");
  $("#f-nivel").innerHTML = NIVEIS.map(
    (n) => `<option value="${n.nivel}">${n.nivel} — ${n.nome}</option>`
  ).join("");
}

// ===================================================================
//  VISÃO GERAL DA ADEGA (topo da Home)
// ===================================================================
const ANO_AGORA = new Date().getFullYear();

// Classifica de forma "ampla": tinto / branco / fortificado / rosé.
// (No banco o tipo é só tinto/branco; aqui detectamos Porto e rosé pelo nome/notas.)
function tipoAmplo(v) {
  const t = ((v.nome || "") + " " + (v.notas || "")).toLowerCase();
  if (/porto|tawny|licoroso|fortific|madeira|jerez/.test(t)) return "fortificado";
  if (/\bros[eé]\b/.test(t)) return "rosé";
  return v.tipo; // "tinto" ou "branco"
}

// Valor estimado de um vinho = preço médio × quantidade.
function valorVinho(v) {
  const p = v.preco || {};
  const lo = Number(p.min) || 0, hi = Number(p.max) || 0;
  const mid = lo && hi ? (lo + hi) / 2 : hi || lo;
  return mid * (v.quantidade || 0);
}

const moedaBR = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");

function renderVisaoGeral(vinhos) {
  const garrafas = vinhos.reduce((s, v) => s + (v.quantidade || 0), 0);
  let tintos = 0, brancos = 0, outros = 0;
  for (const v of vinhos) {
    const q = v.quantidade || 0;
    const t = tipoAmplo(v);
    if (t === "tinto") tintos += q;
    else if (t === "branco") brancos += q;
    else outros += q;
  }
  const valor = vinhos.reduce((s, v) => s + valorVinho(v), 0);
  // "Beber em 12 meses": a janela termina até o ano que vem.
  const beber12 = vinhos.filter((v) => v.janelaFim && v.janelaFim <= ANO_AGORA + 1).length;

  $("#visao-geral").innerHTML = `
    <div class="vg-topo">
      <div class="vg-grande"><b>${garrafas}</b><span>garrafas na adega</span></div>
      <div class="vg-tipos">
        <span title="Tintos">🍷 ${tintos}</span>
        <span title="Brancos">🥂 ${brancos}</span>
        <span title="Outros (Porto, rosé)">🌸 ${outros}</span>
      </div>
    </div>
    <div class="vg-cards">
      <div class="vg-card"><b>${moedaBR(valor)}</b><span>valor na adega</span></div>
      <div class="vg-card clicavel" id="vg-beber"><b>⏳ ${beber12}</b><span>beber em 12 meses ›</span></div>
    </div>`;

  const btnBeber = $("#vg-beber");
  if (btnBeber)
    btnBeber.onclick = () => {
      $("#filtro-estado").value = "beber_ja";
      aplicarFiltros(vinhos);
      $("#lista").scrollIntoView({ behavior: "smooth" });
    };

  renderMiniMapa(vinhos);
}

// Mini-mapa 2D (visão simulada): tintos nas Portas 1-2, brancos na Porta 3.
// Por TIPO (não por posição), pra sempre mostrar algo enquanto as posições não estão cravadas.
function renderMiniMapa(vinhos) {
  let tinto = 0, branco = 0;
  for (const v of vinhos) {
    const q = v.quantidade || 0;
    const t = tipoAmplo(v);
    if (t === "branco" || t === "rosé") branco += q;
    else tinto += q; // tinto + fortificado (Porto)
  }
  const dist = [
    { nome: "Porta 1", classe: "tinto", g: Math.ceil(tinto / 2), cap: 120 },
    { nome: "Porta 2", classe: "tinto", g: Math.floor(tinto / 2), cap: 120 },
    { nome: "Porta 3", classe: "branco", g: branco, cap: 59 },
  ];
  $("#mini-mapa").innerHTML =
    dist
      .map(({ nome, classe, g, cap }) => {
        const pct = cap ? Math.min(100, Math.round((g / cap) * 100)) : 0;
        return `
      <div class="mm-porta ${classe}">
        <div class="mm-barra"><div class="mm-cheio" style="height:${Math.max(pct, 4)}%"></div></div>
        <div class="mm-rotulo">${nome}<br><b>${g}</b> 🍾</div>
      </div>`;
      })
      .join("") +
    `<div class="mm-cap">visão simulada por tipo · toque para o mapa real</div>`;
  $("#mini-mapa").onclick = () => irPara("tela-mapa");
}

// ===================================================================
//  TELA INÍCIO — alertas + lista
// ===================================================================
async function renderInicio() {
  const todos = await DB.todos();
  const vinhos = todos.filter((v) => !v.desejo); // desejos ficam fora da adega
  $("#contador").textContent = `${vinhos.length} vinho(s)`;
  const nDesejos = todos.filter((v) => v.desejo).length;
  $("#desejos-contador").textContent = nDesejos ? `(${nDesejos})` : "";
  renderVisaoGeral(vinhos);

  // —— Seção "Beber em breve": só os urgentes, ordenados por urgência ——
  const urgentes = vinhos
    .map((v) => ({ v, c: avaliarConsumo(v) }))
    .filter((x) => x.c.estado === "beber_ja" || x.c.estado === "passou")
    .sort((a, b) => b.c.urgencia - a.c.urgencia);

  const bloco = $("#bloco-alertas");
  if (urgentes.length === 0) {
    bloco.classList.add("vazio");
    $("#alertas").innerHTML =
      `<p class="dica">Nada saindo da janela agora. 👍</p>`;
  } else {
    bloco.classList.remove("vazio");
    $("#alertas").innerHTML = urgentes
      .map(
        ({ v, c }) => `
      <div class="alerta-item" data-id="${v.id}">
        <div>
          <div class="titulo">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</div>
          <div class="sub">${esc(c.texto)} · ${formatarEndereco(v.posicao)}</div>
        </div>
        <span class="tag ${c.estado}" style="margin-left:auto">${rotuloEstado(c.estado)}</span>
      </div>`
      )
      .join("");
  }

  aplicarFiltros(vinhos);
}

// —— Filtro + busca da lista principal ——
function aplicarFiltros(vinhos) {
  const termo = $("#busca").value.trim().toLowerCase();
  const fe = $("#filtro-estado").value;
  const ft = $("#filtro-tipo").value;
  const fp = $("#filtro-porta").value;
  const fc = $("#filtro-corpo").value;

  const filtrados = vinhos.filter((v) => {
    const c = avaliarConsumo(v);
    if (fe && c.estado !== fe) return false;
    if (ft && v.tipo !== ft) return false;
    if (fc && v.corpo !== fc) return false;
    if (fp && String(v.posicao?.porta) !== fp) return false;
    if (termo) {
      const txt = [v.nome, v.produtor, (v.uvas || []).join(" "), v.regiao]
        .join(" ").toLowerCase();
      if (!txt.includes(termo)) return false;
    }
    return true;
  });

  // Rascunhos (vindos do lote, ainda não revisados) vão para o topo.
  filtrados.sort((a, b) => (b.rascunho ? 1 : 0) - (a.rascunho ? 1 : 0));

  const lista = $("#lista");
  if (filtrados.length === 0) {
    lista.innerHTML = `<p class="vazio-msg">Nenhum vinho aqui ainda. Toque em ➕ Um vinho ou 📸 Vários.</p>`;
    return;
  }

  const nRascunhos = vinhos.filter((v) => v.rascunho).length;
  const aviso = nRascunhos
    ? `<div class="banner-rascunho">📋 ${nRascunhos} rascunho(s) para revisar — toque em cada um para completar.</div>`
    : "";

  lista.innerHTML = aviso + filtrados
    .map((v) => {
      const c = avaliarConsumo(v);
      const foto = v.fotoDataURL ? `<img src="${v.fotoDataURL}" alt="">` : `<img alt="">`;
      const tagEstado = v.rascunho
        ? '<span class="tag rascunho">📋 revisar</span>'
        : `<span class="tag ${c.estado}">${rotuloEstado(c.estado)}</span>`;
      return `
      <div class="cartao-vinho" data-id="${v.id}">
        ${foto}
        <div>
          <div class="nome">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</div>
          <div class="meta">${esc(v.produtor) || "—"} · ${formatarEndereco(v.posicao)}</div>
          ${tagEstado}
          ${tagDecanter(v)}
          ${tagTaca(v)}
          ${v.display ? '<span class="tag otima">★ display</span>' : ""}
          ${(() => { const m = melhorNota(v.premiacoes); return m ? `<span class="tag nota">🏆 ${m.pontos}</span>` : ""; })()}
        </div>
        <div class="qtd">${v.quantidade || 0}🍾</div>
      </div>`;
    })
    .join("");
}

// Clique num vinho (na lista ou nos alertas) abre o detalhe.
document.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card && (card.classList.contains("cartao-vinho") || card.classList.contains("alerta-item"))) {
    abrirDetalhe(card.dataset.id);
  }
});

["#busca", "#filtro-estado", "#filtro-tipo", "#filtro-corpo", "#filtro-porta"].forEach((s) =>
  $(s).addEventListener("input", async () => aplicarFiltros(await DB.todos()))
);

// ===================================================================
//  TELA FORMULÁRIO — adicionar / editar
// ===================================================================
function abrirFormNovo(comoDesejo) {
  $("#form").reset();
  $("#f-id").value = "";
  $("#form-titulo").textContent = comoDesejo ? "Novo desejo" : "Novo vinho";
  $("#btn-excluir").classList.add("oculto");
  $("#f-desejo").checked = !!comoDesejo;
  fotoAtual = { dataURL: "", base64: "", mime: "" };
  $("#f-foto-preview").removeAttribute("src");
  $("#ia-status").textContent = "";
  atualizarCamposCondicionais();
  atualizarModoDesejo();
  atualizarZonaEDivergencias();
  irPara("tela-form");
}

// No modo "desejo", esconde formato/quantidade e posição (não se aplicam).
function atualizarModoDesejo() {
  const desejo = $("#f-desejo").checked;
  $("#fs-formato").classList.toggle("oculto", desejo);
  $("#fs-posicao").classList.toggle("oculto", desejo);
}
$("#f-desejo").addEventListener("change", atualizarModoDesejo);

async function abrirFormEdicao(id) {
  const vinhos = await DB.todos();
  const v = vinhos.find((x) => x.id === id);
  if (!v) return;
  preencherForm(v);
  $("#form-titulo").textContent = "Editar vinho";
  $("#btn-excluir").classList.remove("oculto");
  irPara("tela-form");
}

function preencherForm(v) {
  $("#f-id").value = v.id;
  $("#f-nome").value = v.nome || "";
  $("#f-produtor").value = v.produtor || "";
  $("#f-regiao").value = v.regiao || "";
  $("#f-pais").value = v.pais || "";
  $("#f-uvas").value = (v.uvas || []).join(", ");
  $("#f-safra").value = v.safra || "";
  $("#f-tipo").value = v.tipo || "tinto";
  $("#f-formato").value = v.formato || "750ml";
  $("#f-formato-outro").value = v.formatoOutro || "";
  $("#f-quantidade").value = v.quantidade ?? 1;
  $("#f-preco-moeda").value = v.preco?.moeda || "R$";
  $("#f-preco-min").value = v.preco?.min ?? "";
  $("#f-preco-max").value = v.preco?.max ?? "";
  $("#f-preco-origem").value = v.preco?.origem || "vazio";
  $("#f-janela-inicio").value = v.janelaInicio ?? "";
  $("#f-janela-fim").value = v.janelaFim ?? "";
  $("#f-janela-origem").value = v.janelaOrigem || "vazio";
  mostrarBaseJanela(v.janelaBase, v.janelaOrigem);
  $("#f-porta").value = v.posicao?.porta || 1;
  $("#f-nivel").value = v.posicao?.nivel || "N1";
  $("#f-posicao-num").value = v.posicao?.posicaoNum ?? "";
  $("#f-posicao-nota").value = v.posicao?.posicaoNota || "";
  $("#f-display").checked = !!v.display;
  $("#f-desejo").checked = !!v.desejo;
  $("#f-premiacoes").value = premiacoesParaTexto(v.premiacoes);
  $("#f-corpo").value = v.corpo || "";
  $("#f-temp-servico").value = v.tempServico || "";
  $("#f-taca").value = v.taca || "";
  $("#f-harmonizacao").value = v.harmonizacao || "";
  $("#f-notas").value = v.notas || "";
  atualizarModoDesejo();
  // Reconstrói a foto (inclui o base64) para que o "Buscar dados (IA)" possa reenviá-la.
  fotoAtual = v.fotoDataURL
    ? { dataURL: v.fotoDataURL, base64: v.fotoDataURL.split(",")[1] || "", mime: "image/jpeg" }
    : { dataURL: "", base64: "", mime: "" };
  if (v.fotoDataURL) $("#f-foto-preview").src = v.fotoDataURL;
  else $("#f-foto-preview").removeAttribute("src");
  $("#ia-status").textContent = "";
  atualizarCamposCondicionais();
  atualizarZonaEDivergencias();
}

// Monta o objeto vinho a partir do que está no formulário.
function lerForm() {
  const num = (sel) => {
    const v = $(sel).value.trim();
    return v === "" ? null : Number(v);
  };
  return {
    id: $("#f-id").value || gerarId(),
    nome: $("#f-nome").value.trim(),
    produtor: $("#f-produtor").value.trim(),
    regiao: $("#f-regiao").value.trim(),
    pais: $("#f-pais").value.trim(),
    uvas: $("#f-uvas").value.split(",").map((u) => u.trim()).filter(Boolean),
    safra: num("#f-safra"),
    tipo: $("#f-tipo").value,
    formato: $("#f-formato").value,
    formatoOutro: $("#f-formato-outro").value.trim(),
    quantidade: num("#f-quantidade") ?? 0,
    preco: {
      min: num("#f-preco-min"),
      max: num("#f-preco-max"),
      moeda: $("#f-preco-moeda").value.trim() || "R$",
      origem: $("#f-preco-origem").value,
    },
    janelaInicio: num("#f-janela-inicio"),
    janelaFim: num("#f-janela-fim"),
    janelaOrigem: $("#f-janela-origem").value,
    janelaBase: $("#f-janela-base").dataset.base || "",
    premiacoes: parsePremiacoes($("#f-premiacoes").value),
    posicao: {
      porta: Number($("#f-porta").value),
      nivel: $("#f-nivel").value,
      posicaoNum: num("#f-posicao-num"),
      posicaoNota: $("#f-posicao-nota").value.trim(),
    },
    display: $("#f-display").checked,
    desejo: $("#f-desejo").checked,
    corpo: $("#f-corpo").value,
    tempServico: $("#f-temp-servico").value.trim(),
    taca: $("#f-taca").value,
    harmonizacao: $("#f-harmonizacao").value.trim(),
    notas: $("#f-notas").value.trim(),
    fotoDataURL: fotoAtual.dataURL,
    rascunho: false, // salvar pelo formulário confirma (deixa de ser rascunho)
    editadoEm: new Date().toISOString(),
  };
}

// Mostra/esconde campos que dependem de outra escolha.
function atualizarCamposCondicionais() {
  const nivel = $("#f-nivel").value;
  const nivelInfo = NIVEIS.find((n) => n.nivel === nivel);
  $("#campo-posicao-num").classList.toggle("oculto", nivelInfo?.endereco !== "posicional");
  $("#campo-formato-outro").classList.toggle("oculto", $("#f-formato").value !== "outro");
}

// Recalcula a zona sugerida e as divergências, ao vivo, conforme você digita.
function atualizarZonaEDivergencias() {
  const v = lerForm();
  const sug = sugerirZona(v);
  const nivelInfo = NIVEIS.find((n) => n.nivel === sug.nivel);
  $("#zona-sugerida").innerHTML =
    `💡 Sugestão: <b>${sug.nivel} — ${nivelInfo.nome}</b><br><span class="dica">${esc(sug.motivo)} Você decide onde colocar.</span>`;

  const divs = divergencias(v);
  $("#divergencias-form").innerHTML = divs
    .map((d) => `<div class="diverg ${d.gravidade}">⚠️ ${esc(d.texto)}</div>`)
    .join("");
}

$("#form").addEventListener("input", () => {
  atualizarCamposCondicionais();
  atualizarZonaEDivergencias();
});

// —— Foto: lê do arquivo, comprime e guarda ——
$("#f-foto").addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  fotoAtual = await processarFoto(arquivo);
  $("#f-foto-preview").src = fotoAtual.dataURL;
  // Autopreencher: lê o rótulo sozinho (rápido, sem busca web) se houver chave e o nome estiver vazio.
  const apiKey = await DB.lerConfig("apiKey");
  if (apiKey && !$("#f-nome").value.trim()) {
    const provedor = (await DB.lerConfig("provedor")) || "anthropic";
    const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
    $("#ia-status").textContent = "✨ Lendo o rótulo…";
    try {
      const res = await IA.extrair({ provedor, apiKey, modelo, foco: "rapido",
        texto: "Leia o rótulo desta foto.", fotoBase64: fotoAtual.base64, fotoMime: fotoAtual.mime });
      aplicarExtracao(res);
      $("#ia-status").textContent = "✓ Rótulo lido. Revise — para preço/janela, toque em ✨ Buscar dados (IA).";
    } catch (err) {
      $("#ia-status").textContent = "Não li o rótulo automaticamente: " + err.message;
    }
  }
});

// Reduz a imagem (máx. 900px) e converte para JPEG — economiza espaço.
function processarFoto(arquivo) {
  return new Promise((ok) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let { width: w, height: h } = img;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataURL = cv.toDataURL("image/jpeg", 0.7);
        ok({ dataURL, base64: dataURL.split(",")[1], mime: "image/jpeg" });
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

// —— Botão "Buscar dados (IA)" ——
$("#btn-ia").addEventListener("click", async () => {
  const provedor = (await DB.lerConfig("provedor")) || "anthropic";
  const apiKey = await DB.lerConfig("apiKey");
  const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
  if (!apiKey) {
    $("#ia-status").textContent = "⚠️ Configure sua chave de API nos Ajustes.";
    return;
  }
  // Monta uma pista textual a partir do que você já digitou.
  const pista = [$("#f-nome").value, $("#f-produtor").value, $("#f-safra").value]
    .filter(Boolean).join(" ");
  const texto = pista
    ? `Vinho: ${pista}. Confirme e complete os dados.`
    : "Identifique o vinho deste rótulo e traga os dados.";

  $("#btn-ia").disabled = true;
  $("#ia-status").textContent = "🔎 Pesquisando na web…";
  try {
    const res = await IA.extrair({
      provedor, apiKey, modelo, texto,
      fotoBase64: fotoAtual.base64, fotoMime: fotoAtual.mime,
    });
    aplicarExtracao(res);
    const fontes = (res.fontes || []).length;
    $("#ia-status").textContent =
      `✓ Dados trazidos. ${fontes} fonte(s). Revise e confirme — você é o curador.`;
  } catch (err) {
    $("#ia-status").textContent = "❌ " + err.message;
  } finally {
    $("#btn-ia").disabled = false;
  }
});

// Joga o resultado da IA nos campos, respeitando vazios e marcando origem.
function aplicarExtracao(res) {
  const set = (sel, val) => { if (val != null && val !== "") $(sel).value = val; };
  set("#f-nome", res.nome);
  set("#f-produtor", res.produtor);
  set("#f-regiao", res.regiao);
  set("#f-pais", res.pais);
  if (Array.isArray(res.uvas) && res.uvas.length) $("#f-uvas").value = res.uvas.join(", ");
  set("#f-safra", res.safra);
  if (res.tipo === "tinto" || res.tipo === "branco") $("#f-tipo").value = res.tipo;

  if (res.preco) {
    set("#f-preco-moeda", res.preco.moeda);
    set("#f-preco-min", res.preco.min);
    set("#f-preco-max", res.preco.max);
    $("#f-preco-origem").value = res.preco.origem || "vazio";
  }
  if (res.janela) {
    set("#f-janela-inicio", res.janela.inicio);
    set("#f-janela-fim", res.janela.fim);
    $("#f-janela-origem").value = res.janela.origem || "vazio";
    mostrarBaseJanela(res.janela.base, res.janela.origem);
  }
  if (Array.isArray(res.premiacoes) && res.premiacoes.length && !$("#f-premiacoes").value.trim()) {
    $("#f-premiacoes").value = premiacoesParaTexto(res.premiacoes);
  }
  if (res.observacao) $("#f-notas").value = res.observacao;
  atualizarCamposCondicionais();
  atualizarZonaEDivergencias();
}

// Mostra (e guarda) a "base" da janela: de onde veio ou o raciocínio da estimativa.
function mostrarBaseJanela(texto, origem) {
  const el = $("#f-janela-base");
  if (texto) {
    const rotulo = origem === "fonte" ? "✓ Fonte: " : origem === "estimativa" ? "~ Estimativa: " : "";
    el.textContent = rotulo + texto;
    el.dataset.base = texto;
    el.classList.remove("oculto");
  } else {
    el.textContent = "";
    el.dataset.base = "";
    el.classList.add("oculto");
  }
}

// —— Botão "Buscar janela de consumo (IA)" — busca focada e profunda ——
$("#btn-janela").addEventListener("click", async () => {
  const provedor = (await DB.lerConfig("provedor")) || "anthropic";
  const apiKey = await DB.lerConfig("apiKey");
  const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
  if (!apiKey) {
    $("#janela-status").textContent = "⚠️ Configure sua chave de API nos Ajustes.";
    return;
  }
  const v = lerForm();
  const desc = [v.nome, v.produtor, v.safra, (v.uvas || []).join("/"), v.regiao, v.pais, v.formato]
    .filter(Boolean).join(" · ");
  if (!desc.trim()) {
    $("#janela-status").textContent = "Preencha ao menos o nome e a safra antes de buscar a janela.";
    return;
  }
  $("#btn-janela").disabled = true;
  $("#janela-status").textContent = "🔎 Pesquisando a janela de consumo…";
  try {
    const res = await IA.extrair({
      provedor, apiKey, modelo, foco: "janela",
      texto: `Vinho: ${desc}. Determine a janela de consumo (faixa de anos para beber).`,
      fotoBase64: fotoAtual.base64, fotoMime: fotoAtual.mime,
    });
    const set = (sel, val) => { if (val != null && val !== "") $(sel).value = val; };
    if (res.janela) {
      set("#f-janela-inicio", res.janela.inicio);
      set("#f-janela-fim", res.janela.fim);
      $("#f-janela-origem").value = res.janela.origem || "vazio";
      mostrarBaseJanela(res.janela.base, res.janela.origem);
    }
    // Só aproveita preço se vier de fonte (não força estimativa de preço aqui).
    if (res.preco && res.preco.origem === "fonte") {
      set("#f-preco-min", res.preco.min);
      set("#f-preco-max", res.preco.max);
      set("#f-preco-moeda", res.preco.moeda);
      $("#f-preco-origem").value = "fonte";
    }
    const marca = res.janela?.origem === "fonte" ? "confirmada por fonte"
      : res.janela?.origem === "estimativa" ? "estimada (revise com calma)"
      : "não encontrada — preencha manual";
    $("#janela-status").textContent = `✓ Janela ${marca}. Você é o curador.`;
    atualizarZonaEDivergencias();
  } catch (err) {
    $("#janela-status").textContent = "❌ " + err.message;
  } finally {
    $("#btn-janela").disabled = false;
  }
});

// —— Sugerir harmonização (IA, conhecimento, sem web) ——
$("#btn-harmonizar").addEventListener("click", async () => {
  const provedor = (await DB.lerConfig("provedor")) || "anthropic";
  const apiKey = await DB.lerConfig("apiKey");
  const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
  if (!apiKey) { $("#harmonizar-status").textContent = "⚠️ Configure sua chave de API nos Ajustes."; return; }
  const v = lerForm();
  const desc = [v.nome, v.produtor, v.tipo, (v.uvas || []).join("/"), v.regiao].filter(Boolean).join(" · ");
  if (!desc.trim()) { $("#harmonizar-status").textContent = "Preencha ao menos nome e uva/tipo antes."; return; }
  $("#btn-harmonizar").disabled = true;
  $("#harmonizar-status").textContent = "🍽️ Pensando na harmonização…";
  try {
    const res = await IA.extrair({ provedor, apiKey, modelo, foco: "harmonizacao",
      texto: `Vinho: ${desc}. Sugira a harmonização com comida.` });
    if (res.harmonizacao) {
      $("#f-harmonizacao").value = res.harmonizacao;
      $("#harmonizar-status").textContent = "✓ Sugestão pronta. Edite à vontade — você é o curador.";
    } else {
      $("#harmonizar-status").textContent = "Não consegui gerar a harmonização.";
    }
  } catch (err) {
    $("#harmonizar-status").textContent = "❌ " + err.message;
  } finally {
    $("#btn-harmonizar").disabled = false;
  }
});

// —— Salvar ——
$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const dados = lerForm();
  if (!dados.nome && !dados.produtor) {
    alert("Dê pelo menos um nome ou produtor ao vinho.");
    return;
  }
  // Mescla com o vinho existente para não perder campos fora do formulário
  // (preço atualizado, preço na origem, variação, data de criação…).
  const existente = dados.id ? (await DB.todos()).find((x) => x.id === dados.id) : null;
  const v = { ...(existente || {}), ...dados };
  await DB.salvar(v);
  if (v.desejo) { irPara("tela-desejos"); renderDesejos(); }
  else irPara("tela-inicio");
});

// ===================================================================
//  LISTA DE DESEJOS — vinhos que quero comprar (fora da adega)
// ===================================================================
async function renderDesejos() {
  const desejos = (await DB.todos()).filter((v) => v.desejo);
  const cont = $("#lista-desejos");
  if (!desejos.length) {
    cont.innerHTML = `<p class="vazio-msg">Sua lista de desejos está vazia. Toque em ➕ Adicionar.</p>`;
    return;
  }
  cont.innerHTML = desejos
    .map((v) => `
      <div class="cartao-vinho" data-id="${v.id}">
        ${v.fotoDataURL ? `<img src="${v.fotoDataURL}" alt="">` : `<img alt="">`}
        <div>
          <div class="nome">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</div>
          <div class="meta">${esc(v.produtor) || "—"} · ${esc(v.regiao) || "—"}</div>
          <div class="meta">${precoTexto(v.preco)} ${tagDecanter(v)}</div>
        </div>
        <button class="btn-comprei" data-comprei="${v.id}">✅ Comprei</button>
      </div>`)
    .join("");
}

// Toques na lista de desejos: "Comprei" move para a adega; tocar no card edita.
$("#lista-desejos").addEventListener("click", async (e) => {
  const comprei = e.target.closest("[data-comprei]");
  if (comprei) {
    const id = comprei.dataset.comprei;
    const v = (await DB.todos()).find((x) => x.id === id);
    if (!v) return;
    v.desejo = false;
    if (!v.quantidade) v.quantidade = 1;
    await DB.salvar(v);
    abrirFormEdicao(id); // abre para você posicionar na adega
    return;
  }
  const card = e.target.closest("[data-id]");
  if (card) abrirFormEdicao(card.dataset.id);
});

$("#ir-desejos").addEventListener("click", () => { irPara("tela-desejos"); renderDesejos(); });
$("#add-desejo").addEventListener("click", () => abrirFormNovo(true));

// —— Excluir ——
$("#btn-excluir").addEventListener("click", async () => {
  const id = $("#f-id").value;
  if (id && confirm("Excluir este vinho do catálogo?")) {
    await DB.remover(id);
    irPara("tela-inicio");
  }
});

// ===================================================================
//  TELA DETALHE
// ===================================================================
async function abrirDetalhe(id) {
  const vinhos = await DB.todos();
  const v = vinhos.find((x) => x.id === id);
  if (!v) return;
  const c = avaliarConsumo(v);
  const divs = divergencias(v);
  const sug = sugerirZona(v);

  const linha = (rotulo, valor) =>
    `<div class="linha-dado"><span class="rotulo">${rotulo}</span><span class="valor">${valor}</span></div>`;

  $("#detalhe").innerHTML = `
    ${v.fotoDataURL ? `<img class="foto-grande" src="${v.fotoDataURL}" alt="">` : ""}
    <div>
      <h2 style="margin-bottom:.2rem">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</h2>
      <span class="tag ${c.estado}">${rotuloEstado(c.estado)}</span>
      ${tagDecanter(v)}
      ${v.display ? '<span class="tag otima">★ display</span>' : ""}
      ${(() => { const m = melhorNota(v.premiacoes); return m ? `<span class="tag nota">🏆 ${m.pontos} ${esc(m.critico)}</span>` : ""; })()}
      <p class="dica" style="margin-top:.4rem">${esc(c.texto)}</p>
    </div>
    <div class="cartao">
      ${linha("Produtor", esc(v.produtor) || "—")}
      ${linha("Região / País", `${esc(v.regiao) || "—"} · ${esc(v.pais) || "—"}`)}
      ${linha("Uvas", esc((v.uvas || []).join(", ")) || "—")}
      ${linha("Tipo / formato", `${v.tipo} · ${v.formato}${v.formato === "outro" ? " (" + esc(v.formatoOutro) + ")" : ""}`)}
      ${v.corpo ? linha("Corpo", `<b>${esc(v.corpo)}</b>`) : ""}
      ${v.tempServico ? linha("🌡️ Servir", esc(v.tempServico)) : ""}
      ${v.taca ? linha("🍷 Taça", tacaTexto(v)) : ""}
      ${linha("Garrafas", v.quantidade ?? 0)}
      ${(v.premiacoes && v.premiacoes.length) ? linha("Premiações", premiacoesTexto(v.premiacoes)) : ""}
      ${linha("Preço", precoTexto(v.preco))}
      ${precoExtra(v)}
      ${precoOrigemBloco(v)}
      ${linha("Janela", janelaTexto(v))}
      ${v.janelaBase ? `<p class="base-janela">${v.janelaOrigem === "fonte" ? "✓ Fonte: " : v.janelaOrigem === "estimativa" ? "~ Estimativa: " : ""}${esc(v.janelaBase)}</p>` : ""}
      ${linha("Posição", `${formatarEndereco(v.posicao)}${v.posicao?.posicaoNota ? " · " + esc(v.posicao.posicaoNota) : ""}`)}
      ${v.notas ? linha("Notas", esc(v.notas)) : ""}
    </div>
    ${minDecant(v) ? `<div class="banner-decanter">🫗 <b>Vale decantar ~${minDecant(v)} min</b> antes de servir — abre os aromas e amacia os taninos.</div>` : ""}
    ${v.harmonizacao ? `<div class="bloco-harmonizar"><div class="harmonizar-titulo">🍽️ Harmoniza com</div><p>${esc(v.harmonizacao)}</p></div>` : ""}
    <div class="zona-sugerida">💡 Zona sugerida: <b>${sug.nivel}</b> — ${esc(sug.motivo)}</div>
    <div class="divergencias">
      ${divs.map((d) => `<div class="diverg ${d.gravidade}">⚠️ ${esc(d.texto)}</div>`).join("")}
    </div>
    <div class="acoes">
      <button class="btn-principal" id="det-bebi">🍷 Bebi uma (-1)</button>
      <button class="btn-secundario" id="det-preco">🔄 Atualizar preço</button>
      <button class="btn-secundario" id="det-origem">🌍 Preço na origem</button>
      <button class="btn-secundario" id="det-editar">✏️ Editar</button>
    </div>`;

  $("#det-bebi").onclick = async () => {
    v.quantidade = Math.max(0, (v.quantidade || 0) - 1);
    await DB.salvar(v);
    abrirDetalhe(id);
  };
  $("#det-editar").onclick = () => abrirFormEdicao(id);

  // Preço na origem: preço de prateleira no país de origem (comparação).
  $("#det-origem").onclick = async () => {
    const provedor = (await DB.lerConfig("provedor")) || "anthropic";
    const apiKey = await DB.lerConfig("apiKey");
    const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
    if (!apiKey) { alert("Configure sua chave de API nos Ajustes."); return; }
    const btn = $("#det-origem");
    btn.disabled = true; btn.textContent = "🔎 Buscando…";
    const desc = [v.nome, v.produtor, v.safra, (v.uvas || []).join("/"), v.regiao, v.pais].filter(Boolean).join(" · ");
    try {
      const res = await IA.extrair({ provedor, apiKey, modelo, foco: "precoOrigem",
        texto: `Vinho: ${desc}. Qual o preço de varejo no país de origem?` });
      const o = res.origem || {};
      if (o.min != null || o.max != null || o.brlAprox != null) {
        v.precoOrigem = {
          min: o.min ?? null, max: o.max ?? null, moeda: o.moeda || "",
          pais: o.pais || "", brlAprox: o.brlAprox ?? null,
          origem: o.fonteTipo || "estimativa", base: o.base || "",
          atualizadoEm: new Date().toISOString().slice(0, 10),
        };
        await DB.salvar(v);
        abrirDetalhe(id);
      } else {
        alert("Não encontrei o preço na origem.");
        btn.disabled = false; btn.textContent = "🌍 Preço na origem";
      }
    } catch (err) {
      alert("Erro ao buscar preço na origem: " + err.message);
      btn.disabled = false; btn.textContent = "🌍 Preço na origem";
    }
  };

  // Acompanhar preço: busca o preço atual no varejo BR e guarda data + variação.
  $("#det-preco").onclick = async () => {
    const provedor = (await DB.lerConfig("provedor")) || "anthropic";
    const apiKey = await DB.lerConfig("apiKey");
    const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
    if (!apiKey) { alert("Configure sua chave de API nos Ajustes."); return; }
    const btn = $("#det-preco");
    btn.disabled = true; btn.textContent = "🔎 Buscando…";
    const desc = [v.nome, v.produtor, v.safra, (v.uvas || []).join("/"), v.regiao].filter(Boolean).join(" · ");
    try {
      const res = await IA.extrair({ provedor, apiKey, modelo, foco: "preco",
        texto: `Vinho: ${desc}. Qual o preço de varejo atual no Brasil?` });
      if (res.preco && (res.preco.min != null || res.preco.max != null)) {
        const atual = v.preco || {};
        if (atual.min != null || atual.max != null) v.precoAnterior = { min: atual.min, max: atual.max, moeda: atual.moeda };
        v.preco = { min: res.preco.min, max: res.preco.max, moeda: "R$", origem: res.preco.origem || "fonte", base: res.preco.base || "" };
        v.precoAtualizadoEm = new Date().toISOString().slice(0, 10);
        await DB.salvar(v);
        abrirDetalhe(id);
      } else {
        alert("Não encontrei preço atual em loja brasileira.");
        btn.disabled = false; btn.textContent = "🔄 Atualizar preço";
      }
    } catch (err) {
      alert("Erro ao buscar preço: " + err.message);
      btn.disabled = false; btn.textContent = "🔄 Atualizar preço";
    }
  };
  irPara("tela-detalhe");
}

// Linha extra sob o preço: data da última atualização + variação.
function precoExtra(v) {
  if (!v.precoAtualizadoEm && !v.precoAnterior) return "";
  const partes = [];
  if (v.precoAtualizadoEm) {
    const [a, m, d] = v.precoAtualizadoEm.split("-");
    partes.push(`atualizado em ${d}/${m}/${a}`);
  }
  const varr = variacaoPreco(v);
  if (varr) partes.push(varr);
  return `<p class="dica" style="margin:-.2rem 0 .3rem">${partes.join(" · ")}</p>`;
}
function valorRep(p) { return p ? (p.max != null ? p.max : (p.min != null ? p.min : null)) : null; }
function variacaoPreco(v) {
  const ant = valorRep(v.precoAnterior), atu = valorRep(v.preco);
  if (ant == null || atu == null) return "";
  if (atu > ant) return `↑ subiu (era R$ ${ant})`;
  if (atu < ant) return `↓ caiu (era R$ ${ant})`;
  return "→ estável";
}

// Bloco "preço na origem": valor lá fora, conversão aproximada e % de diferença.
function precoOrigemBloco(v) {
  const o = v.precoOrigem;
  if (!o) return "";
  const moeda = esc(o.moeda || "");
  const faixa = o.min != null && o.max != null
    ? `${moeda} ${o.min}–${o.max}`
    : (o.min != null || o.max != null ? `${moeda} ${o.min ?? o.max}` : "—");
  const brl = o.brlAprox != null ? ` <span class="dica">(~R$ ${o.brlAprox})</span>` : "";
  const selo = o.origem === "fonte"
    ? '<span class="tag otima">✓ fonte</span>'
    : o.origem === "estimativa" ? '<span class="tag estimativa">~ estimativa</span>' : "";

  let diff = "";
  const brBR = valorRep(v.preco), org = o.brlAprox;
  if (brBR != null && org != null && brBR > 0) {
    const pct = Math.round((1 - org / brBR) * 100);
    diff = pct > 0
      ? `<b>💸 ~${pct}% mais barato na origem</b>`
      : pct < 0 ? `~${-pct}% mais caro na origem` : "preço parecido";
  }
  return `
    <div class="bloco-origem">
      <div class="linha-dado"><span class="rotulo">Na origem${o.pais ? ` (${esc(o.pais)})` : ""}</span>
        <span class="valor">${faixa}${brl} ${selo}</span></div>
      ${diff ? `<p class="dica" style="margin:.1rem 0">${diff}</p>` : ""}
      ${o.base ? `<p class="base-janela">${o.origem === "fonte" ? "✓ Fonte: " : "~ "}${esc(o.base)}</p>` : ""}
      <p class="dica">Preço de prateleira na origem — <b>não</b> inclui imposto de importação. É só uma noção para comparar.</p>
    </div>`;
}

// Textos de apoio para o detalhe.
// —— Decantação: minutos extraídos do tempo de serviço (0 = não precisa) ——
function minDecant(v) {
  const m = (v.tempServico || "").match(/decantar\s+(\d+)\s*min/i);
  return m ? Number(m[1]) : 0;
}
// Selo de decanter, bem visível, quando vale decantar.
function tagDecanter(v) {
  const min = minDecant(v);
  return min ? `<span class="tag decantar">🫗 ${min}min</span>` : "";
}

// Taça: selo só para Borgonha (o caso que importa); texto explicativo no detalhe.
function tagTaca(v) {
  return v.taca === "Borgonha" ? `<span class="tag taca">🍷 Borgonha</span>` : "";
}
function tacaTexto(v) {
  if (v.taca === "Borgonha") return "Borgonha — bojo largo, realça aromas delicados (Pinot/Nebbiolo)";
  if (v.taca === "Bordeaux") return "Bordeaux — bojo alto, para tintos encorpados";
  if (v.taca === "Branco") return "Branco — taça menor e mais fechada";
  return v.taca ? esc(v.taca) : "—";
}

// —— Premiações (notas de críticos) ——
// Texto "James Suckling 97, Robert Parker 95" → [{critico, pontos}].
function parsePremiacoes(texto) {
  return texto.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((chunk) => {
    const m = chunk.match(/^(.*?)[\s:–-]*?(\d{2,3})\s*(?:pts?\.?|pontos?)?$/i);
    if (m && m[2]) return { critico: m[1].trim().replace(/[\s:–-]+$/, "").trim(), pontos: Number(m[2]) };
    return { critico: chunk, pontos: null };
  });
}
function premiacoesParaTexto(arr) {
  return (arr || []).map((p) => (p.pontos != null ? `${p.critico} ${p.pontos}` : p.critico)).join(", ");
}
function melhorNota(arr) {
  const comNota = (arr || []).filter((p) => typeof p.pontos === "number");
  if (!comNota.length) return null;
  return comNota.reduce((a, b) => (b.pontos > a.pontos ? b : a));
}
function premiacoesTexto(arr) {
  return (arr || []).map((p) => (p.pontos != null ? `<b>${p.pontos}</b> ${esc(p.critico)}` : esc(p.critico))).join(" · ");
}

function precoTexto(p) {
  if (!p || (p.min == null && p.max == null)) return marcaOrigem("vazio", "não encontrado");
  const faixa = p.min != null && p.max != null
    ? `${p.moeda} ${p.min}–${p.max}`
    : `${p.moeda} ${p.min ?? p.max}`;
  return `${faixa} ${marcaOrigem(p.origem)}`;
}
function janelaTexto(v) {
  if (v.janelaInicio == null && v.janelaFim == null)
    return marcaOrigem("vazio", "não encontrada");
  const faixa = `${v.janelaInicio ?? "?"}–${v.janelaFim ?? "?"}`;
  return `${faixa} ${marcaOrigem(v.janelaOrigem)}`;
}
function marcaOrigem(origem, textoVazio) {
  const mapa = {
    fonte: ["fonte", "✓ fonte"],
    estimativa: ["estimativa", "~ estimativa"],
    manual: ["manual", "✎ manual"],
    vazio: ["vazio", textoVazio || "— vazio"],
  };
  const [cls, txt] = mapa[origem] || mapa.vazio;
  return `<span class="badge ${cls}">${txt}</span>`;
}

// ===================================================================
//  TELA AJUSTES
// ===================================================================
async function carregarAjustes() {
  $("#cfg-provedor").value = (await DB.lerConfig("provedor")) || "anthropic";
  $("#cfg-apikey").value = (await DB.lerConfig("apiKey")) || "";
  $("#cfg-modelo").value = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";

  const cap = (await DB.lerConfig("capacidades")) || capacidadesPadrao();
  $("#cfg-capacidades").innerHTML = Object.entries(cap)
    .map(
      ([zona, valor]) => `
      <div class="cap-linha">
        <span>${zona}</span>
        <input type="number" data-zona="${zona}" value="${valor}" min="0" />
      </div>`
    )
    .join("");
}

$("#btn-salvar-ia").addEventListener("click", async () => {
  await DB.salvarConfig("provedor", $("#cfg-provedor").value);
  await DB.salvarConfig("apiKey", $("#cfg-apikey").value.trim());
  await DB.salvarConfig("modelo", $("#cfg-modelo").value.trim());
  alert("Configuração de IA salva.");
});

$("#btn-salvar-cap").addEventListener("click", async () => {
  const cap = {};
  $$("#cfg-capacidades input[data-zona]").forEach((i) => {
    cap[i.dataset.zona] = Number(i.value) || 0;
  });
  await DB.salvarConfig("capacidades", cap);
  alert("Capacidades salvas.");
});

// —— Exportar catálogo (JSON) ——
$("#btn-exportar").addEventListener("click", async () => {
  const vinhos = await DB.todos();
  const dados = { versao: 1, exportadoEm: new Date().toISOString(), vinhos };
  const json = JSON.stringify(dados, null, 2);
  const nome = `adega-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: "application/json" });

  // No iPhone, a folha de compartilhamento permite AirDrop ou "Salvar em Arquivos".
  const arquivo = new File([blob], nome, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: "Backup da Adega" });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // usuário cancelou — não cai no download
    }
  }
  // Fallback (computador): baixa o arquivo normalmente.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
});

// —— Importar catálogo (JSON) ——
$("#btn-importar").addEventListener("change", async (e) => {
  const arquivo = e.target.files[0];
  if (!arquivo) return;
  try {
    const texto = await arquivo.text();
    const dados = JSON.parse(texto);
    const vinhos = Array.isArray(dados) ? dados : dados.vinhos;
    if (!Array.isArray(vinhos)) throw new Error("Arquivo sem lista de vinhos.");
    if (!confirm(`Importar ${vinhos.length} vinho(s)? Isso substitui o catálogo atual.`)) return;
    await DB.substituirTudo(vinhos);
    alert("Catálogo importado.");
    irPara("tela-inicio");
  } catch (err) {
    alert("Não consegui importar: " + err.message);
  }
  e.target.value = "";
});

// —— Carregar catálogo publicado (do GitHub) ——
$("#btn-carregar-publicado").addEventListener("click", async () => {
  const status = $("#status-publicado");
  status.textContent = "🌐 Baixando catálogo publicado…";
  try {
    const r = await fetch("./dados/catalogo.json?t=" + Date.now());
    if (!r.ok) throw new Error("HTTP " + r.status);
    const dados = await r.json();
    const vinhos = Array.isArray(dados) ? dados : dados.vinhos;
    if (!Array.isArray(vinhos)) throw new Error("Arquivo sem lista de vinhos.");
    if (!confirm(`Carregar ${vinhos.length} vinho(s) do catálogo publicado? Isso substitui o catálogo atual deste aparelho.`)) {
      status.textContent = "";
      return;
    }
    await DB.substituirTudo(vinhos);
    status.textContent = `✓ ${vinhos.length} vinhos carregados.`;
    irPara("tela-inicio");
  } catch (err) {
    status.textContent = "❌ " + err.message;
  }
});

// ————— Apoios de texto —————
function rotuloEstado(estado) {
  return {
    guarda: "Em guarda",
    otima: "Na janela ótima",
    beber_ja: "Beber em breve",
    passou: "Passou do ponto",
    sem_janela: "Sem janela",
  }[estado] || estado;
}
// Escapa texto para não quebrar o HTML (segurança básica).
function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===================================================================
//  TELA LOTE — cadastrar vários por foto
// ===================================================================
let filaLote = [];       // fotos a processar
let loteRodando = false; // evita rodar a fila duas vezes ao mesmo tempo

// Ao escolher as fotos: comprime cada uma, põe na fila e começa a processar.
$("#lote-fotos").addEventListener("change", async (e) => {
  const arquivos = Array.from(e.target.files || []);
  e.target.value = "";
  for (const arq of arquivos) {
    const f = await processarFoto(arq); // reaproveita a compressão do formulário
    filaLote.push({ id: gerarId(), dataURL: f.dataURL, base64: f.base64, mime: f.mime, status: "fila", nome: "", erro: "" });
  }
  renderFila();
  processarFila();
});

// Mostra a fila com miniatura e status de cada foto.
function renderFila() {
  const cont = $("#lote-fila");
  if (filaLote.length === 0) { cont.innerHTML = ""; $("#lote-resumo").textContent = ""; return; }
  const txt = { fila: "⏳ na fila", processando: "🔎 identificando…", pronto: "✓ pronto", erro: "❌ erro" };
  cont.innerHTML = filaLote
    .map((it) => `
      <div class="cartao-vinho">
        <img src="${it.dataURL}" alt="">
        <div>
          <div class="nome">${esc(it.nome) || "(identificando…)"}</div>
          <div class="meta">${txt[it.status]}${it.erro ? " · " + esc(it.erro) : ""}</div>
        </div>
      </div>`)
    .join("");
  const prontos = filaLote.filter((i) => i.status === "pronto").length;
  $("#lote-resumo").textContent =
    `${prontos}/${filaLote.length} identificados. Revise na tela Início (marcados como rascunho).`;
}

// Processa a fila, uma foto de cada vez, em modo RÁPIDO (sem busca web).
async function processarFila() {
  if (loteRodando) return;
  loteRodando = true;
  const provedor = (await DB.lerConfig("provedor")) || "anthropic";
  const apiKey = await DB.lerConfig("apiKey");
  const modelo = (await DB.lerConfig("modelo")) || "claude-sonnet-4-6";
  if (!apiKey) {
    $("#lote-resumo").textContent = "⚠️ Configure sua chave de API nos Ajustes.";
    loteRodando = false;
    return;
  }
  for (const item of filaLote) {
    if (item.status !== "fila") continue;
    item.status = "processando";
    renderFila();
    try {
      const res = await IA.extrair({
        provedor, apiKey, modelo, comBusca: false,
        texto: "Leia o rótulo desta foto.",
        fotoBase64: item.base64, fotoMime: item.mime,
      });
      const v = montarRascunho(res, item.dataURL);
      await DB.salvar(v);
      item.nome = v.nome || "(sem nome)";
      item.status = "pronto";
    } catch (err) {
      item.status = "erro";
      item.erro = err.message;
    }
    renderFila();
  }
  loteRodando = false;
}

// Transforma o resultado da IA num vinho-rascunho (com bons padrões).
function montarRascunho(res, dataURL) {
  return {
    id: gerarId(),
    rascunho: true,
    nome: res.nome || "", produtor: res.produtor || "", regiao: res.regiao || "",
    pais: res.pais || "", uvas: Array.isArray(res.uvas) ? res.uvas : [],
    safra: res.safra ?? null,
    tipo: res.tipo === "tinto" || res.tipo === "branco" ? res.tipo : "tinto",
    formato: "750ml", formatoOutro: "", quantidade: 1,
    preco: { min: null, max: null, moeda: "R$", origem: "vazio" },
    janelaInicio: null, janelaFim: null, janelaOrigem: "vazio", janelaBase: "",
    posicao: { porta: 1, nivel: "N1", posicaoNum: null, posicaoNota: "" },
    display: false, desejo: false, premiacoes: [], corpo: "", tempServico: "", taca: "", harmonizacao: "", notas: res.observacao || "",
    fotoDataURL: dataURL, editadoEm: new Date().toISOString(),
  };
}

// ===================================================================
//  TELA MAPA — adega virtual deslizável, com cada vaga nomeada
// ===================================================================
async function renderMapa() {
  const vinhos = await DB.todos();
  const cap = (await DB.lerConfig("capacidades")) || capacidadesPadrao();

  // Índices: garrafas por zona, e qual vinho ocupa cada vaga numerada.
  const zonaSoma = {};   // "P1-N1" -> nº de garrafas
  const slotVinho = {};  // "P1-N2-3" -> vinho
  for (const v of vinhos) {
    const p = v.posicao || {};
    if (!p.porta || !p.nivel) continue;
    const zkey = `P${p.porta}-${p.nivel}`;
    zonaSoma[zkey] = (zonaSoma[zkey] || 0) + (v.quantidade || 0);
    if (p.posicaoNum) slotVinho[`${zkey}-${p.posicaoNum}`] = v;
  }

  // Monta o painel de uma porta (com seus 5 níveis).
  const painelPorta = (p) => {
    let h = `<div class="mapa-porta tipo-${p.tipo}">
      <div class="mapa-porta-cab">Porta ${p.porta} · ${p.tipo}</div>`;
    for (const n of NIVEIS) {
      const zkey = `P${p.porta}-${n.nivel}`;
      const oc = zonaSoma[zkey] || 0;
      const c = cap[zkey] || 0;
      const capTxt = n.endereco === "caixa" ? `${oc} cx` : `${oc}/${c}`;
      h += `<div class="mapa-nivel">
        <div class="mapa-nivel-cab"><b>${n.nivel}</b> ${esc(n.nome)}
          <span class="mapa-cap">${capTxt}</span></div>`;

      if (n.endereco === "posicional") {
        // Vagas numeradas: cada uma é um "spot" com nome.
        h += `<div class="mapa-slots">`;
        for (let i = 1; i <= c; i++) {
          const v = slotVinho[`${zkey}-${i}`];
          h += `<button class="slot ${v ? "ocupado" : ""}" data-zona="${zkey}" data-pos="${i}">
            <span class="slot-num">${String(i).padStart(2, "0")}</span>
            <span class="slot-nome">${v ? esc(v.nome || "vinho") : "livre"}</span>
          </button>`;
        }
        h += `</div>`;
      } else {
        // Zona ou caixas: bloco único com barra de ocupação.
        const pct = c ? Math.min(100, Math.round((oc / c) * 100)) : 0;
        const cheia = c && oc > c;
        h += `<button class="mapa-zona ${cheia ? "cheia" : ""}" data-zona="${zkey}">
          <span class="mapa-barra"><span style="width:${pct}%"></span></span>
          <small>${n.endereco === "caixa" ? "caixas — toque para ver" : "toque para ver os vinhos"}${cheia ? " · ⚠️ lotada" : ""}</small>
        </button>`;
      }
      h += `</div>`;
    }
    return h + `</div>`;
  };

  $("#mapa-scroll").innerHTML = PORTAS.map(painelPorta).join("");
  $("#mapa-lista-titulo").textContent = "";
  $("#mapa-lista").innerHTML = `<p class="dica">Toque numa vaga ou zona para ver os vinhos que estão lá.</p>`;
}

// Lista os vinhos de um endereço (usada pelo 2D e pelo 3D).
async function mostrarVinhosDoEndereco(zona, pos) {
  const vinhos = (await DB.todos()).filter((v) => {
    const p = v.posicao || {};
    if (`P${p.porta}-${p.nivel}` !== zona) return false;
    return pos == null ? true : p.posicaoNum === pos;
  });
  const ender = pos == null ? zona : `${zona}-${String(pos).padStart(2, "0")}`;
  $("#mapa-lista-titulo").textContent = `📍 ${ender}`;
  if (!vinhos.length) {
    $("#mapa-lista").innerHTML = `<p class="vazio-msg">Vaga livre — nenhum vinho aqui ainda.</p>`;
    return;
  }
  $("#mapa-lista").innerHTML = vinhos
    .map((v) => `
      <div class="cartao-vinho" data-id="${v.id}">
        ${v.fotoDataURL ? `<img src="${v.fotoDataURL}" alt="">` : `<img alt="">`}
        <div>
          <div class="nome">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</div>
          <div class="meta">${esc(v.produtor) || "—"} · ${v.quantidade || 0}🍾</div>
        </div>
      </div>`)
    .join("");
}

// Toque numa vaga/zona (2D) → lista os vinhos.
$("#mapa-scroll").addEventListener("click", (e) => {
  const el = e.target.closest("[data-zona]");
  if (!el) return;
  mostrarVinhosDoEndereco(el.dataset.zona, el.dataset.pos ? Number(el.dataset.pos) : null);
});

// Abrir o detalhe ao tocar num vinho da lista do mapa.
$("#mapa-lista").addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  if (card) abrirDetalhe(card.dataset.id);
});

// Monta o "modelo" da adega (portas → níveis → vagas) para o 3D.
async function modeloMapa() {
  const vinhos = (await DB.todos()).filter((v) => !v.desejo); // desejos não ocupam a adega
  const cap = (await DB.lerConfig("capacidades")) || capacidadesPadrao();
  const zonaSoma = {}, slotVinho = {};
  for (const v of vinhos) {
    const p = v.posicao || {};
    if (!p.porta || !p.nivel) continue;
    const z = `P${p.porta}-${p.nivel}`;
    zonaSoma[z] = (zonaSoma[z] || 0) + (v.quantidade || 0);
    if (p.posicaoNum) slotVinho[`${z}-${p.posicaoNum}`] = v;
  }
  return PORTAS.map((p) => ({
    porta: p.porta,
    tipo: p.tipo,
    niveis: NIVEIS.map((n) => {
      const z = `P${p.porta}-${n.nivel}`;
      const c = cap[z] || 0;
      const slots = n.endereco === "posicional"
        ? Array.from({ length: c }, (_, i) => ({ pos: i + 1, vinho: slotVinho[`${z}-${i + 1}`] || null }))
        : [];
      return { nivel: n.nivel, nome: n.nome, endereco: n.endereco, cap: c, ocup: zonaSoma[z] || 0, slots };
    }),
  }));
}

// Constrói (ou reconstrói) a adega 3D.
async function renderMapa3D() {
  const modelo = await modeloMapa();
  Mapa3D.montar($("#mapa3d"), modelo, mostrarVinhosDoEndereco, 440);
  $("#mapa-lista-titulo").textContent = "";
  $("#mapa-lista").innerHTML = `<p class="dica">Arraste para girar · pinça/roda para zoom · toque numa garrafa ou zona.</p>`;
}

// Alterna entre 2D e 3D.
function setModoMapa(modo) {
  const tri = modo === "3d";
  $("#mapa-modo-2d").classList.toggle("ativo", !tri);
  $("#mapa-modo-3d").classList.toggle("ativo", tri);
  $("#mapa-scroll").classList.toggle("oculto", tri);
  $("#mapa3d").classList.toggle("oculto", !tri);
  $("#mapa-dica-2d").style.visibility = tri ? "hidden" : "visible";
  if (tri) { renderMapa3D(); } else { Mapa3D.desmontar(); }
}
$("#mapa-modo-2d").addEventListener("click", () => setModoMapa("2d"));
$("#mapa-modo-3d").addEventListener("click", () => setModoMapa("3d"));

// Abrir a aba Mapa sempre começa no 2D (leve), com o 3D a um toque.
$("#nav-mapa").addEventListener("click", () => { Mapa3D.desmontar(); setModoMapa("2d"); renderMapa(); });

// ————— Início de tudo —————
montarSelecaoPosicao();
$("[data-ir='tela-ajustes']").addEventListener("click", carregarAjustes);
renderInicio();
