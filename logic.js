/*
  logic.js — as REGRAS da adega. Nenhuma tela aqui, só "contas":
    1) Em que ESTADO de consumo um vinho está (guarda / ótima / beber já / passou).
    2) Quão URGENTE ele é (para a seção "Beber em breve").
    3) Que ZONA física a lógica sugere.
    4) Quais DIVERGÊNCIAS existem (ex.: branco numa porta de tinto).

  Tudo o que é "opinião ajustável" está nas constantes abaixo. Mexa aqui se
  quiser mudar o comportamento — sem precisar caçar pelo código.
*/

const ANO_ATUAL = new Date().getFullYear();

// ——— Constantes que você pode ajustar ———
const REGRAS = {
  // Quantos anos antes do FIM da janela já consideramos "beber já".
  ANOS_BEBER_JA: 3,
  // Efeito do formato na janela (magnum envelhece mais devagar → empurra para frente).
  // Somamos estes anos ao início e ao fim da janela informada.
  SHIFT_FORMATO: {
    "750ml": { inicio: 0, fim: 0 },
    magnum: { inicio: 2, fim: 4 },
    outro: { inicio: 0, fim: 0 },
  },
};

// ——— Mapa físico da adega (fabricante EDR) ———
// Porta 1 e 2 = TINTO; Porta 3 = BRANCO. Cada porta tem 5 níveis.
// "capacidadePadrao" é um ponto de partida — você ajusta nos Ajustes.
const NIVEIS = [
  { nivel: "N1", nome: "Painel de pinos", endereco: "zona", uso: "guarda" },
  { nivel: "N2", nome: "Expositor de rótulos", endereco: "posicional", uso: "vitrine" },
  { nivel: "N3", nome: "Garrafeiro aramado", endereco: "zona", uso: "guarda" },
  { nivel: "N4", nome: "Aramado p/ magnum", endereco: "posicional", uso: "magnum" },
  { nivel: "BASE", nome: "Área p/ caixas", endereco: "caixa", uso: "guarda_longa" },
];

const PORTAS = [
  { porta: 1, tipo: "tinto" },
  { porta: 2, tipo: "tinto" },
  { porta: 3, tipo: "branco" },
];

// Capacidades oficiais como ponto de partida: 145 tinto + 59 branco = 204.
// Distribuímos por zona de forma aproximada (ajuste real nos Ajustes).
function capacidadesPadrao() {
  const cap = {};
  for (const p of PORTAS) {
    const tinto = p.tipo === "tinto";
    // Soma por porta: tinto ~72/porta (×2 = 145), branco ~59.
    cap[`P${p.porta}-N1`] = tinto ? 40 : 30; // painel = maior volume
    cap[`P${p.porta}-N2`] = tinto ? 8 : 6; // vitrine = poucas, numeradas
    cap[`P${p.porta}-N3`] = tinto ? 18 : 17; // aramado
    cap[`P${p.porta}-N4`] = tinto ? 6 : 6; // magnums
    cap[`P${p.porta}-BASE`] = tinto ? 0 : 0; // caixas: você conta por nota
  }
  return cap;
}

// ——— 1) Janela efetiva (com efeito do formato) ———
function janelaEfetiva(vinho) {
  const s = REGRAS.SHIFT_FORMATO[vinho.formato] || REGRAS.SHIFT_FORMATO["750ml"];
  if (vinho.janelaInicio == null && vinho.janelaFim == null) return null;
  return {
    inicio: vinho.janelaInicio != null ? vinho.janelaInicio + s.inicio : null,
    fim: vinho.janelaFim != null ? vinho.janelaFim + s.fim : null,
  };
}

