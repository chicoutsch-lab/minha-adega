# Tarefa: enriquecer o catálogo ("deixar top")

Antes de tudo, **leia o `CLAUDE.md`** — todas as regras de honestidade valem aqui.
Esta é uma tarefa de pesquisa em massa sobre `dados/catalogo.json`. Mudança só de
dados → **NÃO precisa subir versão** (sw.js/app.js). Publique com `git push`.

## Princípios desta tarefa
- **Não invente.** Campo sem fonte confiável fica como está (ou vazio/`"estimativa"` honesto).
- **Não sobrescreva dado já preenchido** que o Francisco curou. Só preencha o que está FALTANDO.
- **Não preencha `safra` dos desejos** — desejo é lista de compra; a safra é definida quando ele compra.
- **Trabalhe em LOTES de ~15 vinhos. Faça `commit` + `push` ao fim de cada lote** (assim nada se perde se a sessão cair). Pode usar subagentes em paralelo por lote, mas valide os `id` antes de mesclar.
- Ao fim de cada **onda**, pare e dê um resumo curto (quantos preenchidos, quantos ficaram vazios e por quê) antes de seguir.

## Como achar o que falta
Carregue `dados/catalogo.json` (`vinhos[]`). Para cada onda, filtre os vinhos que
ainda não têm o campo. Repita até zerar.

---

## Onda A — uvas + produtor/região faltantes (FACTUAL → fonte)
Alvo: desejos sem `uvas` (≈34) ou sem `produtor`/`regiao` (≈5).
- Pesquise a casta/uva, o produtor e a região reais (site da bodega, Wine-Searcher, Vivino).
- Preencha `uvas` como lista, ex.: `["Malbec"]` ou `["Cabernet Franc","Malbec"]`.
- Preencha `produtor` e `regiao` se identificar com segurança.
- **Casos sabidamente ambíguos** (pode deixar incompleto, sem chutar): `Don`,
  `Vivo ou Muerto`, `Sapo de Outro Pozo`. "Carmelo Paty" = **Carmelo Patti** (produtor).

## Onda B — premiações / notas de críticos (FACTUAL → fonte ou vazio)
Alvo: vinhos com `premiacoes` vazio (44 da adega + 185 desejos).
- Pesquise notas REAIS de críticos para o vinho (e safra, quando houver):
  **James Suckling, Wine Advocate (Robert Parker), Vinous (Antonio Galloni),
  Decanter, Wine Spectator, Tim Atkin** (ótimo p/ Argentina/Chile), **Descorchados**.
- Formato: `"premiacoes": [{"critico":"James Suckling","pontos":94}]` (uma entrada por crítico).
- **Se não achar nota real, deixe `[]`.** Vinho de entrada/sem cobertura crítica
  normalmente não tem nota — isso é esperado e honesto. NÃO invente pontuação.

## Onda C — janela de consumo dos desejos (ESTIMATIVA, marcada)
Alvo: desejos sem `janelaInicio`/`janelaFim`. Campos planos:
`janelaInicio` (ano), `janelaFim` (ano), `janelaOrigem` (`"fonte"`|`"estimativa"`),
`janelaBase` (texto curto).
- **Sempre uma FAIXA de anos**, nunca data exata. Para garrafa padrão 750ml.
- Se achar janela publicada por crítico/produtor → `janelaOrigem:"fonte"` e cite em `janelaBase`.
- Senão (o normal) → `janelaOrigem:"estimativa"` e explique em `janelaBase` pelo
  estilo: uva, região, faixa de qualidade e potencial de guarda. Ex.: branco jovem
  Assyrtiko → beber em 1–4 anos; Malbec ícone de Mendoza → guarda de 10+ anos.
- Como o desejo não tem safra, assuma a **safra atual/recente** e diga isso no `janelaBase`.

---

## Ordem sugerida
A (rápida, factual) → B (factual, ~230) → C (estimativa, 185). Lotes de ~15,
commit por lote, resumo por onda. Pergunte ao Francisco antes de pular de onda se
quiser confirmar o rumo.
