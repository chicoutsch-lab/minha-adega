/*
  Service worker = um "ajudante" que o navegador guarda no aparelho.
  Função aqui: guardar os arquivos do app (HTML, CSS, JS, ícones) para que
  ele abra mesmo sem internet. NÃO guarda seus vinhos — esses ficam no
  banco de dados (IndexedDB). A chamada da IA sempre exige internet.

  Sempre que você ALTERAR o código do app, suba o número da versão abaixo
  (CACHE) para o aparelho buscar os arquivos novos.
*/
const CACHE = "adega-v20";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  "./db.js",
  "./logic.js",
  "./ai.js",
  "./vendor/three.min.js",
  "./mapa3d.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Ao instalar: baixa e guarda os arquivos da lista.
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

// Ao ativar: apaga caches de versões antigas.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Ao pedir um arquivo: tenta o cache primeiro; se não houver, busca na rede.
// As chamadas para as APIs de IA (api.anthropic.com / api.openai.com) NUNCA
// passam pelo cache — vão sempre direto para a rede.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.hostname.endsWith("anthropic.com") || url.hostname.endsWith("openai.com")) {
    return; // deixa o navegador tratar normalmente (sempre rede)
  }
  e.respondWith(
    caches.match(e.request).then((resp) => resp || fetch(e.request))
  );
});
