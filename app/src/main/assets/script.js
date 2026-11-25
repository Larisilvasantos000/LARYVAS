// LARYVAS STORAGE v2 — IndexedDB
const LARYVAS_DB_NAME = "LARYVAS_DB";
const LARYVAS_DB_VERSION = 1;
let laryvasDb;

function abrirBancoLaryvas() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Este WebView não oferece IndexedDB."));
      return;
    }
    const request = indexedDB.open(LARYVAS_DB_NAME, LARYVAS_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("dados")) {
        db.createObjectStore("dados", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Falha ao abrir o banco."));
    request.onblocked = () => reject(new Error("Feche outras janelas da LARYVAS e tente novamente."));
  });
}

function lerBancoLaryvas() {
  return new Promise((resolve, reject) => {
    const tx = laryvasDb.transaction("dados", "readonly");
    const req = tx.objectStore("dados").get("biblioteca");
    req.onsuccess = () => resolve(req.result ? req.result.obras : null);
    req.onerror = () => reject(req.error || new Error("Falha ao ler a biblioteca."));
  });
}

function gravarBancoLaryvas(lista) {
  return new Promise((resolve, reject) => {
    const tx = laryvasDb.transaction("dados", "readwrite");
    tx.objectStore("dados").put({ id: "biblioteca", obras: lista, atualizadoEm: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Falha ao salvar a biblioteca."));
    tx.onabort = () => reject(tx.error || new Error("O salvamento foi cancelado."));
  });
}

function lerLixeiraLaryvas() {
  return new Promise((resolve, reject) => {
    const tx = laryvasDb.transaction("dados", "readonly");
    const req = tx.objectStore("dados").get("lixeira");
    req.onsuccess = () => resolve(req.result && Array.isArray(req.result.itens) ? req.result.itens : []);
    req.onerror = () => reject(req.error || new Error("Falha ao ler a lixeira."));
  });
}

function gravarLixeiraLaryvas(itens) {
  return new Promise((resolve, reject) => {
    const tx = laryvasDb.transaction("dados", "readwrite");
    tx.objectStore("dados").put({ id: "lixeira", itens, atualizadoEm: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Falha ao salvar a lixeira."));
    tx.onabort = () => reject(tx.error || new Error("Salvamento da lixeira cancelado."));
  });
}

function gravarBibliotecaELixeira(obrasLista, lixeiraLista) {
  return new Promise((resolve, reject) => {
    const tx = laryvasDb.transaction("dados", "readwrite");
    const store = tx.objectStore("dados");
    store.put({ id: "biblioteca", obras: obrasLista, atualizadoEm: new Date().toISOString() });
    store.put({ id: "lixeira", itens: lixeiraLista, atualizadoEm: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Falha ao atualizar biblioteca e lixeira."));
    tx.onabort = () => reject(tx.error || new Error("Atualização cancelada."));
  });
}

function normalizarObrasBackup(lista) {
  if (!Array.isArray(lista)) throw new Error("O arquivo não contém uma lista de obras.");
  return lista.map((item, indice) => {
    if (!item || typeof item !== "object" || typeof item.nome !== "string" || !item.nome.trim()) {
      throw new Error(`A obra ${indice + 1} não possui um nome válido.`);
    }
    let capa = item.capa || "";
    if (!capa && item.capaBase64) {
      capa = String(item.capaBase64);
      if (!capa.startsWith("data:image/")) capa = `data:image/jpeg;base64,${capa}`;
    }
    if (!capa && item.capaUrl) capa = item.capaUrl;
    const statusPermitidos = ["Quero ler", "Lendo", "Concluída", "Em espera"];
    const status = statusPermitidos.includes(item.status) ? item.status : "Quero ler";
    const favorito = item.favorita === true || item.favorita === "true" || item.favorita === "True" || item.favorita === 1;
    // Compatibilidade: transforma os campos antigos scan/link em uma lista de fontes.
    const fontesAntigas = Array.isArray(item.scans) ? item.scans : [];
    const fontes = fontesAntigas.map(f => ({ scan: String(f.scan || f.nome || "").trim(), link: String(f.link || "").trim() }))
      .filter(f => f.scan || f.link);
    if (!fontes.length && (item.scan || item.link)) {
      fontes.push({ scan: String(item.scan || "").trim(), link: String(item.link || "").trim() });
    }
    return {
      id: item.id ?? item.numero ?? `${Date.now()}-${indice}`,
      nome: item.nome.trim(),
      scan: item.scan || (fontes[0]?.scan ?? ""),
      link: item.link || (fontes[0]?.link ?? ""),
      scans: fontes,
      capa,
      status,
      capituloLido: Math.max(0, Number(item.capituloLido) || 0),
      totalCapitulos: Math.max(0, Number(item.totalCapitulos) || 0),
      favorita: favorito,
      categorias: Array.isArray(item.categorias) ? [...new Set(item.categorias.map(c => String(c).trim()).filter(Boolean))] : [],
      capitulosFavoritos: Array.isArray(item.capitulosFavoritos) ? [...new Set(item.capitulosFavoritos.map(v => String(v).trim()).filter(Boolean))] : [],
      atualizadoEm: item.atualizadoEm || item.criadoEm || null,
      excluidaEm: item.excluidaEm || null
    };
  });
}

function criarConteudoBackup() {
  return { formato: "LARYVAS_BACKUP", versao: 3, criadoEm: new Date().toISOString(), obras, lixeira };
}

async function inicializarArmazenamentoLaryvas() {
  laryvasDb = await abrirBancoLaryvas();
  const salvo = await lerBancoLaryvas();
  if (Array.isArray(salvo)) return normalizarObrasBackup(salvo);
  // Migração automática da versão antiga: mantém o registro antigo intacto.
  const legado = localStorage.getItem("laryvasObras");
  const migrado = legado ? normalizarObrasBackup(JSON.parse(legado)) : [];
  await gravarBancoLaryvas(migrado);
  return migrado;
}

(async function iniciarLaryvas() {
  let obrasIniciais;
  try {
    obrasIniciais = await inicializarArmazenamentoLaryvas();
  } catch (erro) {
    alert("Não foi possível abrir o novo armazenamento da LARYVAS: " + erro.message + "\\n\\nNenhum backup foi apagado.");
    console.error(erro);
    return;
  }

let obras = obrasIniciais;
let lixeira = [];
try { lixeira = await lerLixeiraLaryvas(); } catch (erro) { console.error("Não foi possível carregar a lixeira:", erro); }
const obrasSelecionadas = new Set();
function lerImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo) {
      resolve("");
      return;
    }

    const leitor = new FileReader();

    leitor.onload = () => {
      const imagem = new Image();

      imagem.onload = () => {
        const canvas = document.createElement("canvas");

        const limite = 600;
        let largura = imagem.width;
        let altura = imagem.height;

        if (largura > limite || altura > limite) {
          const proporcao = Math.min(
            limite / largura,
            limite / altura
          );

          largura *= proporcao;
          altura *= proporcao;
        }

        canvas.width = largura;
        canvas.height = altura;

        const contexto = canvas.getContext("2d");
        contexto.drawImage(imagem, 0, 0, largura, altura);

        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };

      imagem.onerror = reject;
      imagem.src = leitor.result;
    };

    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}


const botaoAdicionar = document.getElementById("adicionar-obra");
const listaObras = document.getElementById("lista-obras");
const pesquisa = document.getElementById("pesquisa");
let filtroStatus = "Todos";
let filtroCategoria = "Todas";
let ordenacaoObras = "padrao";

function listarCategorias() {
  return [...new Set(obras.flatMap(obra => Array.isArray(obra.categorias) ? obra.categorias : []))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function criarSeletorCategorias(obra = null) {
  const grupo = document.createElement("div");
  grupo.style.cssText = "margin:14px 0;";
  const rotulo = document.createElement("label");
  rotulo.textContent = "Categorias personalizadas";
  rotulo.style.cssText = "display:block;margin-bottom:8px;font-weight:bold;";
  const lista = document.createElement("div");
  lista.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;";
  const selecionadas = new Set(obra && Array.isArray(obra.categorias) ? obra.categorias : []);
  const categorias = listarCategorias();
  categorias.forEach(nome => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid #65517d;border-radius:18px;background:#29213c;";
    const check = document.createElement("input");
    check.type = "checkbox"; check.value = nome; check.checked = selecionadas.has(nome);
    check.addEventListener("change", () => check.checked ? selecionadas.add(nome) : selecionadas.delete(nome));
    label.append(check, document.createTextNode(nome)); lista.appendChild(label);
  });
  const nova = document.createElement("input");
  nova.type = "text"; nova.placeholder = "Nome da nova categoria";
  nova.style.cssText = "width:100%;box-sizing:border-box;padding:11px;border:1px solid #65517d;border-radius:9px;background:#29213c;color:white;";
  const adicionar = document.createElement("button");
  adicionar.type = "button"; adicionar.textContent = "+ Criar e adicionar categoria";
  adicionar.style.cssText = "width:100%;margin-top:8px;padding:10px;border:1px solid #9570d8;border-radius:9px;background:#393044;color:#c9a5ff;font-weight:bold;";
  adicionar.addEventListener("click", () => {
    const nome = nova.value.trim();
    if (!nome) { alert("Digite um nome para a categoria."); return; }
    const existente = [...selecionadas].find(c => c.toLocaleLowerCase() === nome.toLocaleLowerCase()) || listarCategorias().find(c => c.toLocaleLowerCase() === nome.toLocaleLowerCase());
    const finalNome = existente || nome;
    selecionadas.add(finalNome);
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:5px;padding:7px 10px;border:1px solid #9570d8;border-radius:18px;background:#393044;";
    const check = document.createElement("input"); check.type="checkbox"; check.checked=true; check.value=finalNome;
    check.addEventListener("change", () => check.checked ? selecionadas.add(finalNome) : selecionadas.delete(finalNome));
    label.append(check, document.createTextNode(finalNome));
    if (![...lista.children].some(el => el.textContent.trim() === finalNome)) lista.appendChild(label);
    nova.value = "";
  });
  grupo.append(rotulo, lista, nova, adicionar);
  return { elemento: grupo, obter: () => [...selecionadas] };
}

const painelEstatisticas = document.createElement("div");
painelEstatisticas.id = "painel-estatisticas";
const seletorColunas = document.createElement("select");

seletorColunas.innerHTML = `
  <option value="2">2 colunas</option>
  <option value="3" selected>3 colunas</option>
  <option value="4">4 colunas</option>
  <option value="5">5 colunas</option>
  <option value="6">6 colunas</option>
`;

seletorColunas.style.cssText = `
  width:100%;
  padding:12px;
  margin:10px 0;
  border:1px solid #65517d;
  border-radius:12px;
  background:#292432;
  color:white;
  font-size:15px;
`;

document.querySelector(".subtitulo").insertAdjacentElement(
  "afterend",
  seletorColunas
);
const colunasSalvas = localStorage.getItem("laryvasColunas") || "3";

seletorColunas.value = colunasSalvas;

listaObras.style.setProperty("--colunas-obras", colunasSalvas);

seletorColunas.addEventListener("change", () => {
  const quantidade = seletorColunas.value;

  listaObras.style.setProperty("--colunas-obras", quantidade);

  localStorage.setItem("laryvasColunas", quantidade);
});
painelEstatisticas.style.cssText = `
  display:grid;
  grid-template-columns:repeat(2, 1fr);
  gap:12px;
  margin:20px 0;
`;

document.querySelector(".subtitulo").insertAdjacentElement(
  "afterend",
  painelEstatisticas
);
const seletorStatus = document.createElement("select");

seletorStatus.innerHTML = `
  <option value="Todos">Todas as obras</option>
  <option value="Quero ler">Quero ler</option>
  <option value="Lendo">Lendo</option>
  <option value="Concluída">Concluídas</option>
  <option value="Em espera">Em espera</option>
  <option value="Favoritas">⭐ Favoritas</option>
`;

seletorStatus.style.cssText = `
  width:100%;
  padding:14px;
  margin-bottom:20px;
  border:1px solid #65517d;
  border-radius:12px;
  background:#292432;
  color:white;
  font-size:15px;
`;

pesquisa.insertAdjacentElement("afterend", seletorStatus);
const seletorCategoria = document.createElement("select");
seletorCategoria.style.cssText = seletorStatus.style.cssText;
seletorCategoria.innerHTML = '<option value="Todas">Todas as categorias</option>';
seletorStatus.insertAdjacentElement("afterend", seletorCategoria);
function atualizarSeletorCategorias() {
  const atual = filtroCategoria;
  seletorCategoria.innerHTML = '<option value="Todas">Todas as categorias</option>';
  listarCategorias().forEach(nome => {
    const op = document.createElement("option"); op.value = nome; op.textContent = nome; seletorCategoria.appendChild(op);
  });
  filtroCategoria = listarCategorias().includes(atual) ? atual : "Todas";
  seletorCategoria.value = filtroCategoria;
}
seletorCategoria.addEventListener("change", () => { filtroCategoria = seletorCategoria.value; mostrarObras(pesquisa.value); });
const botaoGerenciarCategorias = document.createElement("button");
botaoGerenciarCategorias.type = "button";
botaoGerenciarCategorias.textContent = "⚙️ Gerenciar categorias";
botaoGerenciarCategorias.style.cssText = "width:100%;margin:-10px 0 18px;padding:10px;border:1px solid #65517d;border-radius:10px;background:#29213c;color:#c9a5ff;font-weight:bold;";
seletorCategoria.insertAdjacentElement("afterend", botaoGerenciarCategorias);
botaoGerenciarCategorias.addEventListener("click", async () => {
  const categorias = listarCategorias();
  if (!categorias.length) { alert("Você ainda não criou categorias. Crie uma ao adicionar ou editar uma obra."); return; }
  const escolha = prompt("Digite exatamente o nome da categoria que deseja renomear ou excluir:\n\n" + categorias.join("\n"));
  if (escolha === null) return;
  const antiga = categorias.find(c => c.toLocaleLowerCase() === escolha.trim().toLocaleLowerCase());
  if (!antiga) { alert("Categoria não encontrada."); return; }
  const acao = prompt(`Categoria: ${antiga}\nDigite R para renomear ou E para excluir.`);
  if (!acao) return;
  const anterior = obras.map(o => ({ ...o, categorias: [...(o.categorias || [])] }));
  if (acao.trim().toUpperCase() === "R") {
    const nova = prompt("Novo nome da categoria:", antiga);
    if (!nova || !nova.trim()) return;
    const nomeNovo = nova.trim();
    if (categorias.some(c => c.toLocaleLowerCase() === nomeNovo.toLocaleLowerCase() && c !== antiga)) { alert("Já existe uma categoria com esse nome."); return; }
    obras.forEach(o => { o.categorias = (o.categorias || []).map(c => c === antiga ? nomeNovo : c); });
  } else if (acao.trim().toUpperCase() === "E") {
    if (!confirm(`Excluir a categoria \"${antiga}\"? As obras serão mantidas, apenas perderão essa categoria.`)) return;
    obras.forEach(o => { o.categorias = (o.categorias || []).filter(c => c !== antiga); });
  } else { alert("Opção inválida."); return; }
  try { await salvarObras(); filtroCategoria = "Todas"; mostrarObras(pesquisa.value); }
  catch { obras = anterior; }
});
// Busca ampliada e ordenação da biblioteca
const pesquisaAjuda = document.createElement("small");
pesquisaAjuda.textContent = "A busca considera título e nome das scans.";
pesquisaAjuda.style.cssText = "display:block;color:#aaa0b8;margin:-12px 2px 14px;font-size:11px;";
pesquisa.insertAdjacentElement("afterend", pesquisaAjuda);
const seletorOrdenacao = document.createElement("select");
seletorOrdenacao.style.cssText = seletorStatus.style.cssText;
seletorOrdenacao.innerHTML = '<option value="padrao">Ordenação padrão</option><option value="az">Nome: A–Z</option><option value="za">Nome: Z–A</option><option value="recentes">Adicionadas recentemente</option><option value="capitulos">Mais capítulos lidos</option><option value="favoritas">Favoritas primeiro</option>';
seletorCategoria.insertAdjacentElement("afterend", seletorOrdenacao);
seletorOrdenacao.addEventListener("change", () => { ordenacaoObras = seletorOrdenacao.value; mostrarObras(pesquisa.value); });

// Seleção em lote e lixeira
const painelAcoesLote = document.createElement("section");
painelAcoesLote.style.cssText = "margin:12px 0 18px;padding:12px;border:1px solid #65517d;border-radius:12px;background:#292432;";
const linhaSelecao = document.createElement("div");
linhaSelecao.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;";
const selecionarVisiveis = document.createElement("button");
selecionarVisiveis.type = "button"; selecionarVisiveis.textContent = "☑ Selecionar exibidas";
const limparSelecao = document.createElement("button");
limparSelecao.type = "button"; limparSelecao.textContent = "Limpar seleção";
[selecionarVisiveis, limparSelecao].forEach(b => { b.style.cssText = "flex:1;min-width:120px;padding:9px;border:1px solid #9570d8;border-radius:8px;background:#393044;color:white;"; });
const contadorSelecao = document.createElement("p");
contadorSelecao.style.cssText = "margin:9px 0;color:#c9a5ff;font-weight:bold;";
const acoesLote = document.createElement("div");
acoesLote.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";
function botaoLote(texto, cor="#393044") { const b=document.createElement("button"); b.type="button"; b.textContent=texto; b.style.cssText=`padding:10px;border:1px solid #9570d8;border-radius:8px;background:${cor};color:white;font-weight:bold;`; return b; }
const loteFavoritar = botaoLote("☆ Alternar favoritas");
const loteCategoria = botaoLote("＋ Categoria nas selecionadas");
const loteStatus = document.createElement("select");
loteStatus.innerHTML = '<option value="">Alterar status...</option><option>Quero ler</option><option>Lendo</option><option>Concluída</option><option>Em espera</option>';
loteStatus.style.cssText = "padding:10px;border:1px solid #9570d8;border-radius:8px;background:#29213c;color:white;";
const loteExcluir = botaoLote("Mover para lixeira", "#75435b");
const abrirLixeira = botaoLote(`🗑️ Lixeira (${lixeira.length})`);
linhaSelecao.append(selecionarVisiveis, limparSelecao);
acoesLote.append(loteFavoritar, loteStatus, loteCategoria, loteExcluir, abrirLixeira);
painelAcoesLote.append(linhaSelecao, contadorSelecao, acoesLote);
listaObras.insertAdjacentElement("beforebegin", painelAcoesLote);

function atualizarContadorSelecao() { contadorSelecao.textContent = `${obrasSelecionadas.size} obra(s) selecionada(s)`; }
function obraCorrespondeBusca(o, termo) {
  if (!termo) return true;
  const fontes = Array.isArray(o.scans) ? o.scans : [{ scan: o.scan || "", link: o.link || "" }];
  return [o.nome, ...fontes.map(f => f.scan || "")].some(v => String(v).toLocaleLowerCase("pt-BR").includes(termo));
}
function obrasVisiveis() { const termo = pesquisa.value.toLocaleLowerCase("pt-BR").trim(); return obras.filter(o => obraCorrespondeBusca(o, termo) && (filtroStatus === "Todos" || o.status === filtroStatus || (filtroStatus === "Favoritas" && o.favorita)) && (filtroCategoria === "Todas" || (o.categorias || []).includes(filtroCategoria))); }
selecionarVisiveis.addEventListener("click", () => { obrasVisiveis().forEach(o => obrasSelecionadas.add(String(o.id))); mostrarObras(pesquisa.value); });
limparSelecao.addEventListener("click", () => { obrasSelecionadas.clear(); mostrarObras(pesquisa.value); });
loteFavoritar.addEventListener("click", async () => { const ids=[...obrasSelecionadas]; if(!ids.length){alert("Selecione pelo menos uma obra.");return;} const antes=obras.map(o=>({...o})); const todosFavoritos = obras.filter(o=>ids.includes(String(o.id))).every(o=>o.favorita === true); obras.forEach(o=>{if(ids.includes(String(o.id))){o.favorita=!todosFavoritos;o.atualizadoEm=new Date().toISOString();}}); try{await salvarObras();obrasSelecionadas.clear();mostrarObras(pesquisa.value);}catch{obras=antes;} });
loteCategoria.addEventListener("click", async () => {
  const ids=[...obrasSelecionadas];
  if(!ids.length){alert("Selecione pelo menos uma obra.");return;}
  const nome=prompt("Digite o nome da categoria que deseja adicionar às obras selecionadas:");
  if(!nome || !nome.trim()) return;
  const categoria=nome.trim();
  const antes=obras.map(o=>({...o,categorias:[...(o.categorias||[])]}));
  obras.forEach(o=>{if(ids.includes(String(o.id)) && !(o.categorias||[]).some(c=>c.toLocaleLowerCase()===categoria.toLocaleLowerCase())){o.categorias=[...(o.categorias||[]),categoria];o.atualizadoEm=new Date().toISOString();}});
  try{await salvarObras();obrasSelecionadas.clear();mostrarObras(pesquisa.value);}catch{obras=antes;}
});
loteStatus.addEventListener("change", async () => { const status=loteStatus.value; const ids=[...obrasSelecionadas]; if(!status)return; if(!ids.length){alert("Selecione pelo menos uma obra.");loteStatus.value="";return;} const antes=obras.map(o=>({...o})); obras.forEach(o=>{if(ids.includes(String(o.id))){o.status=status;o.atualizadoEm=new Date().toISOString();}}); try{await salvarObras();obrasSelecionadas.clear();mostrarObras(pesquisa.value);}catch{obras=antes;} loteStatus.value=""; });
loteExcluir.addEventListener("click", async () => { const ids=[...obrasSelecionadas]; if(!ids.length){alert("Selecione pelo menos uma obra.");return;} if(!confirm(`Mover ${ids.length} obra(s) para a lixeira? Elas poderão ser restauradas depois.`))return; const removidas=obras.filter(o=>ids.includes(String(o.id))).map(o=>({...o, excluidaEm:new Date().toISOString()})); const obrasAntes=obras; const lixeiraAntes=lixeira; obras=obras.filter(o=>!ids.includes(String(o.id))); lixeira=[...lixeira,...removidas]; try{await gravarBibliotecaELixeira(obras, lixeira);await backupAutomaticoSeNecessario();obrasSelecionadas.clear();atualizarBotaoLixeira();mostrarObras(pesquisa.value);}catch(e){obras=obrasAntes;lixeira=lixeiraAntes;alert("Não foi possível concluir a exclusão em lote. Nenhuma obra foi considerada removida.");} });
function atualizarBotaoLixeira(){abrirLixeira.textContent=`🗑️ Lixeira (${lixeira.length})`;}
abrirLixeira.addEventListener("click", () => {
  const modal=document.createElement("div"); modal.style.cssText="position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.88);padding:18px;overflow:auto;";
  const caixa=document.createElement("div"); caixa.style.cssText="max-width:520px;margin:25px auto;background:#211b30;color:white;padding:18px;border-radius:14px;";
  const titulo=document.createElement("h2"); titulo.textContent=`Lixeira (${lixeira.length})`; titulo.style.color="#c9a5ff"; caixa.appendChild(titulo);
  const fechar=botaoLote("Fechar"); fechar.addEventListener("click",()=>modal.remove()); caixa.appendChild(fechar);
  if(!lixeira.length){const p=document.createElement("p");p.textContent="A lixeira está vazia.";caixa.appendChild(p);}
  lixeira.slice().reverse().forEach(item=>{const linha=document.createElement("div");linha.style.cssText="padding:12px 0;border-bottom:1px solid #51445f;";const nome=document.createElement("strong");nome.textContent=item.nome;const data=document.createElement("small");data.textContent="\nExcluída em: "+new Date(item.excluidaEm).toLocaleString("pt-BR");data.style.display="block";const restaurar=botaoLote("Restaurar");restaurar.style.marginTop="8px";restaurar.addEventListener("click",async()=>{if(obras.some(o=>String(o.id)===String(item.id))){alert("Já existe uma obra com esse identificador na biblioteca.");return;}const novaLixeira=lixeira.filter(o=>!(String(o.id)===String(item.id)&&o.excluidaEm===item.excluidaEm));const novasObras=[...obras,{...item}];delete novasObras[novasObras.length-1].excluidaEm;try{await gravarBibliotecaELixeira(novasObras, novaLixeira);obras=novasObras;lixeira=novaLixeira;await backupAutomaticoSeNecessario();lixeira=novaLixeira;atualizarBotaoLixeira();modal.remove();mostrarObras(pesquisa.value);}catch{alert("Não foi possível restaurar a obra.");}});const apagarDefinitivo=botaoLote("Excluir definitivamente","#75435b");apagarDefinitivo.style.margin="8px 0 0 6px";apagarDefinitivo.addEventListener("click",async()=>{if(!confirm(`Excluir definitivamente "${item.nome}"? Esta ação não poderá ser desfeita.`))return;const novaLixeira=lixeira.filter(o=>!(String(o.id)===String(item.id)&&o.excluidaEm===item.excluidaEm));try{await gravarLixeiraLaryvas(novaLixeira);lixeira=novaLixeira;await backupAutomaticoSeNecessario();atualizarBotaoLixeira();modal.remove();abrirLixeira.click();}catch{alert("Não foi possível excluir definitivamente a obra.");}});linha.append(nome,data,restaurar,apagarDefinitivo);caixa.appendChild(linha);});
  if(lixeira.length){const apagarTudo=botaoLote("Esvaziar lixeira definitivamente","#75435b");apagarTudo.style.marginTop="14px";apagarTudo.addEventListener("click",async()=>{if(!confirm(`Apagar definitivamente ${lixeira.length} obra(s)? Esta ação não poderá ser desfeita.`))return;try{await gravarLixeiraLaryvas([]);lixeira=[];await backupAutomaticoSeNecessario();atualizarBotaoLixeira();modal.remove();}catch{alert("Não foi possível esvaziar a lixeira.");}});caixa.appendChild(apagarTudo);}
  modal.appendChild(caixa);document.body.appendChild(modal);
});

// Consulta geral dos capítulos favoritos salvos nas obras.
const botaoCapitulosFavoritos = botaoLote("♥ Capítulos favoritos");
abrirLixeira.insertAdjacentElement("afterend", botaoCapitulosFavoritos);
botaoCapitulosFavoritos.style.cssText += "grid-column:1 / -1;";
botaoCapitulosFavoritos.addEventListener("click", () => {
  const modal=document.createElement("div"); modal.style.cssText="position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,.88);padding:18px;overflow:auto;";
  const caixa=document.createElement("div"); caixa.style.cssText="max-width:520px;margin:25px auto;background:#211b30;color:white;padding:18px;border-radius:14px;";
  const h=document.createElement("h2"); h.textContent="Capítulos favoritos"; h.style.color="#e6a9d5"; caixa.appendChild(h);
  const itens=obras.filter(o=>Array.isArray(o.capitulosFavoritos)&&o.capitulosFavoritos.length);
  if(!itens.length){const p=document.createElement("p");p.textContent="Você ainda não marcou capítulos favoritos. Adicione números no formulário de cada obra.";caixa.appendChild(p);}
  itens.forEach(o=>{const p=document.createElement("p");p.style.cssText="padding:10px 0;border-bottom:1px solid #51445f;";p.textContent=`${o.nome}: capítulos ${o.capitulosFavoritos.join(", ")}`;caixa.appendChild(p);});
  const fechar=botaoLote("Fechar");fechar.addEventListener("click",()=>modal.remove());caixa.appendChild(fechar);modal.appendChild(caixa);document.body.appendChild(modal);
});

// Painel de manutenção: aponta dados incompletos sem alterar ou excluir obras.
const botaoManutencao = botaoLote("🔎 Verificar biblioteca");
abrirLixeira.insertAdjacentElement("afterend", botaoManutencao);
botaoManutencao.style.cssText += "grid-column:1 / -1;";
botaoManutencao.addEventListener("click", () => {
  const contagemTitulos = new Map();
  obras.forEach(o => { const chave = chaveNomeObra(o.nome); contagemTitulos.set(chave, (contagemTitulos.get(chave) || 0) + 1); });
  const duplicadas = obras.filter(o => contagemTitulos.get(chaveNomeObra(o.nome)) > 1);
  const problemas = obras.map(o => {
    const fontes = Array.isArray(o.scans) ? o.scans : [{scan:o.scan||"",link:o.link||""}];
    const faltas = [];
    if (!o.capa) faltas.push("sem capa");
    if (!fontes.some(f => f.link)) faltas.push("sem link");
    if (!fontes.some(f => f.scan)) faltas.push("sem scan identificada");
    if (!(o.categorias || []).length) faltas.push("sem categoria");
    return faltas.length ? {nome:o.nome,faltas} : null;
  }).filter(Boolean);
  const modal=document.createElement("div"); modal.style.cssText="position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,.88);padding:18px;overflow:auto;";
  const caixa=document.createElement("div"); caixa.style.cssText="max-width:520px;margin:25px auto;background:#211b30;color:white;padding:18px;border-radius:14px;";
  const h=document.createElement("h2"); h.textContent="Revisão da biblioteca"; h.style.color="#c9a5ff";
  const resumo=document.createElement("p"); resumo.textContent=`${obras.length} obras analisadas. ${problemas.length} com campos incompletos e ${duplicadas.length} possível(is) duplicata(s).`; resumo.style.margin="12px 0";
  const fechar=botaoLote("Fechar"); fechar.addEventListener("click",()=>modal.remove()); caixa.append(h,resumo);
  if (!problemas.length && !duplicadas.length) { const ok=document.createElement("p"); ok.textContent="Nenhuma pendência encontrada nos campos verificados."; caixa.appendChild(ok); }
  if (duplicadas.length) { const aviso=document.createElement("p"); aviso.style.cssText="color:#e6c48c;margin:10px 0;"; aviso.textContent="Possíveis duplicatas (não foram alteradas): " + duplicadas.map(o=>o.nome).join("; "); caixa.appendChild(aviso); }
  problemas.forEach(p=>{const item=document.createElement("p");item.style.cssText="padding:9px 0;border-bottom:1px solid #51445f;font-size:13px;";item.textContent=`${p.nome} — ${p.faltas.join(", ")}`;caixa.appendChild(item);});
  caixa.appendChild(fechar);modal.appendChild(caixa);document.body.appendChild(modal);
});

async function salvarObras() {
  try {
    await gravarBancoLaryvas(obras);
    // Backup diário: é criado na primeira alteração feita após completar 24 horas.
    // O arquivo fica em Downloads e não depende do armazenamento interno do app.
    await backupAutomaticoSeNecessario();
    return true;
  } catch (erro) {
    console.error("Falha ao salvar a biblioteca:", erro);
    alert("Não foi possível salvar as alterações no armazenamento. Suas alterações na tela serão desfeitas. Faça um backup e tente novamente.");
    throw erro;
  }
}

async function backupAutomaticoSeNecessario() {
  try {
    if (window.Android && typeof window.Android.shouldCreateAutomaticBackup === "function" &&
        typeof window.Android.saveAutomaticBackup === "function" && window.Android.shouldCreateAutomaticBackup()) {
      window.Android.saveAutomaticBackup(JSON.stringify(criarConteudoBackup()));
    }
  } catch (erro) { console.warn("Backup automático não iniciado:", erro); }
}

function criarCampo(rotulo, nome, tipo = "text", obrigatorio = false) {
  const grupo = document.createElement("div");
  grupo.style.marginBottom = "14px";

  const label = document.createElement("label");
  label.textContent = rotulo;
  label.style.display = "block";
  label.style.marginBottom = "6px";
  label.style.fontWeight = "bold";

  const campo = document.createElement("input");
  campo.name = nome;
  campo.type = tipo;
  campo.required = obrigatorio;
  campo.placeholder = rotulo;
  campo.style.cssText = `
    width:100%;
    padding:12px;
    border:1px solid #65517d;
    border-radius:10px;
    background:#29213c;
    color:white;
    box-sizing:border-box;
    font-size:15px;
  `;

  grupo.append(label, campo);
  return grupo;
}

function abrirFormulario(obraParaEditar = null) {
  if (document.getElementById("modal-estante")) return;

  const modal = document.createElement("div");
  modal.id = "modal-estante";
  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:9999;
    background:rgba(0,0,0,.85);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:15px;
  `;

  const caixa = document.createElement("div");
  caixa.style.cssText = `
    background:#211b30;
    color:white;
    width:100%;
    max-width:480px;
    max-height:90vh;
    overflow-y:auto;
    padding:22px;
    border-radius:18px;
    box-sizing:border-box;
  `;

const titulo = document.createElement("h2");
titulo.textContent = obraParaEditar
  ? "Editar obra"
  : "Adicionar nova obra";
titulo.style.color = "#c9a5ff";
titulo.style.marginBottom = "20px";

  const formulario = document.createElement("form");

  const grupoCapa = document.createElement("div");
grupoCapa.style.marginBottom = "14px";

const labelCapa = document.createElement("label");
labelCapa.textContent = "Escolher capa da galeria";
labelCapa.style.display = "block";
labelCapa.style.marginBottom = "8px";
labelCapa.style.fontWeight = "bold";

const campoCapa = document.createElement("input");
campoCapa.type = "file";
campoCapa.name = "capa";
campoCapa.accept = "image/*";
campoCapa.style.width = "100%";

grupoCapa.append(labelCapa, campoCapa);

formulario.append(
  criarCampo("Nome da obra *", "nome", "text", true),
  criarCampo("Capítulo lido", "capituloLido", "number"),
  criarCampo("Total de capítulos", "totalCapitulos", "number")
);
const grupoCapitulosFavoritos = document.createElement("div");
grupoCapitulosFavoritos.style.cssText = "margin:14px 0;";
const labelCapitulosFavoritos = document.createElement("label");
labelCapitulosFavoritos.textContent = "Capítulos favoritos (separados por vírgula)";
labelCapitulosFavoritos.style.cssText = "display:block;margin-bottom:7px;font-weight:bold;";
const campoCapitulosFavoritos = document.createElement("input");
campoCapitulosFavoritos.type = "text"; campoCapitulosFavoritos.placeholder = "Ex.: 12, 18, 25";
campoCapitulosFavoritos.style.cssText = "width:100%;padding:11px;border:1px solid #65517d;border-radius:9px;background:#29213c;color:white;";
campoCapitulosFavoritos.value = (obraParaEditar?.capitulosFavoritos || []).join(", ");
grupoCapitulosFavoritos.append(labelCapitulosFavoritos, campoCapitulosFavoritos);
formulario.appendChild(grupoCapitulosFavoritos);

// Fontes/scan: cada registro guarda o nome da scan e seu link correspondente.
const grupoFontes = document.createElement("div");
grupoFontes.style.cssText = "margin:14px 0;";
const tituloFontes = document.createElement("h3");
tituloFontes.textContent = "Scans e links da obra";
tituloFontes.style.cssText = "color:#c9a5ff;margin:0 0 10px;";
const listaFontes = document.createElement("div");
listaFontes.style.cssText = "display:flex;flex-direction:column;gap:12px;";
const botaoAdicionarFonte = document.createElement("button");
botaoAdicionarFonte.type = "button";
botaoAdicionarFonte.textContent = "+ Adicionar outra scan";
botaoAdicionarFonte.style.cssText = "width:100%;padding:11px;border:1px solid #9570d8;border-radius:10px;background:#29213c;color:#c9a5ff;font-weight:bold;";
function adicionarCampoFonte(fonte = {}) {
  const bloco = document.createElement("div");
  bloco.style.cssText = "padding:12px;border:1px solid #65517d;border-radius:12px;background:#292432;";
  const numero = document.createElement("p");
  numero.textContent = `Fonte ${listaFontes.children.length + 1}`;
  numero.style.cssText = "margin:0 0 8px;color:#c9a5ff;font-weight:bold;";
  const campoScan = document.createElement("input");
  campoScan.type = "text"; campoScan.name = "nomeScan"; campoScan.placeholder = "Nome da scan"; campoScan.value = fonte.scan || "";
  const campoLink = document.createElement("input");
  campoLink.type = "url"; campoLink.name = "linkScan"; campoLink.placeholder = "https://link-da-obra.com"; campoLink.value = fonte.link || "";
  [campoScan, campoLink].forEach(campo => { campo.style.cssText = "display:block;width:100%;box-sizing:border-box;margin:7px 0;padding:11px;border:1px solid #65517d;border-radius:9px;background:#211b30;color:white;font-size:14px;"; });
  const remover = document.createElement("button");
  remover.type = "button"; remover.textContent = "Remover esta scan";
  remover.style.cssText = "padding:7px 10px;border:0;border-radius:8px;background:#75435b;color:white;";
  remover.addEventListener("click", () => { bloco.remove(); [...listaFontes.children].forEach((el,i) => el.querySelector('p').textContent = `Fonte ${i+1}`); });
  bloco.append(numero, campoScan, campoLink, remover);
  listaFontes.appendChild(bloco);
}
botaoAdicionarFonte.addEventListener("click", () => adicionarCampoFonte());
grupoFontes.append(tituloFontes, listaFontes, botaoAdicionarFonte);
formulario.append(grupoFontes, grupoCapa);

if (obraParaEditar) {
  formulario.elements.namedItem("nome").value = obraParaEditar.nome || "";
  formulario.elements.namedItem("capituloLido").value = obraParaEditar.capituloLido || "";
  formulario.elements.namedItem("totalCapitulos").value = obraParaEditar.totalCapitulos || "";
}
const fontesIniciais = obraParaEditar
  ? (Array.isArray(obraParaEditar.scans) && obraParaEditar.scans.length ? obraParaEditar.scans : (obraParaEditar.scan || obraParaEditar.link ? [{scan: obraParaEditar.scan || "", link: obraParaEditar.link || ""}] : []))
  : [{scan:"", link:""}];
fontesIniciais.forEach(fonte => adicionarCampoFonte(fonte));
  const grupoStatus = document.createElement("div");
  grupoStatus.style.marginBottom = "18px";

  const labelStatus = document.createElement("label");
  labelStatus.textContent = "Status de leitura";
  labelStatus.style.display = "block";
  labelStatus.style.marginBottom = "8px";
  labelStatus.style.fontWeight = "bold";

  const status = document.createElement("select");
  status.name = "status";
  status.style.cssText = `
    width:100%;
    padding:12px;
    border-radius:10px;
    background:#29213c;
    color:white;
    font-size:15px;
  `;

  [
    "Quero ler",
    "Lendo",
    "Concluída",
    "Em espera"
  ].forEach(nome => {
    const opcao = document.createElement("option");
    opcao.value = nome;
    opcao.textContent = nome;
    status.appendChild(opcao);
  });

  grupoStatus.append(labelStatus, status);
  formulario.appendChild(grupoStatus);
  const controleCategorias = criarSeletorCategorias(obraParaEditar);
  formulario.appendChild(controleCategorias.elemento);
if (obraParaEditar) {
  status.value = obraParaEditar.status || "Quero ler";
}
  const botoes = document.createElement("div");
  botoes.style.cssText = `
    display:flex;
    gap:10px;
    margin-top:20px;
  `;

  const cancelar = document.createElement("button");
  cancelar.type = "button";
  cancelar.textContent = "Cancelar";
  cancelar.style.cssText = `
    flex:1;
    padding:13px;
    border:1px solid #9570d8;
    border-radius:10px;
    background:transparent;
    color:white;
  `;

  const salvar = document.createElement("button");
  salvar.type = "submit";
  salvar.textContent = "Salvar obra";
  salvar.style.cssText = `
    flex:1;
    padding:13px;
    border:0;
    border-radius:10px;
    background:#9560d8;
    color:white;
    font-weight:bold;
  `;

  cancelar.addEventListener("click", () => modal.remove());

  botoes.append(cancelar, salvar);
  formulario.appendChild(botoes);

  formulario.addEventListener("submit", async event => {
  event.preventDefault();

  const dados = new FormData(formulario);
  const arquivo = campoCapa.files[0];

  let imagemCapa = obraParaEditar
    ? obraParaEditar.capa || ""
    : "";

  try {
    if (arquivo) {
      imagemCapa = await lerImagem(arquivo);
    }
  } catch {
    alert("Não foi possível carregar essa imagem.");
    return;
  }

  const fontes = [...listaFontes.children].map(bloco => ({
    scan: bloco.querySelector('input[name="nomeScan"]').value.trim(),
    link: bloco.querySelector('input[name="linkScan"]').value.trim()
  })).filter(fonte => fonte.scan || fonte.link);

  const obra = {
    id: obraParaEditar ? obraParaEditar.id : Date.now(),
    nome: dados.get("nome").trim(),
    // Mantém os campos antigos sincronizados com a primeira fonte para compatibilidade.
    scan: fontes[0]?.scan || "",
    link: fontes[0]?.link || "",
    scans: fontes,
    capa: imagemCapa,
    status: dados.get("status"),
    capituloLido: Number(dados.get("capituloLido")) || 0,
totalCapitulos: Number(dados.get("totalCapitulos")) || 0,
    favorita: obraParaEditar ? !!obraParaEditar.favorita : false,
    categorias: controleCategorias.obter(),
    capitulosFavoritos: [...new Set(campoCapitulosFavoritos.value.split(",").map(v => v.trim()).filter(Boolean))],
    atualizadoEm: new Date().toISOString()
  };

  if (!obra.nome) return;

  let indice = -1;
  let obraAnterior = null;

  if (obraParaEditar) {
    indice = obras.findIndex(item => item.id === obraParaEditar.id);
    obraAnterior = obras[indice];
    obras[indice] = obra;
  } else {
    obras.push(obra);
  }

  try {
    await salvarObras();
  } catch {
    if (indice >= 0) {
      obras[indice] = obraAnterior;
    } else {
      obras.pop();
    }
    return;
  }

  mostrarObras(pesquisa.value);
  modal.remove();
});

  caixa.append(titulo, formulario);
  modal.appendChild(caixa);
  document.body.appendChild(modal);
}
function atualizarEstatisticas() {
  const estatisticas = [
  {
    nome: "Total de obras",
    valor: obras.length,
    icone: "📚",
    filtro: "Todos"
  },
  {
    nome: "Lendo",
    valor: obras.filter(o => o.status === "Lendo").length,
    icone: "📖",
    filtro: "Lendo"
  },
  {
    nome: "Concluídas",
    valor: obras.filter(o => o.status === "Concluída").length,
    icone: "🏆",
    filtro: "Concluída"
  },
  {
    nome: "Favoritas",
    valor: obras.filter(o => o.favorita === true).length,
    icone: "⭐",
    filtro: "Favoritas"
  }
];

  painelEstatisticas.innerHTML = "";

  estatisticas.forEach(item => {
    const cartao = document.createElement("div");
cartao.style.cursor = "pointer";

cartao.addEventListener("click", () => {
  filtroStatus = item.filtro;
  seletorStatus.value = item.filtro;
  mostrarObras(pesquisa.value);
});
    cartao.style.cssText = `
      background:linear-gradient(145deg, #302541, #211b30);
      border:1px solid #65517d;
      border-radius:14px;
      padding:14px;
      color:white;
    `;

    const icone = document.createElement("div");
    icone.textContent = item.icone;
    icone.style.fontSize = "22px";

    const numero = document.createElement("h3");
    numero.textContent = item.valor;
    numero.style.cssText = `
      color:#d2adff;
      font-size:25px;
      margin:8px 0 4px;
    `;

    const nome = document.createElement("p");
    nome.textContent = item.nome;
    nome.style.cssText = `
      color:#bcb0ca;
      font-size:12px;
      margin:0;
    `;

    cartao.append(icone, numero, nome);
    painelEstatisticas.appendChild(cartao);
  });
}
function mostrarObras(filtro = "") {
  listaObras.innerHTML = "";
  atualizarSeletorCategorias();
  atualizarEstatisticas();
  
const resultado = obras.filter(obra => {
  const combinaPesquisa = obraCorrespondeBusca(obra, filtro.toLocaleLowerCase("pt-BR").trim());

  const combinaStatus =
    filtroStatus === "Todos" ||
    obra.status === filtroStatus ||
    (filtroStatus === "Favoritas" && obra.favorita === true);
  const combinaCategoria = filtroCategoria === "Todas" || (Array.isArray(obra.categorias) && obra.categorias.includes(filtroCategoria));

  return combinaPesquisa && combinaStatus && combinaCategoria;
});


  if (ordenacaoObras === "az") resultado.sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (ordenacaoObras === "za") resultado.sort((a,b) => b.nome.localeCompare(a.nome, "pt-BR"));
  if (ordenacaoObras === "recentes") resultado.sort((a,b) => String(b.atualizadoEm || "").localeCompare(String(a.atualizadoEm || "")));
  if (ordenacaoObras === "capitulos") resultado.sort((a,b) => (Number(b.capituloLido)||0) - (Number(a.capituloLido)||0));
  if (ordenacaoObras === "favoritas") resultado.sort((a,b) => Number(!!b.favorita) - Number(!!a.favorita) || a.nome.localeCompare(b.nome, "pt-BR"));

  if (resultado.length === 0) {
    const vazio = document.createElement("div");
    vazio.className = "vazio";

    const icone = document.createElement("span");
    icone.textContent = "📚";

    const titulo = document.createElement("h3");
    titulo.textContent = obras.length
      ? "Nenhuma obra encontrada"
      : "Sua estante está vazia";

    const texto = document.createElement("p");
    texto.textContent = obras.length
      ? "Tente pesquisar outro nome."
      : "Adicione sua primeira obra!";

    vazio.append(icone, titulo, texto);
    listaObras.appendChild(vazio);
    return;
  }

  resultado.forEach(obra => {
    const card = document.createElement("article");
    card.className = "card-obra";

    if (obra.capa) {
      const capa = document.createElement("img");
      capa.className = "capa-obra";
      capa.src = obra.capa;
      capa.alt = "Capa de " + obra.nome;
      capa.onerror = () => capa.style.display = "none";
      card.appendChild(capa);
    }

    const titulo = document.createElement("h3");
    titulo.textContent = obra.nome;

    const status = document.createElement("p");
    status.textContent = "Status: " + obra.status;

    const selecionar = document.createElement("input");
    selecionar.type = "checkbox"; selecionar.checked = obrasSelecionadas.has(String(obra.id));
    selecionar.setAttribute("aria-label", `Selecionar ${obra.nome}`);
    selecionar.style.cssText = "width:20px;height:20px;accent-color:#c9a5ff;margin:4px 0 10px;";
    selecionar.addEventListener("change", () => { selecionar.checked ? obrasSelecionadas.add(String(obra.id)) : obrasSelecionadas.delete(String(obra.id)); atualizarContadorSelecao(); });
    card.append(selecionar, titulo, status);
    if (Array.isArray(obra.categorias) && obra.categorias.length) {
      const tags = document.createElement("div");
      tags.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;";
      obra.categorias.forEach(nome => { const tag=document.createElement("span"); tag.textContent=nome; tag.style.cssText="padding:4px 9px;border-radius:14px;background:#393044;border:1px solid #9570d8;color:#d9c2ff;font-size:12px;"; tags.appendChild(tag); });
      card.appendChild(tags);
    }
    const fontesCard = Array.isArray(obra.scans) && obra.scans.length
      ? obra.scans
      : (obra.scan || obra.link ? [{scan: obra.scan || "Scan", link: obra.link || ""}] : []);
    if (fontesCard.length) {
      const listaLinks = document.createElement("div");
      listaLinks.style.cssText = "display:flex;flex-direction:column;gap:7px;margin:8px 0;";
      fontesCard.forEach((fonte, indice) => {
        const linha = document.createElement("div");
        linha.style.cssText = "padding:8px;border:1px solid #65517d;border-radius:9px;background:#29213c;";
        const nomeFonte = document.createElement("p");
        nomeFonte.textContent = fonte.scan || `Scan ${indice + 1}`;
        nomeFonte.style.cssText = "margin:0 0 5px;color:#c9a5ff;font-weight:bold;";
        linha.appendChild(nomeFonte);
        if (fonte.link) {
          const abrir = document.createElement("a");
          abrir.href = fonte.link; abrir.textContent = "Abrir obra"; abrir.target = "_blank"; abrir.rel = "noopener noreferrer";
          linha.appendChild(abrir);
        } else {
          const semLink = document.createElement("small"); semLink.textContent = "Link não informado"; linha.appendChild(semLink);
        }
        listaLinks.appendChild(linha);
      });
      card.appendChild(listaLinks);
    }
if (obra.totalCapitulos > 0) {
  const lidos = Number(obra.capituloLido) || 0;
  const total = Number(obra.totalCapitulos);
  const porcentagem = Math.min(100, Math.max(0, (lidos / total) * 100));

  const infoProgresso = document.createElement("p");
  infoProgresso.textContent =
    `Progresso: ${lidos} / ${total} capítulos (${porcentagem.toFixed(1)}%)`;

  const barra = document.createElement("div");
  barra.style.cssText = `
    width:100%;
    height:8px;
    background:#453951;
    border-radius:10px;
    overflow:hidden;
    margin:8px 0 14px;
  `;

  const preenchimento = document.createElement("div");
  preenchimento.style.cssText = `
    width:${porcentagem}%;
    height:100%;
    background:#c9a5ff;
    border-radius:10px;
  `;

  barra.appendChild(preenchimento);
  card.append(infoProgresso, barra);
}
if (Array.isArray(obra.capitulosFavoritos) && obra.capitulosFavoritos.length) {
  const favCaps = document.createElement("p");
  favCaps.textContent = "♥ Capítulos favoritos: " + obra.capitulosFavoritos.join(", ");
  favCaps.style.cssText = "color:#e6a9d5;font-size:11px;";
  card.appendChild(favCaps);
}
    if (obra.link) {
      const link = document.createElement("a");
      link.href = obra.link;
      link.textContent = "Abrir obra";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.appendChild(link);
    }


const editar = document.createElement("button");
editar.textContent = "Editar obra";

editar.style.cssText = `
  display:block;
  width:100%;
  margin-top:12px;
  padding:9px;
  border:1px solid #9570d8;
  border-radius:8px;
  background:#393044;
  color:white;
  font-weight:bold;
`;

editar.addEventListener("click", () => {
  abrirFormulario(obra);
});

card.appendChild(editar);
const favorito = document.createElement("button");

favorito.textContent = obra.favorita
  ? "★ Favorita"
  : "☆ Favoritar";

favorito.style.cssText = `
  display:block;
  width:100%;
  margin-top:10px;
  padding:9px;
  border:1px solid #c9a5ff;
  border-radius:8px;
  background:#29213c;
  color:#c9a5ff;
  font-weight:bold;
`;

favorito.addEventListener("click", async () => {
  const favoritoAnterior = obra.favorita;
  obra.favorita = !obra.favorita;
  obra.atualizadoEm = new Date().toISOString();
  try {
    await salvarObras();
    mostrarObras(pesquisa.value);
  } catch {
    obra.favorita = favoritoAnterior;
  }
});

card.appendChild(favorito);
    const excluir = document.createElement("button");
    excluir.textContent = "Excluir obra";
    excluir.style.cssText = `
      display:block;
      margin-top:12px;
      padding:9px;
      border:0;
      border-radius:8px;
      background:#75435b;
      color:white;
    `;
    excluir.addEventListener("click", async () => {
      if (!confirm(`Mover "${obra.nome}" para a lixeira? Você poderá restaurá-la depois.`)) return;
      const obrasAntes = obras; const lixeiraAntes = lixeira;
      obras = obras.filter(item => String(item.id) !== String(obra.id));
      lixeira = [...lixeira, { ...obra, excluidaEm: new Date().toISOString() }];
      try { await gravarBibliotecaELixeira(obras, lixeira); await backupAutomaticoSeNecessario(); atualizarBotaoLixeira(); mostrarObras(pesquisa.value); }
      catch { obras = obrasAntes; lixeira = lixeiraAntes; alert("Não foi possível mover a obra para a lixeira."); }
    });

    card.appendChild(excluir);
    listaObras.appendChild(card);
  });
  atualizarContadorSelecao();
}

botaoAdicionar.addEventListener("click", () => {
  abrirFormulario();
});

pesquisa.addEventListener("input", () => {
  mostrarObras(pesquisa.value);
});

seletorStatus.addEventListener("change", () => {
  filtroStatus = seletorStatus.value;
  mostrarObras(pesquisa.value);
});
const botaoBackup = document.createElement("button");

botaoBackup.textContent = "⬇️ Baixar backup";

botaoBackup.style.cssText = `
  display:block;
  width:100%;
  margin-top:12px;
  padding:14px;
  border:1px solid #c9a5ff;
  border-radius:12px;
  background:#29213c;
  color:#c9a5ff;
  font-size:15px;
  font-weight:bold;
`;

botaoAdicionar.insertAdjacentElement("afterend", botaoBackup);

const infoBackup = document.createElement("p");
infoBackup.style.cssText = "margin:8px 2px 14px;color:#aaa;font-size:12px;text-align:center;";
const ultimoBackup = window.Android && typeof window.Android.getLastAutomaticBackup === "function"
  ? window.Android.getLastAutomaticBackup()
  : "";
infoBackup.textContent = ultimoBackup
  ? `Último backup automático: ${ultimoBackup}`
  : "Backup automático diário: será criado após a primeira alteração no app.";
botaoBackup.insertAdjacentElement("afterend", infoBackup);
const botaoHistoricoBackups = document.createElement("button");
botaoHistoricoBackups.type = "button"; botaoHistoricoBackups.textContent = "🗂️ Ver backups automáticos";
botaoHistoricoBackups.style.cssText = "display:block;width:100%;margin-top:10px;padding:11px;border:1px solid #65517d;border-radius:10px;background:#29213c;color:#c9a5ff;font-weight:bold;";
infoBackup.insertAdjacentElement("afterend", botaoHistoricoBackups);
botaoHistoricoBackups.addEventListener("click", () => {
  let lista = [];
  try { lista = window.Android && typeof window.Android.getAutomaticBackups === "function" ? JSON.parse(window.Android.getAutomaticBackups() || "[]") : []; } catch(e) { console.error(e); }
  const msg = lista.length ? "Backups automáticos encontrados em Downloads:\n\n" + lista.map((v,i)=>`${i+1}. ${v}`).join("\n") + "\n\nPara restaurar: toque em Restaurar biblioteca e escolha um desses arquivos em Downloads." : "Nenhum backup automático foi encontrado. Os próximos backups serão criados após uma alteração quando completar 24 horas.";
  alert(msg);
});

botaoBackup.addEventListener("click", async () => {
  const conteudo = JSON.stringify(criarConteudoBackup(), null, 2);

  // No APK, salva o JSON diretamente na pasta Downloads do Android.
  if (window.Android && typeof window.Android.saveBackup === "function") {
    window.Android.saveBackup(conteudo);
    return;
  }

  const dataArquivo = new Date().toISOString().replace(/[:.]/g, "-");
  const nomeArquivo = `LARYVAS-manual-${dataArquivo}.json`;
  const arquivo = new File(
    [conteudo],
    nomeArquivo,
    { type: "application/json" }
  );

  try {
    if (
      navigator.canShare &&
      navigator.canShare({ files: [arquivo] }) &&
      navigator.share
    ) {
      await navigator.share({
        files: [arquivo],
        title: "Backup da LARYVAS"
      });

      alert("Compartilhamento do backup concluído!");
      return;
    }
  } catch (erro) {
    if (erro.name === "AbortError") {
      return;
    }
  }

  const endereco = URL.createObjectURL(arquivo);
  const link = document.createElement("a");

  link.href = endereco;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(endereco);
  }, 5000);

  alert("Solicitação de download enviada. Confira a pasta Downloads!");
});

// ================================
// RESTAURAR BACKUP DA LARYVAS
// ================================
const botaoRestaurar = document.createElement("button");
botaoRestaurar.textContent = "↥ Restaurar biblioteca";
botaoRestaurar.style.cssText = `
  display:block; width:100%; margin-top:12px; padding:14px;
  border:1px solid #c9a5ff; border-radius:12px;
  background:#29213c; color:#c9a5ff; font-size:15px; font-weight:bold;
`;
botaoBackup.insertAdjacentElement("afterend", botaoRestaurar);

const arquivoRestauracao = document.createElement("input");
arquivoRestauracao.type = "file";
arquivoRestauracao.accept = ".json,application/json";
arquivoRestauracao.style.display = "none";
document.body.appendChild(arquivoRestauracao);

botaoRestaurar.addEventListener("click", () => arquivoRestauracao.click());
arquivoRestauracao.addEventListener("change", async () => {
  const arquivo = arquivoRestauracao.files[0];
  if (!arquivo) return;
  try {
    const dadosOriginais = JSON.parse(await arquivo.text());
    // Compatibilidade: aceita backups antigos (lista) e o novo formato com biblioteca + lixeira.
    const listaObrasBackup = Array.isArray(dadosOriginais) ? dadosOriginais : dadosOriginais.obras;
    const dados = normalizarObrasBackup(listaObrasBackup);
    const lixeiraBackup = !Array.isArray(dadosOriginais) && Array.isArray(dadosOriginais.lixeira) ? normalizarObrasBackup(dadosOriginais.lixeira) : [];
    if (!window.confirm(`Este backup contém ${dados.length} obra(s) e ${lixeiraBackup.length} item(ns) na lixeira.\n\nA biblioteca atual e a lixeira serão SUBSTITUÍDAS pelo conteúdo do backup. Faça um backup manual da biblioteca atual antes de continuar.\n\nDeseja continuar?`)) return;
    await gravarBibliotecaELixeira(dados, lixeiraBackup);
    obras = dados;
    lixeira = lixeiraBackup;
    atualizarBotaoLixeira();
    mostrarObras(pesquisa.value);
    alert(`Biblioteca restaurada com sucesso!\n${obras.length} obra(s) recuperada(s).`);
  } catch (erro) {
    alert(erro.message || "Erro ao ler o arquivo de backup.");
  } finally {
    arquivoRestauracao.value = "";
  }
});


// ================================
// IMPORTAÇÃO INTELIGENTE: SOMENTE OBRAS NOVAS
// ================================
const botaoImportarNovas = document.createElement("button");
botaoImportarNovas.type = "button";
botaoImportarNovas.textContent = "＋ Importar obras novas (sem substituir)";
botaoImportarNovas.style.cssText = `
  display:block; width:100%; margin-top:12px; padding:14px;
  border:1px solid #8fc7a4; border-radius:12px;
  background:#263b32; color:#b8f0ca; font-size:15px; font-weight:bold;
`;
botaoRestaurar.insertAdjacentElement("afterend", botaoImportarNovas);

const arquivoImportacaoNovas = document.createElement("input");
arquivoImportacaoNovas.type = "file";
arquivoImportacaoNovas.accept = ".json,application/json";
arquivoImportacaoNovas.style.display = "none";
document.body.appendChild(arquivoImportacaoNovas);
botaoImportarNovas.addEventListener("click", () => arquivoImportacaoNovas.click());

function chaveNomeObra(nome) {
  return String(nome || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}

function gerarIdImportacao(idsUsados) {
  let id;
  do { id = `import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
  while (idsUsados.has(String(id)));
  idsUsados.add(String(id));
  return id;
}

arquivoImportacaoNovas.addEventListener("change", async () => {
  const arquivo = arquivoImportacaoNovas.files && arquivoImportacaoNovas.files[0];
  if (!arquivo) return;
  try {
    const conteudo = JSON.parse(await arquivo.text());
    const listaRecebida = Array.isArray(conteudo) ? conteudo : conteudo && conteudo.obras;
    if (!Array.isArray(listaRecebida)) {
      throw new Error("Este arquivo não contém uma lista de obras reconhecida pela LARYVAS.");
    }
    const importadas = normalizarObrasBackup(listaRecebida);
    const nomesExistentes = new Set([
      ...obras.map(o => chaveNomeObra(o.nome)),
      ...lixeira.map(o => chaveNomeObra(o.nome))
    ]);
    const nomesDoArquivo = new Set();
    const novas = [];
    let duplicadas = 0;
    for (const obra of importadas) {
      const chave = chaveNomeObra(obra.nome);
      if (!chave || nomesExistentes.has(chave) || nomesDoArquivo.has(chave)) {
        duplicadas++;
        continue;
      }
      nomesDoArquivo.add(chave);
      novas.push(obra);
    }
    if (!novas.length) {
      alert(`Nenhuma obra nova encontrada. ${duplicadas} obra(s) já existem na biblioteca, na lixeira ou aparecem repetidas no arquivo.`);
      return;
    }
    const resumo = `Arquivo: ${arquivo.name}
Obras encontradas: ${importadas.length}
Novas para adicionar: ${novas.length}
Duplicadas/ já existentes: ${duplicadas}

A importação NÃO substituirá sua biblioteca. Favoritos, progresso, status e categorias das obras atuais serão preservados. Deseja adicionar somente as novas?`;
    if (!confirm(resumo)) return;

    const idsUsados = new Set([...obras, ...lixeira].map(o => String(o.id)));
    const obrasNovas = novas.map(o => ({ ...o, id: idsUsados.has(String(o.id)) ? gerarIdImportacao(idsUsados) : o.id }));
    obrasNovas.forEach(o => idsUsados.add(String(o.id)));
    const antes = obras;
    const combinadas = [...obras, ...obrasNovas];
    try {
      obras = combinadas;
      await salvarObras();
      mostrarObras(pesquisa.value);
      alert(`Importação concluída!\n${obrasNovas.length} obra(s) nova(s) adicionada(s).\n${duplicadas} duplicada(s) ignorada(s).`);
    } catch (erroSalvar) {
      obras = antes;
      throw new Error("Não foi possível salvar a importação. Sua biblioteca anterior foi mantida. Tente novamente.");
    }
  } catch (erro) {
    alert(erro.message || "Não foi possível importar este arquivo.");
  } finally {
    arquivoImportacaoNovas.value = "";
  }
});


// Agrupa ferramentas de backup/importação em uma área recolhível para liberar a estante.
const painelBackup = document.createElement("details");
painelBackup.style.cssText = "margin:14px 0 24px;padding:12px;border:1px solid #65517d;border-radius:12px;background:#211d2c;";
const resumoBackup = document.createElement("summary");
resumoBackup.textContent = "⇄ Backup, restauração e importação";
resumoBackup.style.cssText = "color:#c9a5ff;font-weight:bold;cursor:pointer;padding:5px;";
painelBackup.appendChild(resumoBackup);
[infoBackup, botaoBackup, botaoHistoricoBackups, botaoRestaurar, botaoImportarNovas].forEach(el => { el.style.marginTop = "12px"; painelBackup.appendChild(el); });
botaoAdicionar.insertAdjacentElement("afterend", painelBackup);

mostrarObras();

})(); // fim da inicialização assíncrona da LARYVAS
