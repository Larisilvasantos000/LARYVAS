const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'script.js'), 'utf8');
const beforeApp = source.slice(0, source.indexOf('(async function iniciarLaryvas()'));
const context = { window: {}, console, Date, Set, Map, Array, Object, String, Number, Math, Error, JSON };
vm.createContext(context);
vm.runInContext(beforeApp + ';globalThis.api={normalizarObrasBackup,validarIdsBackup,lerEstruturaBackupRestauracao,criarConteudoBackup,lerBancoLaryvas,lerLixeiraLaryvas,gravarBibliotecaELixeira,setDb:(db)=>{laryvasDb=db;}};', context);
const api = context.api;

test('converte um backup legado V2 preservando título, ID, capa e link', () => {
  const antigo = [{ numero: 7, nome: 'Obra teste', link: 'https://example.com/obra', capaBase64: 'YWJj' }];
  const convertido = api.normalizarObrasBackup(antigo);
  assert.equal(convertido.length, 1);
  assert.equal(convertido[0].id, 7);
  assert.equal(convertido[0].nome, 'Obra teste');
  assert.equal(convertido[0].link, 'https://example.com/obra');
  assert.equal(convertido[0].capa, 'data:image/jpeg;base64,YWJj');
});

test('aceita formato legado e formato atual de backup', () => {
  const legado = api.lerEstruturaBackupRestauracao([{ id: 'a', nome: 'A' }]);
  const atual = api.lerEstruturaBackupRestauracao({ formato: 'LARYVAS_BACKUP', versao: 3, obras: [{ id: 'a', nome: 'A' }], lixeira: [] });
  assert.equal(legado.biblioteca.length, 1);
  assert.equal(legado.lixeira.length, 0);
  assert.equal(atual.biblioteca.length, 1);
});

test('gera IDs distintos para registros sem ID entre biblioteca e lixeira', () => {
  const idsReservados = new Set();
  const biblioteca = api.normalizarObrasBackup([{ nome: 'Obra sem ID na biblioteca' }], idsReservados);
  const lixeira = api.normalizarObrasBackup([{ nome: 'Obra sem ID na lixeira' }], idsReservados);
  assert.notEqual(String(biblioteca[0].id), String(lixeira[0].id));
  assert.equal(idsReservados.has(String(biblioteca[0].id)), true);
  assert.equal(idsReservados.has(String(lixeira[0].id)), true);
});

test('recusa formatos, listas e IDs inconsistentes antes da gravação', () => {
  assert.throws(() => api.lerEstruturaBackupRestauracao({ formato: 'OUTRO', obras: [], lixeira: [] }));
  assert.throws(() => api.lerEstruturaBackupRestauracao({ formato: 'LARYVAS_BACKUP', obras: [], lixeira: null }));
  assert.throws(() => api.validarIdsBackup([{ id: 1 }, { id: '1' }], []));
  assert.throws(() => api.validarIdsBackup([{ id: '' }], []));
  assert.throws(() => api.validarIdsBackup([{ id: 'same' }], [{ id: 'same' }]));
});

test('gera backup recebendo explicitamente biblioteca e lixeira', () => {
  const biblioteca = [{ id: 'a', nome: 'A' }];
  const lixeira = [{ id: 'b', nome: 'B', excluidaEm: '2026-11-01' }];
  const backup = api.criarConteudoBackup(biblioteca, lixeira);
  assert.equal(backup.formato, 'LARYVAS_BACKUP');
  assert.equal(backup.obras.length, 1);
  assert.equal(backup.lixeira.length, 1);
});

test('todas as chamadas de backup automático recebem os dados atuais', () => {
  assert.doesNotMatch(source, /backupAutomaticoSeNecessario\(\)/);
  assert.match(source, /backupAutomaticoSeNecessario\(obras, lixeira\)/);
  assert.match(source, /criarConteudoBackup\(obras, lixeira\)/);
});

