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
//  TELA INÍCIO — alertas + lista
// ===================================================================
async function renderInicio() {
  const vinhos = await DB.todos();
  $("#contador").textContent = `${vinhos.length} vinho(s)`;

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

  const filtrados = vinhos.filter((v) => {
    const c = avaliarConsumo(v);
    if (fe && c.estado !== fe) return false;
    if (ft && v.tipo !== ft) return false;
    if (fp && String(v.posicao?.porta) !== fp) return false;
    if (termo) {
      const txt = [v.nome, v.produtor, (v.uvas || []).join(" "), v.regiao]
        .join(" ").toLowerCase();
      if (!txt.includes(termo)) return false;
    }
    return true;
  });

  const lista = $("#lista");
  if (filtrados.length === 0) {
    lista.innerHTML = `<p class="vazio-msg">Nenhum vinho aqui ainda. Toque em ➕ Adicionar.</p>`;
    return;
  }
  lista.innerHTML = filtrados
    .map((v) => {
      const c = avaliarConsumo(v);
      const foto = v.fotoDataURL ? `<img src="${v.fotoDataURL}" alt="">` : `<img alt="">`;
      return `
      <div class="cartao-vinho" data-id="${v.id}">
        ${foto}
        <div>
          <div class="nome">${esc(v.nome) || "(sem nome)"} ${v.safra || ""}</div>
          <div class="meta">${esc(v.produtor) || "—"} · ${formatarEndereco(v.posicao)}</div>
          <span class="tag ${c.estado}">${rotuloEstado(c.estado)}</span>
          ${v.display ? '<span class="tag otima">★ display</span>' : ""}
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

["#busca", "#filtro-estado", "#filtro-tipo", "#filtro-porta"].forEach((s) =>
  $(s).addEventListener("input", async () => aplicarFiltros(await DB.todos()))
);

// ===================================================================
//  TELA FORMULÁRIO — adicionar / editar
// ===================================================================
function abrirFormNovo() {
  $("#form").reset();
  $("#f-id").value = "";
  $("#form-titulo").textContent = "Novo vinho";
  $("#btn-excluir").classList.add("oculto");
  fotoAtual = { dataURL: "", base64: "", mime: "" };
  $("#f-foto-preview").removeAttribute("src");
  $("#ia-status").textContent = "";
  atualizarCamposCondicionais();
  atualizarZonaEDivergencias();
  irPara("tela-form");
}

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
  $("#f-porta").value = v.posicao?.porta || 1;
  $("#f-nivel").value = v.posicao?.nivel || "N1";
  $("#f-posicao-num").value = v.posicao?.posicaoNum ?? "";
  $("#f-posicao-nota").value = v.posicao?.posicaoNota || "";
  $("#f-display").checked = !!v.display;
  $("#f-notas").value = v.notas || "";
  fotoAtual = { dataURL: v.fotoDataURL || "", base64: "", mime: "" };
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
    posicao: {
      porta: Number($("#f-porta").value),
      nivel: $("#f-nivel").value,
      posicaoNum: num("#f-posicao-num"),
      posicaoNota: $("#f-posicao-nota").value.trim(),
    },
    display: $("#f-display").checked,
    notas: $("#f-notas").value.trim(),
    fotoDataURL: fotoAtual.dataURL,
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
  const modelo = (await DB.lerConfig("modelo")) || "claude-opus-4-8";
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
  }
  if (res.observacao) $("#f-notas").value = res.observacao;
  atualizarCamposCondicionais();
  atualizarZonaEDivergencias();
}

// —— Salvar ——
$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = lerForm();
  if (!v.nome && !v.produtor) {
    alert("Dê pelo menos um nome ou produtor ao vinho.");
    return;
  }
  await DB.salvar(v);
  irPara("tela-inicio");
});

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
      ${v.display ? '<span class="tag otima">★ display</span>' : ""}
      <p class="dica" style="margin-top:.4rem">${esc(c.texto)}</p>
    </div>
    <div class="cartao">
      ${linha("Produtor", esc(v.produtor) || "—")}
      ${linha("Região / País", `${esc(v.regiao) || "—"} · ${esc(v.pais) || "—"}`)}
      ${linha("Uvas", esc((v.uvas || []).join(", ")) || "—")}
      ${linha("Tipo / formato", `${v.tipo} · ${v.formato}${v.formato === "outro" ? " (" + esc(v.formatoOutro) + ")" : ""}`)}
      ${linha("Garrafas", v.quantidade ?? 0)}
      ${linha("Preço", precoTexto(v.preco))}
      ${linha("Janela", janelaTexto(v))}
      ${linha("Posição", `${formatarEndereco(v.posicao)}${v.posicao?.posicaoNota ? " · " + esc(v.posicao.posicaoNota) : ""}`)}
      ${v.notas ? linha("Notas", esc(v.notas)) : ""}
    </div>
    <div class="zona-sugerida">💡 Zona sugerida: <b>${sug.nivel}</b> — ${esc(sug.motivo)}</div>
    <div class="divergencias">
      ${divs.map((d) => `<div class="diverg ${d.gravidade}">⚠️ ${esc(d.texto)}</div>`).join("")}
    </div>
    <div class="acoes">
      <button class="btn-principal" id="det-bebi">🍷 Bebi uma (-1)</button>
      <button class="btn-secundario" id="det-editar">✏️ Editar</button>
    </div>`;

  $("#det-bebi").onclick = async () => {
    v.quantidade = Math.max(0, (v.quantidade || 0) - 1);
    await DB.salvar(v);
    abrirDetalhe(id);
  };
  $("#det-editar").onclick = () => abrirFormEdicao(id);
  irPara("tela-detalhe");
}

// Textos de apoio para o detalhe.
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
  $("#cfg-modelo").value = (await DB.lerConfig("modelo")) || "claude-opus-4-8";

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
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `adega-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

// ————— Início de tudo —————
montarSelecaoPosicao();
$("[data-ir='tela-ajustes']").addEventListener("click", carregarAjustes);
renderInicio();
