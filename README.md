# Minha Adega — PWA

Catálogo e gestão da adega pessoal. Funciona no iPhone (Safari) instalado na
tela inicial. Dados ficam **no aparelho** (IndexedDB). Sem nuvem no v1.

## O que cada arquivo faz
- `index.html` — a estrutura das telas (o esqueleto).
- `styles.css` — a aparência.
- `db.js` — guarda os vinhos no aparelho (IndexedDB).
- `logic.js` — as regras: estado de consumo, zona sugerida, divergências.
- `ai.js` — fala com a IA (Anthropic/OpenAI) com busca web.
- `app.js` — junta tudo: navegação, formulário, detalhe, ajustes.
- `sw.js` + `manifest.webmanifest` — o que transforma o site em "app" instalável.
- `icons/` — ícones (e `make_icons.py`, a ferramenta que os gerou).

## Como testar no Mac (rápido)
Dentro da pasta `adega`, abra o Terminal e rode:

```
python3 -m http.server 8753
```

Depois abra no navegador: `http://localhost:8753`
(É preciso um servidor — abrir o arquivo direto com `file://` não deixa o
banco de dados e a câmera funcionarem.)

## Como instalar no iPhone
O iPhone precisa **alcançar** o app por uma URL. Duas opções:

1. **Mesma rede (teste):** rode o comando acima no Mac e, no iPhone (na mesma
   rede Wi‑Fi), acesse `http://IP-DO-MAC:8753`. A foto do rótulo e o catálogo
   funcionam; o modo offline (sem internet) só funciona em HTTPS.

2. **Recomendado para uso diário — HTTPS grátis:** suba a pasta no GitHub Pages
   (ou Netlify). Aí você terá um endereço `https://…` que funciona offline e
   instala redondo. (Posso te guiar nesse passo quando quiser.)

No Safari do iPhone: botão **Compartilhar → "Adicionar à Tela de Início"**.

## Primeiros passos no app
1. Toque em **⚙️ Ajustes** → cole sua **chave de API** e salve.
   - Anthropic (padrão): modelo `claude-opus-4-8`.
   - A chave fica só no seu aparelho.
2. Ajuste as **capacidades das zonas** se quiser (vêm com os valores EDR).
3. **➕ Adicionar:** tire a foto do rótulo ou digite, toque em **✨ Buscar dados
   (IA)**, revise tudo (você é o curador) e salve.

## Backup
**Ajustes → Exportar** gera um arquivo `.json` com todo o catálogo.
**Importar** restaura a partir desse arquivo (substitui o catálogo atual).

## Calibrar as regras
Quase tudo que é "opinião" está no topo de `logic.js` (constante `REGRAS`):
quantos anos antes do fim conta como "beber em breve", e quanto o magnum
empurra a janela. Mude ali sem caçar pelo resto do código.
