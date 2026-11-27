const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(assets, 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(assets, 'style.css'), 'utf8');

test('mantém identidade e pontos de entrada da biblioteca', () => {
  assert.match(html, /<h1>LARYVAS<\/h1>/);
  assert.match(html, /id="pesquisa"/);
  assert.match(html, /id="lista-obras"/);
  assert.match(html, /id="adicionar-obra"/);
});

test('organiza pesquisa e filtros em uma área semântica única', () => {
  assert.match(js, /className = "area-descoberta"/);
  assert.match(js, /className = "linha-pesquisa"/);
  assert.match(js, /className = "filtros-biblioteca"/);
  assert.match(js, /filtrosBiblioteca\.append\(seletorStatus, seletorCategoria, seletorOrdenacao, botaoGerenciarCategorias\)/);
});

test('mantém configurações e ações em lote fora da tela principal', () => {
  assert.match(js, /telaConfiguracoes\.append\(voltarBiblioteca, tituloConfiguracoes, descricaoConfiguracoes, rotuloColunas, seletorColunas, painelAcoesLote, painelBackup\)/);
  assert.match(js, /window\.laryvasHandleAndroidBack/);
});

test('não cria ação de alternar favoritas no painel de seleção em lote', () => {
  const inicio = js.indexOf('// Seleção em lote e lixeira');
  const fim = js.indexOf('function atualizarContadorSelecao', inicio);
  const bloco = js.slice(inicio, fim);
  assert.doesNotMatch(bloco, /Alternar favoritas|alternar favoritas/i);
});

test('CSS define grade responsiva e apresentação compacta dos filtros', () => {
  assert.match(css, /#lista-obras\{display:grid/);
  assert.match(css, /\.filtros-biblioteca\{display:grid/);
  assert.match(css, /@media\(min-width:700px\)/);
});


test('cartões usam estrutura de catálogo com capa, estado e conteúdo separados', () => {
  assert.match(js, /className = "card-capa-wrap"/);
  assert.match(js, /className = "card-conteudo"/);
  assert.match(js, /className = "status-obra/);
  assert.match(js, /className = "titulo-obra"/);
  assert.match(css, /\.card-capa-wrap\{position:relative/);
  assert.match(css, /\.card-conteudo\{display:flex/);
});

test('ações de cada cartão preservam editar, favoritar e excluir para a lixeira', () => {
  assert.match(js, /className = "acao-obra acao-editar"/);
  assert.match(js, /className = "acao-obra acao-favorito"/);
  assert.match(js, /className = "acao-obra acao-excluir"/);
  assert.match(js, /Mover "\$\{obra\.nome\}" para a lixeira/);
  assert.match(js, /await gravarBibliotecaELixeira\(obras, lixeira\)/);
});

test('cartões mantêm links de scan, progresso de capítulos e categorias', () => {
  assert.match(js, /className = "fontes-obra"/);
  assert.match(js, /className = "progresso-obra"/);
  assert.match(js, /className = "tags-obra"/);
  assert.match(js, /className = "capitulos-favoritos"/);
});


test('posiciona adicionar obra antes da grade e mantém cartões sem recuo inconsistente', () => {
  assert.match(js, /listaObras\.insertAdjacentElement\("beforebegin", botaoAdicionar\)/);
  assert.doesNotMatch(css, /\.card-obra\{padding:(?:6|10)px\}/);
});
