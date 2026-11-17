(() => {
  'use strict';

  const STORAGE_KEY = 'meus-links-dados-v1';
  const THEME_KEY = 'meus-links-tema-v1';
  const SAMPLE_DATA = {
    grupos: [
      { id: 'trabalho', nome: 'Trabalho', links: [
        { id: 'gmail', nome: 'Gmail', url: 'https://mail.google.com', descricao: 'Acesse sua caixa de entrada.' },
        { id: 'drive', nome: 'Google Drive', url: 'https://drive.google.com', descricao: 'Arquivos e documentos na nuvem.' },
        { id: 'github', nome: 'GitHub', url: 'https://github.com', descricao: 'Repositórios e projetos de código.' }
      ] },
      { id: 'estudos', nome: 'Estudos', links: [
        { id: 'wikipedia', nome: 'Wikipédia', url: 'https://pt.wikipedia.org', descricao: 'Uma enciclopédia livre para consulta.' },
        { id: 'coursera', nome: 'Coursera', url: 'https://www.coursera.org', descricao: 'Cursos para aprender algo novo.' }
      ] },
      { id: 'inspiracao', nome: 'Inspiração', links: [
        { id: 'unsplash', nome: 'Unsplash', url: 'https://unsplash.com', descricao: 'Fotografias para inspiração visual.' }
      ] }
    ]
  };

  const $ = (selector) => document.querySelector(selector);
  const groupList = $('#group-list');
  const linkList = $('#link-list');
  const groupView = $('#group-view');
  const linkView = $('#link-view');
  const dialog = $('#editor-dialog');
  const form = $('#editor-form');
  const nameInput = $('#name-input');
  const urlInput = $('#url-input');
  const descriptionInput = $('#description-input');
  let data = null;
  let selectedGroupId = null;
  let editing = null;
  let toastTimer;

  const makeId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const escapeText = (value) => String(value ?? '');

  function normalizeData(raw) {
    const groups = Array.isArray(raw) ? raw : raw?.grupos;
    if (!Array.isArray(groups)) throw new Error('O arquivo precisa conter uma lista chamada "grupos".');
    return { grupos: groups.map((group) => {
      if (!group || typeof group.nome !== 'string' || !group.nome.trim()) throw new Error('Todos os grupos precisam ter um nome.');
      const links = Array.isArray(group.links) ? group.links : [];
      return {
        id: String(group.id || makeId()),
        nome: group.nome.trim(),
        links: links.map((link) => {
          if (!link || typeof link.nome !== 'string' || !link.nome.trim() || typeof link.url !== 'string') throw new Error('Confira o nome e o endereço de cada link.');
          const url = safeUrl(link.url.trim());
          if (!url) throw new Error('Cada link precisa ter um endereço começando com http:// ou https://.');
          return { id: String(link.id || makeId()), nome: link.nome.trim(), url, descricao: typeof link.descricao === 'string' ? link.descricao.trim() : '' };
        })
      };
    }) };
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { showToast('Não foi possível salvar neste navegador. Baixe o arquivo TXT.'); }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function applyTheme(theme, save = true) {
    const selectedTheme = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = selectedTheme;
    const nextTheme = selectedTheme === 'dark' ? 'claro' : 'escuro';
    const button = $('#theme-toggle');
    button.setAttribute('aria-label', `Mudar para tema ${nextTheme}`);
    button.title = `Mudar para tema ${nextTheme}`;
    button.querySelector('.theme-label').textContent = selectedTheme === 'dark' ? 'Claro' : 'Escuro';
    button.querySelector('.theme-icon').innerHTML = selectedTheme === 'dark'
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
      : '<path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/>';
    $('meta[name="theme-color"]').content = selectedTheme === 'dark' ? '#191512' : '#f5f1eb';
    if (save) { try { localStorage.setItem(THEME_KEY, selectedTheme); } catch { /* tema continua ativo nesta visita */ } }
  }

  function renderGroups() {
    groupList.replaceChildren();
    $('#empty-groups').hidden = data.grupos.length > 0;
    data.grupos.forEach((group, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'group-card';
      card.setAttribute('aria-label', `Abrir grupo ${group.nome}, ${group.links.length} links`);
      card.innerHTML = `<div class="group-card-top"><span class="group-icon" aria-hidden="true">${['▤', '⌘', '✳', '◇', '⌂'][index % 5]}</span><span class="group-arrow" aria-hidden="true">↗</span></div><h3></h3><p class="group-count"></p>`;
      card.querySelector('h3').textContent = escapeText(group.nome);
      card.querySelector('.group-count').textContent = `${group.links.length} ${group.links.length === 1 ? 'link' : 'links'}`;
      card.addEventListener('click', () => openGroup(group.id));
      groupList.append(card);
    });
  }

  function renderLinks() {
    const group = data.grupos.find((item) => item.id === selectedGroupId);
    if (!group) return goHome();
    $('#section-kicker').textContent = 'SEU GRUPO';
    $('#section-title').textContent = group.nome;
    linkList.replaceChildren();
    $('#empty-links').hidden = group.links.length > 0;
    group.links.forEach((link) => {
      const row = document.createElement('article');
      row.className = 'link-card';
      const host = (() => { try { return new URL(link.url).hostname.replace(/^www\./, ''); } catch { return 'Link pessoal'; } })();
      row.innerHTML = `<div class="link-favicon" aria-hidden="true">↗</div><div class="link-main"><h3></h3><a class="link-url" target="_blank" rel="noopener noreferrer"></a><p class="link-description"></p></div><div class="link-actions"><button class="link-action-button edit-link" type="button" aria-label="Editar link">✎</button><button class="link-action-button delete-link" type="button" aria-label="Excluir link">×</button><a class="open-link" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg> Abrir site</a></div>`;
      row.querySelector('h3').textContent = escapeText(link.nome);
      const url = row.querySelector('.link-url');
      url.href = safeUrl(link.url) || '#';
      url.textContent = host;
      const description = row.querySelector('.link-description');
      description.textContent = escapeText(link.descricao);
      description.hidden = !link.descricao;
      const open = row.querySelector('.open-link');
      open.href = safeUrl(link.url) || '#';
      row.querySelector('.edit-link').addEventListener('click', () => openLinkEditor(link.id));
      row.querySelector('.delete-link').addEventListener('click', () => deleteLink(link.id));
      linkList.append(row);
    });
  }

  function safeUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
    catch { return null; }
  }

  function openGroup(id, addHistory = true) {
    const group = data.grupos.find((item) => item.id === id);
    if (!group) return goHome();
    selectedGroupId = id;
    if (addHistory) history.pushState({ meusLinksGrupo: id }, '', `#grupo=${encodeURIComponent(id)}`);
    groupView.hidden = true;
    linkView.hidden = false;
    $('#section-title').textContent = group.nome;
    renderLinks();
  }

  function goHome(updateUrl = true) {
    selectedGroupId = null;
    groupView.hidden = false;
    linkView.hidden = true;
    if (updateUrl && location.hash.startsWith('#grupo=')) history.replaceState({ meusLinksInicio: true }, '', `${location.pathname}${location.search}`);
    $('#section-kicker').textContent = 'ORGANIZAÇÃO';
    $('#section-title').textContent = 'Seus grupos';
    renderGroups();
  }

  function openEditor(mode, item = null) {
    editing = item ? { mode, id: item.id } : { mode, id: null };
    const isLink = mode.endsWith('link');
    const isEdit = mode.startsWith('edit');
    $('#dialog-kicker').textContent = `${isEdit ? 'EDITAR' : 'NOVO'} ${isLink ? 'LINK' : 'GRUPO'}`;
    $('#dialog-title').textContent = isEdit ? `Editar ${isLink ? 'link' : 'grupo'}` : `Criar ${isLink ? 'um link' : 'um grupo'}`;
    $('#dialog-description').textContent = isLink ? 'Salve o endereço e, se quiser, conte para que ele serve.' : 'Dê um nome para encontrar seus links com facilidade.';
    $('#name-label').textContent = isLink ? 'Nome do link' : 'Nome do grupo';
    $('#url-field').hidden = !isLink;
    $('#submit-dialog').textContent = isEdit ? 'Salvar alterações' : (isLink ? 'Adicionar link' : 'Criar grupo');
    nameInput.value = item?.nome || '';
    urlInput.value = item?.url || '';
    descriptionInput.value = item?.descricao || '';
    $('#form-error').hidden = true;
    dialog.showModal();
    nameInput.focus();
  }

  function openGroupEditor() {
    const group = data.grupos.find((item) => item.id === selectedGroupId);
    if (group) openEditor('edit-group', group);
  }

  function openLinkEditor(linkId) {
    const group = data.grupos.find((item) => item.id === selectedGroupId);
    const link = group?.links.find((item) => item.id === linkId);
    if (link) openEditor('edit-link', link);
  }

  function submitEditor(event) {
    event.preventDefault();
    const name = nameInput.value.trim();
    const isLink = editing.mode.endsWith('link');
    const error = $('#form-error');
    if (!name) { error.textContent = 'Informe um nome para continuar.'; error.hidden = false; nameInput.focus(); return; }
    let url;
    if (isLink) {
      url = safeUrl(urlInput.value.trim());
      if (!url) { error.textContent = 'Digite um endereço válido começando com http:// ou https://.'; error.hidden = false; urlInput.focus(); return; }
    }
    if (editing.mode === 'new-group') {
      data.grupos.push({ id: makeId(), nome: name, links: [] });
    } else if (editing.mode === 'edit-group') {
      const group = data.grupos.find((item) => item.id === editing.id);
      if (group) group.nome = name;
    } else {
      const group = data.grupos.find((item) => item.id === selectedGroupId);
      if (!group) return;
      const link = { id: editing.id || makeId(), nome: name, url, descricao: descriptionInput.value.trim() };
      if (editing.mode === 'new-link') group.links.push(link);
      else { const index = group.links.findIndex((item) => item.id === editing.id); if (index >= 0) group.links[index] = link; }
    }
    persist();
    dialog.close();
    if (selectedGroupId) renderLinks(); else renderGroups();
    showToast(isLink ? 'Link salvo com sucesso.' : 'Grupo salvo com sucesso.');
  }

  function deleteLink(linkId) {
    const group = data.grupos.find((item) => item.id === selectedGroupId);
    const link = group?.links.find((item) => item.id === linkId);
    if (!group || !link || !window.confirm(`Excluir o link "${link.nome}"?`)) return;
    group.links = group.links.filter((item) => item.id !== linkId);
    persist(); renderLinks(); showToast('Link excluído.');
  }

  function deleteGroup() {
    const group = data.grupos.find((item) => item.id === selectedGroupId);
    if (!group || !window.confirm(`Excluir o grupo "${group.nome}" e todos os links dele?`)) return;
    data.grupos = data.grupos.filter((item) => item.id !== selectedGroupId);
    persist(); goHome(); showToast('Grupo excluído.');
  }

  function exportData() {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'dados.txt'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Arquivo dados.txt baixado.');
  }

  async function importData(file) {
    if (!file) return;
    try {
      const imported = normalizeData(JSON.parse(await file.text()));
      if (!window.confirm(`Carregar ${imported.grupos.length} grupos deste arquivo? Os dados atuais neste navegador serão substituídos.`)) return;
      data = imported; persist(); goHome(); showToast('Dados carregados com sucesso.');
    } catch (error) { showToast(error instanceof SyntaxError ? 'O arquivo não contém JSON válido.' : error.message || 'Não foi possível carregar o arquivo.'); }
    finally { $('#import-file').value = ''; }
  }

  async function initialize() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) { data = normalizeData(JSON.parse(saved)); }
      else {
        try {
          const response = await fetch('dados.txt', { cache: 'no-store' });
          if (!response.ok) throw new Error('dados.txt não encontrado');
          data = normalizeData(JSON.parse(await response.text()));
        } catch { data = normalizeData(SAMPLE_DATA); }
        persist();
      }
    } catch { data = normalizeData(SAMPLE_DATA); }
    const route = location.hash.match(/^#grupo=(.*)$/);
    const routeId = route ? decodeURIComponent(route[1]) : null;
    if (routeId && data.grupos.some((group) => group.id === routeId)) openGroup(routeId, false);
    else goHome(false);
  }

  $('#add-group-button').addEventListener('click', () => openEditor('new-group'));
  $('#empty-groups').querySelector('[data-action="new-group"]').addEventListener('click', () => openEditor('new-group'));
  $('#add-link-button').addEventListener('click', () => openEditor('new-link'));
  $('#back-button').addEventListener('click', goHome);
  $('#brand-home').addEventListener('click', (event) => { event.preventDefault(); goHome(); });
  $('#edit-group-button').addEventListener('click', openGroupEditor);
  $('#delete-group-button').addEventListener('click', deleteGroup);
  $('#export-button').addEventListener('click', exportData);
  $('#theme-toggle').addEventListener('click', () => applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#import-button').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (event) => importData(event.target.files[0]));
  $('#close-dialog').addEventListener('click', () => dialog.close());
  $('#cancel-dialog').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', submitEditor);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  window.addEventListener('popstate', () => {
    const route = location.hash.match(/^#grupo=(.*)$/);
    const routeId = route ? decodeURIComponent(route[1]) : null;
    if (routeId && data?.grupos.some((group) => group.id === routeId)) openGroup(routeId, false);
    else goHome(false);
  });

  try { applyTheme(localStorage.getItem(THEME_KEY) || 'light', false); } catch { applyTheme('light', false); }
  initialize();
})();
