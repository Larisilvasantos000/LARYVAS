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
let obras = [];

try {
  obras = JSON.parse(localStorage.getItem("laryvasObras")) || [];
} catch {
  obras = [];
}

function salvarObras() {
  localStorage.setItem("laryvasObras", JSON.stringify(obras));
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
  criarCampo("Scan responsável", "scan"),
  criarCampo("Link da obra", "link", "url"),
  criarCampo("Capítulo lido", "capituloLido", "number"),
  criarCampo("Total de capítulos", "totalCapitulos", "number"),
  grupoCapa
);
if (obraParaEditar) {
  formulario.elements.namedItem("nome").value = obraParaEditar.nome || "";
  formulario.elements.namedItem("scan").value = obraParaEditar.scan || "";
  formulario.elements.namedItem("link").value = obraParaEditar.link || "";
formulario.elements.namedItem("capituloLido").value = obraParaEditar.capituloLido || "";
formulario.elements.namedItem("totalCapitulos").value = obraParaEditar.totalCapitulos || "";
}
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

  const obra = {
    id: obraParaEditar ? obraParaEditar.id : Date.now(),
    nome: dados.get("nome").trim(),
    scan: dados.get("scan").trim(),
    link: dados.get("link").trim(),
    capa: imagemCapa,
    status: dados.get("status"),
    capituloLido: Number(dados.get("capituloLido")) || 0,
totalCapitulos: Number(dados.get("totalCapitulos")) || 0,
    favorita: obraParaEditar ? !!obraParaEditar.favorita : false
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
    salvarObras();
  } catch {
    if (indice >= 0) {
      obras[indice] = obraAnterior;
    } else {
      obras.pop();
    }

    alert("O armazenamento está cheio. Tente uma imagem menor.");
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
  atualizarEstatisticas();
  
const resultado = obras.filter(obra => {
  const combinaPesquisa = obra.nome.toLowerCase().includes(filtro.toLowerCase());

  const combinaStatus =
    filtroStatus === "Todos" ||
    obra.status === filtroStatus ||
    (filtroStatus === "Favoritas" && obra.favorita === true);

  return combinaPesquisa && combinaStatus;
});


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

    const scan = document.createElement("p");
    scan.textContent = "Scan: " + (obra.scan || "Não informada");

    const status = document.createElement("p");
    status.textContent = "Status: " + obra.status;

    card.append(titulo, scan, status);
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

favorito.addEventListener("click", () => {
  obra.favorita = !obra.favorita;
  salvarObras();
  mostrarObras(pesquisa.value);
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
    excluir.addEventListener("click", () => {
  const confirmar = document.createElement("div");

  confirmar.style.cssText = `
    position:fixed;
    inset:0;
    z-index:10000;
    background:rgba(0,0,0,0.85);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
  `;

  const caixaConfirmacao = document.createElement("div");

  caixaConfirmacao.style.cssText = `
    background:#211b30;
    color:white;
    padding:24px;
    border-radius:16px;
    width:100%;
    max-width:350px;
    text-align:center;
  `;

  const mensagem = document.createElement("h3");
  mensagem.textContent = "Excluir esta obra?";
  mensagem.style.color = "#c9a5ff";

  const texto = document.createElement("p");
  texto.textContent = "Tem certeza de que deseja remover esta obra da sua biblioteca?";
  texto.style.margin = "15px 0 22px";

  const botoesConfirmacao = document.createElement("div");
  botoesConfirmacao.style.cssText = `
    display:flex;
    gap:10px;
  `;

  const cancelarExclusao = document.createElement("button");
  cancelarExclusao.textContent = "Não, cancelar";
  cancelarExclusao.style.cssText = `
    flex:1;
    padding:12px;
    border:1px solid #9570d8;
    border-radius:10px;
    background:transparent;
    color:white;
  `;

  const confirmarExclusao = document.createElement("button");
  confirmarExclusao.textContent = "Sim, excluir";
  confirmarExclusao.style.cssText = `
    flex:1;
    padding:12px;
    border:0;
    border-radius:10px;
    background:#9560d8;
    color:white;
    font-weight:bold;
  `;

  cancelarExclusao.addEventListener("click", () => {
    confirmar.remove();
  });

  confirmarExclusao.addEventListener("click", () => {
    obras = obras.filter(item => item.id !== obra.id);
    salvarObras();
    mostrarObras(pesquisa.value);
    confirmar.remove();
  });

  botoesConfirmacao.append(cancelarExclusao, confirmarExclusao);
  caixaConfirmacao.append(mensagem, texto, botoesConfirmacao);
  confirmar.appendChild(caixaConfirmacao);
  document.body.appendChild(confirmar);
});

    card.appendChild(excluir);
    listaObras.appendChild(card);
  });
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

botaoBackup.addEventListener("click", async () => {
  const conteudo = JSON.stringify(obras, null, 2);

  // No APK, salva o JSON diretamente na pasta Downloads do Android.
  if (window.Android && typeof window.Android.saveBackup === "function") {
    window.Android.saveBackup(conteudo);
    return;
  }

  const arquivo = new File(
    [conteudo],
    "LARYVAS-backup.json",
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
  link.download = "LARYVAS-backup.json";
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
    const dados = JSON.parse(await arquivo.text());
    if (!Array.isArray(dados) || !dados.every(obra => obra && typeof obra === "object" && typeof obra.nome === "string" && typeof obra.status === "string")) {
      throw new Error("O arquivo selecionado não é um backup válido da LARYVAS.");
    }
    if (!window.confirm(`Este backup contém ${dados.length} obra(s).\
\
A biblioteca atual será SUBSTITUÍDA pelo conteúdo do backup.\
\
Deseja continuar?`)) return;
    const anterior = obras;
    const armazenamentoAnterior = localStorage.getItem("laryvasObras");
    try {
      localStorage.setItem("laryvasObras", JSON.stringify(dados));
      obras = dados;
      mostrarObras(pesquisa.value);
      alert(`Biblioteca restaurada com sucesso!\
${obras.length} obra(s) recuperada(s).`);
    } catch (erro) {
      obras = anterior;
      try {
        if (armazenamentoAnterior === null) localStorage.removeItem("laryvasObras");
        else localStorage.setItem("laryvasObras", armazenamentoAnterior);
      } catch (_) {}
      mostrarObras(pesquisa.value);
      throw new Error("Não foi possível restaurar. O armazenamento pode estar cheio.");
    }
  } catch (erro) {
    alert(erro.message || "Erro ao ler o arquivo de backup.");
  } finally {
    arquivoRestauracao.value = "";
  }
});

mostrarObras();