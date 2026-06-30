# Instruções para o Claude Code — "Minha Adega"

Este arquivo é o **manual de bordo** para qualquer sessão de Claude Code que
trabalhe neste repositório (no Mac, na web em `claude.ai/code`, ou pelo app
Claude no celular em **Código**). Leia-o inteiro antes de mexer em qualquer coisa.
A ideia é que uma sessão nova se comporte igual à sessão original do Francisco —
principalmente quanto à **honestidade dos dados**.

O Francisco é iniciante em programação. Fale em **português, sem jargão**,
**explique o plano antes de codar** e comente o código em português.

## O que é este projeto
PWA (site instalável) de catálogo da adega pessoal do Francisco. HTML/CSS/JS
puro, sem framework nem build. Publicado no **GitHub Pages**
(`https://chicoutsch-lab.github.io/minha-adega/`). O catálogo fica em
`dados/catalogo.json` (público). Estrutura de arquivos: ver `README.md`.

## ⛔ REGRA DE OURO — HONESTIDADE (inegociável)
1. **Só dado real.** Nunca invente preço, safra, nota, janela ou qualquer campo.
2. **Todo preço marca a origem do dado** no campo `origem`:
   - `"fonte"` → preço **real de uma loja**. **OBRIGATÓRIO** citar a loja (e o
     valor) no campo `base`. Não existe `"fonte"` sem `base` — isso é um "órfão"
     e é proibido.
   - `"estimativa"` → deduzido (por categoria, região, safra vizinha). Explique
     o raciocínio no `base`.
   - `"vazio"` → não encontrado. Use `min`/`max`/`brlAprox` = `null` e diga no
     `base` por que não achou. Melhor vazio honesto do que número inventado.
3. **O Francisco é o curador final.** O conhecimento de mercado dele vale mais
   que a pesquisa do robô. **Não altere dado já curado** (produtor, safra, preço
   que ele revisou) sem deixar claro o que mudou e por quê — de preferência,
   pergunte antes.
4. **Gate humano:** nenhuma mudança visual/de código é "ok" antes do Francisco
   abrir no iPhone e ver funcionando.

## Modelo de dados (cada vinho em `dados/catalogo.json` → `vinhos[]`)
Campos principais: `id`, `nome`, `produtor`, `regiao`, `pais`, `uvas[]`, `safra`,
`tipo` (tinto/branco), `corpo`, `quantidade`, `desejo` (true = lista de desejos,
fora da adega), `posicao{porta,nivel,...}`, `fotoDataURL`.

**Preço no Brasil** — objeto `preco`:
```json
{ "min": 0, "max": 0, "moeda": "R$", "origem": "fonte|estimativa|vazio",
  "base": "loja(s) + valor que sustentam o número" }
```
**Preço na origem** — objeto `precoOrigem`:
```json
{ "min": 0, "max": 0, "moeda": "€|US$", "pais": "...", "brlAprox": 0,
  "origem": "fonte|estimativa|vazio",
  "base": "loja(s) + valor", "atualizadoEm": "AAAA-MM-DD" }
```
Ao editar um preço, é boa prática guardar o anterior em `precoAnterior` e marcar
`precoAtualizadoEm`/`editadoEm` (data ISO).

## Como pesquisar um preço (o passo a passo que usamos)
1. Procure o preço **de prateleira real** em loja online e cite a loja no `base`.
   - **Brasil:** Mistral, World Wine, Wine.com.br, Grand Cru, Evino, Zahil,
     Casa Santa Luzia, Mercado Livre. (Descarte preços absurdos/cache/safra errada.)
   - **Argentina:** Espaciovino, Vinoteca Ligier, Vinos La Barrica, Celler,
     Frappe, Enotek, MercadoLibre AR. O **peso é volátil → cote em US$**
     (converta ARS a ~1.250/US$).
   - **Europa:** lojas do país + Wine-Searcher filtrado pelo país. Cote em €.
2. **Câmbio para `brlAprox`:** US$1 ≈ R$5,6 · €1 ≈ R$6,4. Calcule sobre o ponto
   médio da faixa.
3. **Confira a safra.** Em vinhos ícone (ex.: Barca-Velha) o ano muda o preço
   drasticamente — não misture safras.
4. Se achou loja real → `"fonte"` (cite). Se só achou referência vaga/Wine-Searcher
   sem loja → `"estimativa"` (explique). Se nada → `"vazio"`.
5. Para muitos vinhos de uma vez, vale disparar **subagentes em paralelo**, um
   lote por país, cada um devolvendo JSON com `id` + `precoOrigem`. **Valide
   sempre os `id` contra o catálogo antes de mesclar** (um `id` errado descarta o
   vinho em silêncio).

## Como publicar
- O site é **estático** no GitHub Pages. Publicar = `git commit` + `git push`
  na branch `main`. O `dados/catalogo.json` é tratado como **rede-sempre** pelo
  Service Worker, então mudança só de dados aparece ao "Carregar catálogo
  publicado" no app.
- **Mudança SÓ de dados** (`catalogo.json`): NÃO precisa mexer em versão.
- **Mudança de CÓDIGO** (html/css/js): suba JUNTOS o `CACHE` em `sw.js` (ex.:
  `adega-v35`) **e** o `APP_VERSION` em `app.js` — têm que bater. O rodapé dos
  Ajustes mostra a versão pra conferir no iPhone.
- **Assinatura dos commits** (mantenha o padrão):
  ```
  git -c user.name="Francisco Utsch" -c user.email="chicoutsch@gmail.com" \
    commit -m "mensagem curta" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
  ```

## O que uma sessão na NUVEM (celular/web) NÃO consegue
- **Adicionar fotos de rótulo.** As fotos vêm de arquivos locais no Mac do
  Francisco (`~/Downloads`) ou da câmera do app. Uma sessão na nuvem não enxerga
  isso — **não mexa em `fotoDataURL`** e não tente "buscar" foto.
- Pesquisa de **preço** (texto + web) funciona 100% na nuvem. É o caso de uso
  ideal pra disparar do celular.

## Verificação
- Não há build. Confira a sintaxe do JS antes de publicar (ex.: `node --check`).
- O catálogo é grande (~5 MB) — ao mexer, use scripts (Python/JS) em vez de
  edição manual gigante, e valide que o JSON continua válido.

## Regras "de opinião" (calibráveis)
Quase tudo que é julgamento (quando um vinho está "para beber em breve", quanto
um magnum adia a janela, limites de capacidade das zonas) está na constante
`REGRAS` no topo de `logic.js`. Mude ali, não espalhado pelo código.
