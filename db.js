/*
  db.js — guarda os dados no próprio aparelho usando IndexedDB.

  IndexedDB é um banco de dados que vive dentro do navegador. Ele é "verboso"
  (precisa de várias linhas), então embrulhamos tudo aqui em funções simples:
    - DB.todos()        → devolve a lista de vinhos
    - DB.salvar(vinho)  → cria ou atualiza um vinho
    - DB.remover(id)    → apaga um vinho
    - DB.lerConfig()/DB.salvarConfig() → guarda Ajustes (chave de API, capacidades)
  Tudo devolve "Promise" (uma promessa de resultado), por isso usamos "await".
*/

const DB = (() => {
  const NOME = "adega";
  const VERSAO = 1;
  let bancoPromise = null;

  // Abre (ou cria) o banco. As "object stores" são como tabelas.
  function abrir() {
    if (bancoPromise) return bancoPromise;
    bancoPromise = new Promise((ok, erro) => {
      const req = indexedDB.open(NOME, VERSAO);
      // "onupgradeneeded" roda na primeira vez (ou quando a VERSAO muda):
      // é onde criamos as tabelas.
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("vinhos")) {
          db.createObjectStore("vinhos", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "chave" });
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
    return bancoPromise;
  }

  // Função interna que executa uma operação numa tabela.
  async function tx(tabela, modo, fn) {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction(tabela, modo);
      const store = t.objectStore(tabela);
      const req = fn(store);
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => erro(t.error);
    });
  }

  return {
    todos: () => tx("vinhos", "readonly", (s) => s.getAll()),
    salvar: (vinho) => tx("vinhos", "readwrite", (s) => s.put(vinho)),
    remover: (id) => tx("vinhos", "readwrite", (s) => s.delete(id)),

    // Config é guardada como pares { chave, valor }.
    async lerConfig(chave, padrao = null) {
      const r = await tx("config", "readonly", (s) => s.get(chave));
      return r ? r.valor : padrao;
    },
    salvarConfig: (chave, valor) =>
      tx("config", "readwrite", (s) => s.put({ chave, valor })),

    // Usado pela função IMPORTAR: troca todo o catálogo de uma vez.
    async substituirTudo(vinhos) {
      const db = await abrir();
      return new Promise((ok, erro) => {
        const t = db.transaction("vinhos", "readwrite");
        const s = t.objectStore("vinhos");
        s.clear();
        for (const v of vinhos) s.put(v);
        t.oncomplete = () => ok(true);
        t.onerror = () => erro(t.error);
      });
    },
  };
})();
