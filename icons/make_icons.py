"""
Gera os ícones do app (uma taça de vinho simples sobre fundo vinho).
Roda uma vez: python3 make_icons.py
Não faz parte do app em si — é só uma ferramenta de apoio.
"""
from PIL import Image, ImageDraw

VINHO = (91, 26, 46)      # fundo (bordô)
CREME = (243, 233, 210)   # taça
LIQUIDO = (140, 30, 50)   # vinho dentro da taça


def desenha(tamanho: int) -> Image.Image:
    img = Image.new("RGB", (tamanho, tamanho), VINHO)
    d = ImageDraw.Draw(img)
    cx = tamanho / 2          # centro horizontal
    u = tamanho / 100.0       # 1 "unidade" = 1% do tamanho (deixa o desenho proporcional)

    # Bojo da taça (um copo levemente cônico)
    topo_y, fundo_y = 22 * u, 52 * u
    larg_topo, larg_fundo = 26 * u, 16 * u
    d.polygon([
        (cx - larg_topo, topo_y), (cx + larg_topo, topo_y),
        (cx + larg_fundo, fundo_y), (cx - larg_fundo, fundo_y),
    ], fill=CREME)
    # Vinho dentro (preenche a parte de baixo do bojo)
    nivel = 34 * u
    larg_nivel = larg_topo - (larg_topo - larg_fundo) * ((nivel - topo_y) / (fundo_y - topo_y))
    d.polygon([
        (cx - larg_nivel, nivel), (cx + larg_nivel, nivel),
        (cx + larg_fundo, fundo_y), (cx - larg_fundo, fundo_y),
    ], fill=LIQUIDO)
    # Haste
    d.rectangle([cx - 1.6 * u, fundo_y, cx + 1.6 * u, 74 * u], fill=CREME)
    # Base
    d.polygon([
        (cx - 16 * u, 80 * u), (cx + 16 * u, 80 * u),
        (cx + 12 * u, 74 * u), (cx - 12 * u, 74 * u),
    ], fill=CREME)
    return img


for n in (180, 192, 512):
    desenha(n).save(f"icon-{n}.png")
# Versão "maskable" (com margem extra, para o iOS recortar sem cortar a taça)
base = desenha(512)
masc = Image.new("RGB", (512, 512), VINHO)
menor = base.resize((360, 360))
masc.paste(menor, (76, 76))
masc.save("icon-512-maskable.png")
print("ícones gerados:", "180, 192, 512, 512-maskable")