// ——— 2) Estado de consumo + urgência ———
// Estados: "sem_janela", "guarda", "otima", "beber_ja", "passou".
function avaliarConsumo(vinho) {
  const j = janelaEfetiva(vinho);
  if (!j || j.fim == null) {
    return { estado: "sem_janela", urgencia: -1, texto: "Janela não informada" };
  }
  const inicio = j.inicio != null ? j.inicio : j.fim; // se só temos o fim
  const limiteBeberJa = j.fim - REGRAS.ANOS_BEBER_JA;

  if (ANO_ATUAL < inicio) {
    return {
      estado: "guarda",
      urgencia: 0,
      texto: `Em guarda — abrir a partir de ~${inicio}`,
    };
  }
  if (ANO_ATUAL > j.fim) {
    return {
      estado: "passou",
      urgencia: 1000 + (ANO_ATUAL - j.fim), // quanto mais velho, mais urgente
      texto: `Passou do ponto (fim ~${j.fim}) — beber já`,
    };
  }
  if (ANO_ATUAL >= limiteBeberJa) {
    const restam = j.fim - ANO_ATUAL;
    return {
      estado: "beber_ja",
      urgencia: 500 + (REGRAS.ANOS_BEBER_JA - restam),
      texto: `Beber em breve — janela fecha ~${j.fim}`,
    };
  }
  return {
    estado: "otima",
    urgencia: 0,
    texto: `Na janela ótima — beber entre ~${inicio} e ~${j.fim}`,
  };
}

// ——— 3) Zona sugerida pela lógica de consumo ———
function sugerirZona(vinho) {
  const { estado } = avaliarConsumo(vinho);
  // Magnum tem nível físico próprio (N4), independentemente do estado.
  if (vinho.formato === "magnum") {
    return { nivel: "N4", motivo: "Magnum vai no aramado de garrafas grandes (N4)." };
  }
  if (vinho.display) {
    return { nivel: "N2", motivo: "Marcado como display — vai na vitrine (N2)." };
  }
  if (estado === "beber_ja" || estado === "passou") {
    return { nivel: "N2", motivo: "Para beber em breve — deixe à mão, na vitrine (N2)." };
  }
  if (estado === "otima") {
    return { nivel: "N3", motivo: "Pronto para beber — estoque acessível (aramado N3)." };
  }
  if (estado === "guarda") {
    return { nivel: "N1", motivo: "Em guarda — volume principal (painel N1)." };
  }
  return { nivel: "N3", motivo: "Sem janela definida — estoque (aramado N3)." };
}

// ——— 4) Divergências (apontar, não obrigar) ———
// Devolve uma lista de objetos { gravidade, texto }. gravidade: "alta" | "media".
function divergencias(vinho) {
  const lista = [];
  const pos = vinho.posicao || {};
  const { estado } = avaliarConsumo(vinho);

  // (a) TEMPERATURA — restrição rígida. Branco não pode em porta de tinto.
  if (pos.porta) {
    const portaInfo = PORTAS.find((p) => p.porta === Number(pos.porta));
    if (portaInfo && portaInfo.tipo !== vinho.tipo) {
      lista.push({
        gravidade: "alta",
        texto: `Temperatura: ${vinho.tipo} guardado em porta de ${portaInfo.tipo} (Porta ${pos.porta}).`,
      });
    }
  }
  // (b) Magnum fora do nível de magnums.
  if (vinho.formato === "magnum" && pos.nivel && pos.nivel !== "N4") {
    lista.push({
      gravidade: "media",
      texto: `Magnum fora do nível de magnums (está em ${pos.nivel}, sugerido N4).`,
    });
  }
  // (c) "Beber em breve" guardado numa zona de guarda.
  const zonasGuarda = ["N1", "N3", "BASE"];
  if (
    (estado === "beber_ja" || estado === "passou") &&
    pos.nivel &&
    zonasGuarda.includes(pos.nivel)
  ) {
    lista.push({
      gravidade: "media",
      texto: `Marcado para beber em breve, mas está em zona de guarda (${pos.nivel}). Mover para a vitrine (N2)?`,
    });
  }
  // (d) Em guarda ocupando a vitrine (de baixa gravidade).
  if (estado === "guarda" && pos.nivel === "N2") {
    lista.push({
      gravidade: "media",
      texto: `Em guarda ocupando a vitrine (N2). Liberar espaço movendo para N1/N3?`,
    });
  }
  return lista;
}

// ——— Apoio: monta o endereço legível a partir da posição ———
function formatarEndereco(pos) {
  if (!pos || !pos.porta) return "—";
  const nivelInfo = NIVEIS.find((n) => n.nivel === pos.nivel);
  if (!nivelInfo) return `P${pos.porta}`;
  if (nivelInfo.endereco === "posicional" && pos.posicaoNum) {
    const n = String(pos.posicaoNum).padStart(2, "0");
    return `P${pos.porta}-${pos.nivel}-${n}`;
  }
  if (nivelInfo.endereco === "caixa") return `P${pos.porta}-BASE (caixa)`;
  return `P${pos.porta}-${pos.nivel}`;
}