test('valida links e capas antes de renderizar recursos externos', () => {
  const start = source.indexOf('function urlHttpSegura(valor)');
  const end = source.indexOf('function obraCorrespondeBusca(o, termo)', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const helpers = source.slice(start, end);
  const urlContext = { URL, String };
  vm.createContext(urlContext);
  vm.runInContext(helpers + ';globalThis.safe={urlHttpSegura,urlImagemSegura};', urlContext);
  assert.equal(urlContext.safe.urlHttpSegura('https://example.com'), 'https://example.com/');
  assert.equal(urlContext.safe.urlHttpSegura('javascript:alert(1)'), '');
  assert.equal(urlContext.safe.urlHttpSegura('file:///etc/passwd'), '');
  assert.equal(urlContext.safe.urlImagemSegura('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc');
  assert.equal(urlContext.safe.urlImagemSegura('data:text/html;base64,abc'), '');
});


test('leitura do IndexedDB só conclui depois do commit da transação', async () => {
  let request;
  let transaction;
  const db = { transaction: () => {
    request = {};
    transaction = {
      objectStore: () => ({ get: () => request }),
      abort() { if (this.onabort) this.onabort(); }
    };
    return transaction;
  }};
  api.setDb(db);
  let terminou = false;
  const leitura = api.lerBancoLaryvas().then(v => { terminou = true; return v; });
  request.result = { id: 'biblioteca', obras: [{ id: 'x', nome: 'Teste' }] };
  request.onsuccess();
  await Promise.resolve();
  assert.equal(terminou, false);
  transaction.oncomplete();
  const resultado = await leitura;
  assert.equal(terminou, true);
  assert.equal(resultado.length, 1);
});

test('registro ausente de lixeira é vazio, mas registro inválido é erro', async () => {
  let request;
  let transaction;
  const db = { transaction: () => {
    request = {};
    transaction = {
      objectStore: () => ({ get: () => request }),
      abort() { if (this.onabort) this.onabort(); }
    };
    return transaction;
  }};
  api.setDb(db);
  const leituraVazia = api.lerLixeiraLaryvas();
  request.result = undefined;
  request.onsuccess();
  transaction.oncomplete();
  assert.equal((await leituraVazia).length, 0);

  const leituraInvalida = api.lerLixeiraLaryvas();
  request.result = { id: 'lixeira', itens: 'não é uma lista' };
  request.onsuccess();
  await assert.rejects(leituraInvalida);
});

test('normaliza títulos em alfabetos não latinos para a checagem de duplicidade', () => {
  const match = source.match(/function chaveNomeObra\(nome\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'função de normalização de título encontrada');
  const titleContext = { String };
  vm.createContext(titleContext);
  vm.runInContext(match[0] + ';globalThis.key=chaveNomeObra;', titleContext);
  assert.notEqual(titleContext.key('작품 제목'), '');
  assert.equal(titleContext.key('Ação!'), titleContext.key('acao'));
});

test('biblioteca e lixeira são gravadas juntas em uma única transação', async () => {
  const registros = [];
  let transacoes = 0;
  let transaction;
  const db = { transaction: (stores, mode) => {
    transacoes++;
    assert.equal(stores, 'dados');
    assert.equal(mode, 'readwrite');
    transaction = {
      objectStore: () => ({ put: registro => registros.push(registro) })
    };
    return transaction;
  }};
  api.setDb(db);
  const salvar = api.gravarBibliotecaELixeira([{ id: 'a', nome: 'A' }], [{ id: 'b', nome: 'B' }]);
  transaction.oncomplete();
  await salvar;
  assert.equal(transacoes, 1);
  assert.deepEqual(registros.map(r => r.id), ['biblioteca', 'lixeira']);
});

test('IDs repetidos impedem iniciar a transação de gravação', async () => {
  let transacoes = 0;
  api.setDb({ transaction: () => { transacoes++; throw new Error('não deveria abrir'); } });
  await assert.rejects(api.gravarBibliotecaELixeira([{ id: 'x', nome: 'A' }], [{ id: 'x', nome: 'B' }]));
  assert.equal(transacoes, 0);
});
