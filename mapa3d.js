/*
  mapa3d.js — a adega em 3D (você gira com o dedo, dá zoom e toca numa garrafa).

  Usa o Three.js (motor de gráficos 3D que roda no próprio Safari), guardado em
  vendor/three.min.js. Tudo do 3D vive aqui, isolado do resto do app.

  Entrada: um "modelo" da adega (montado pelo app.js) com as portas, os níveis,
  as capacidades e quais vagas estão ocupadas. Saída: ao tocar numa vaga/zona,
  chamamos onSelect(zona, posicao) e o app mostra os vinhos daquele endereço.

  Não é foto-realista — é um modelo estilizado, navegável.
*/

const Mapa3D = (() => {
  let renderer, scene, camera, grupo, raf, container, onSelectCb, aoRedimensionar;
  let descartarControles;
  let temaClaro = false; // espelha o tema do app (claro/escuro) no momento de montar
  const clicaveis = []; // objetos que respondem ao toque

  // Cores por temperatura (mesmas do app): tinto = vinho, branco = âmbar.
  const corTipo = (tipo) => (tipo === "branco" ? 0xd9a33a : 0x8c1e32);

  // ——— Etiqueta de texto flutuante (desenhada num "quadro" e colada na cena) ———
  function etiqueta(texto, corTexto, largura) {
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = corTexto || "#f3e9d2";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(largura || 1.6, (largura || 1.6) / 4, 1);
    return sp;
  }

  // ——— Uma garrafa deitada (cilindro + gargalo), apontando para a frente ———
  function garrafa(cor, raio) {
    raio = raio || 0.12;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.45, metalness: 0.1 });
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, 0.9, 14), mat);
    corpo.rotation.x = Math.PI / 2; // eixo do cilindro vira para a profundidade (Z)
    g.add(corpo);
    const gargalo = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.45, raio * 0.45, 0.35, 10), mat);
    gargalo.rotation.x = Math.PI / 2;
    gargalo.position.z = 0.58;
    g.add(gargalo);
    return g;
  }

  // ——— Marca uma vaga vazia (contorno translúcido) ———
  function vagaVazia() {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.5, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x8a7a70, transparent: true, opacity: 0.22, wireframe: true })
    );
  }

  // ——— Uma caixa fechada (para a base) ———
  function caixa() {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 })
    );
  }

  // Adiciona uma "tábua"/painel ao grupo.
  function painel(x, y, z, lx, ly, lz, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lx, ly, lz), mat);
    m.position.set(x, y, z);
    grupo.add(m);
    return m;
  }

  // Registra um objeto como clicável, guardando o endereço nele.
  function marcar(obj, porta, nivel, pos, vinho) {
    obj.userData = {
      zona: `P${porta.porta}-${nivel.nivel}`,
      pos: pos || null,
      vinhoId: vinho ? vinho.id : null,
    };
    clicaveis.push(obj);
  }

  // ——— Constrói os 3 armários a partir do modelo ———
  function construir(modelo) {
    const Wc = 3.0, Dc = 1.5, gap = 0.5, Hc = 6.0, nShelves = 5, sh = Hc / nShelves;
    const total = modelo.length * Wc + (modelo.length - 1) * gap;
    // Moldura: vinho-escuro no tema escuro; madeira clara (carvalho) no claro.
    const matFrame = new THREE.MeshStandardMaterial({ color: temaClaro ? 0xb59e86 : 0x3a1722, roughness: 0.85, metalness: 0.15 });

    modelo.forEach((porta, pi) => {
      const x0 = -total / 2 + pi * (Wc + gap) + Wc / 2; // centro deste armário
      // Estrutura: fundo, laterais, topo e base.
      painel(x0, Hc / 2, -Dc / 2, Wc, Hc, 0.08, matFrame);
      painel(x0 - Wc / 2, Hc / 2, 0, 0.08, Hc, Dc, matFrame);
      painel(x0 + Wc / 2, Hc / 2, 0, 0.08, Hc, Dc, matFrame);
      painel(x0, Hc, 0, Wc, 0.08, Dc, matFrame);
      painel(x0, 0, 0, Wc, 0.08, Dc, matFrame);
      // Faixa colorida no topo (mostra a temperatura) + nome da porta.
      painel(x0, Hc + 0.1, 0, Wc, 0.14, Dc, new THREE.MeshStandardMaterial({ color: corTipo(porta.tipo) }));
      const rotPorta = etiqueta(`Porta ${porta.porta}`, porta.tipo === "branco" ? "#f4d59a" : "#f0b9c2", 2.0);
      rotPorta.position.set(x0, Hc + 0.7, 0.2);
      grupo.add(rotPorta);

      // Níveis: N1 no topo → BASE embaixo.
      porta.niveis.forEach((nivel, ni) => {
        const yTopo = Hc - ni * sh;
        const yCentro = yTopo - sh / 2;
        painel(x0, yTopo - sh, 0, Wc, 0.05, Dc, matFrame); // tábua da prateleira
        const rn = etiqueta(nivel.nivel, "#c9b6a8", 0.9);
        rn.position.set(x0 - Wc / 2 - 0.45, yCentro, Dc / 2);
        grupo.add(rn);
        preencherNivel(porta, nivel, x0, yCentro, Wc, Dc, sh);
      });
    });
  }

  // Coloca garrafas/vagas/caixas em um nível.
  function preencherNivel(porta, nivel, x0, yCentro, Wc, Dc, sh) {
    const cor = corTipo(porta.tipo);

    if (nivel.endereco === "posicional") {
      // Cada vaga numerada é um "local" próprio e clicável.
      const N = nivel.cap || 0;
      for (let i = 0; i < N; i++) {
        const x = x0 - Wc / 2 + (Wc / N) * (i + 0.5);
        const slot = nivel.slots[i];
        const obj = slot && slot.vinho ? garrafa(cor) : vagaVazia();
        obj.position.set(x, yCentro, 0.15);
        marcar(obj, porta, nivel, i + 1, slot ? slot.vinho : null);
        grupo.add(obj);
      }
    } else if (nivel.endereco === "zona") {
      // Bloco por zona: garrafas representativas + uma "placa" clicável cobrindo o nível.
      const mostrar = Math.min(nivel.ocup, 21);
      const cols = 7;
      for (let k = 0; k < mostrar; k++) {
        const c = k % cols, r = Math.floor(k / cols);
        const x = x0 - Wc / 2 + (Wc / cols) * (c + 0.5);
        const b = garrafa(cor, 0.085);
        b.position.set(x, yCentro - 0.12, 0.35 - r * 0.34);
        grupo.add(b); // decorativa (a placa abaixo é que recebe o toque)
      }
      const placa = new THREE.Mesh(
        new THREE.BoxGeometry(Wc * 0.96, sh * 0.86, 0.04),
        new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.12 })
      );
      placa.position.set(x0, yCentro, 0.5);
      marcar(placa, porta, nivel, null, null);
      grupo.add(placa);
    } else {
      // Base: caixas + placa clicável.
      const n = Math.min(nivel.ocup || 0, 3);
      for (let i = 0; i < n; i++) {
        const cx = caixa();
        cx.position.set(x0 - 0.7 + i * 0.7, yCentro, 0);
        grupo.add(cx);
      }
      const placa = new THREE.Mesh(
        new THREE.BoxGeometry(Wc * 0.96, sh * 0.86, 0.04),
        new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.1 })
      );
      placa.position.set(x0, yCentro, 0.5);
      marcar(placa, porta, nivel, null, null);
      grupo.add(placa);
    }
  }

  // ——— Controles: arrastar para girar, pinça/roda para zoom, toque para selecionar ———
  function instalarControles() {
    const el = renderer.domElement;
    let arrastando = false, lastX = 0, lastY = 0, movido = 0, pinch = null;
    const limita = (v, a, b) => Math.max(a, Math.min(b, v));
    const xy = (e) => (e.touches && e.touches[0] ? e.touches[0] : e);

    const onDown = (e) => { arrastando = true; movido = 0; const p = xy(e); lastX = p.clientX; lastY = p.clientY; };
    const onMove = (e) => {
      if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        if (pinch != null) camera.position.z = limita(camera.position.z * (pinch / d), 6, 22);
        pinch = d;
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!arrastando) return;
      const p = xy(e);
      const dx = p.clientX - lastX, dy = p.clientY - lastY;
      lastX = p.clientX; lastY = p.clientY;
      movido += Math.abs(dx) + Math.abs(dy);
      grupo.rotation.y += dx * 0.008;
      grupo.rotation.x = limita(grupo.rotation.x + dy * 0.006, -0.6, 0.6);
      if (e.cancelable) e.preventDefault();
    };
    const onUp = (e) => { if (arrastando && movido < 7) selecionar(e); arrastando = false; pinch = null; };
    const onWheel = (e) => { camera.position.z = limita(camera.position.z + e.deltaY * 0.01, 6, 22); e.preventDefault(); };

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("touchstart", onDown, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    descartarControles = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }

  // Descobre o que foi tocado e avisa o app.
  function selecionar(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
    const ndc = new THREE.Vector2(
      ((t.clientX - rect.left) / rect.width) * 2 - 1,
      -((t.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(clicaveis, true);
    if (!hits.length) return;
    let o = hits[0].object;
    while (o && !(o.userData && o.userData.zona)) o = o.parent;
    if (o && o.userData.zona && onSelectCb) onSelectCb(o.userData.zona, o.userData.pos);
  }

  function animar() {
    raf = requestAnimationFrame(animar);
    if (document.hidden) return; // economiza bateria quando o app não está à vista
    renderer.render(scene, camera);
  }

  // ——— API pública ———
  function montar(cont, modelo, onSelect, alturaPx) {
    if (typeof THREE === "undefined") { cont.innerHTML = '<p class="vazio-msg">3D indisponível neste navegador.</p>'; return; }
    desmontar();
    container = cont; onSelectCb = onSelect; clicaveis.length = 0;
    temaClaro = document.documentElement.getAttribute("data-tema") === "claro";
    const w = cont.clientWidth || 360, h = alturaPx || 440;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0.6, 13);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    cont.innerHTML = "";
    cont.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, temaClaro ? 0.7 : 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(4, 9, 7);
    scene.add(dir);
    // Luz lateral de volume. No tema escuro é quente (clima de adega); no claro
    // fica quase neutra e suave, para não "avermelhar" a cena.
    const quente = new THREE.DirectionalLight(temaClaro ? 0xfff3e6 : 0xffd9a0, temaClaro ? 0.15 : 0.35);
    quente.position.set(-6, 3, 4);
    scene.add(quente);

    grupo = new THREE.Group();
    grupo.position.y = -3;       // centraliza a adega na vertical
    grupo.rotation.y = -0.7;     // vista 3/4: mais noção de profundidade
    grupo.rotation.x = 0.12;     // leve inclinação para cima
    scene.add(grupo);

    construir(modelo);
    instalarControles();
    animar();

    aoRedimensionar = () => {
      if (!renderer) return;
      const lw = cont.clientWidth || 360;
      camera.aspect = lw / h;
      camera.updateProjectionMatrix();
      renderer.setSize(lw, h);
    };
    window.addEventListener("resize", aoRedimensionar);
  }

  function desmontar() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (descartarControles) { descartarControles(); descartarControles = null; }
    if (aoRedimensionar) { window.removeEventListener("resize", aoRedimensionar); aoRedimensionar = null; }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      renderer = null;
    }
    scene = camera = grupo = null;
  }

  return { montar, desmontar };
})();
