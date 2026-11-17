import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { firebaseConfig, firebaseConfigured } from './firebase-config.js';

const $ = (selector) => document.querySelector(selector);
const THEME_KEY = 'meus-links-tema-v1';
const loginPanel = $('#login-panel');
const appPanel = $('#app-panel');
const groupsView = $('#groups-view');
const linksView = $('#links-view');
const editorDialog = $('#editor-dialog');
const form = $('#editor-form');
const nameInput = $('#name-input');
const urlInput = $('#url-input');
const descriptionInput = $('#description-input');

let auth = null;
let db = null;
let currentUser = null;
let groups = [];
let selectedGroupId = null;
let editorState = null;
let toastTimer;

function applyTheme(theme, save = true) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = selected;
  const next = selected === 'dark' ? 'claro' : 'escuro';
  const button = $('#theme-toggle');
  button.setAttribute('aria-label', `Mudar para tema ${next}`);
  button.title = `Mudar para tema ${next}`;
  $('.theme-label').textContent = selected === 'dark' ? 'Claro' : 'Escuro';
  $('.theme-icon').innerHTML = selected === 'dark'
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
    : '<path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/>';
  $('meta[name="theme-color"]').content = selected === 'dark' ? '#191512' : '#f5f1eb';
  if (save) { try { localStorage.setItem(THEME_KEY, selected); } catch { /* Mantém o tema nesta visita. */ } }
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3000);
}

function friendlyError(error) {
  const code = error?.code || '';
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') return 'O Firebase Authentication ainda não está configurado para login Google. No Firebase Console, abra Authentication, clique em Começar se aparecer, ative Google em Sign-in method e salve um e-mail de suporte.';
  if (code === 'auth/unauthorized-domain') return 'Este endereço não está autorizado no Firebase Authentication. Em Authentication → Settings → Authorized domains, adicione localhost para testar localmente e o domínio do GitHub Pages para publicar.';
  if (code === 'auth/popup-closed-by-user') return 'A janela de login foi fechada antes de concluir.';
  if (code === 'auth/popup-blocked') return 'O navegador bloqueou a janela de login. Permita pop-ups para este site e tente novamente.';
  if (code === 'permission-denied') return 'O Firestore recusou o acesso. Confira se publicou as regras do arquivo firestore.rules.';
  if (code === 'unavailable') return 'O Firebase está temporariamente indisponível. Tente novamente em instantes.';
  return error?.message || 'Ocorreu um erro. Confira a configuração do Firebase e tente novamente.';
}

function setAppError(message = '') {
  const error = $('#app-error');
  error.textContent = message;
  error.hidden = !message;
}

function userCollection(...segments) {
  return collection(db, 'users', currentUser.uid, ...segments);
}

function userDocument(...segments) {
  return doc(db, 'users', currentUser.uid, ...segments);
}

function groupById(id) { return groups.find((group) => group.id === id); }

function renderGroups() {
  const list = $('#group-list');
  list.replaceChildren();
  $('#empty-groups').hidden = groups.length > 0;
  const icons = ['▤', '⌘', '✳', '◇', '⌂'];
  groups.forEach((group, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'group-card';
    card.setAttribute('aria-label', `Abrir grupo ${group.name}`);
    card.innerHTML = `<div class="group-card-top"><span class="group-icon" aria-hidden="true">${icons[index % icons.length]}</span><span class="group-arrow" aria-hidden="true">↗</span></div><h3></h3><p class="group-count"></p>`;
    card.querySelector('h3').textContent = group.name;
    card.querySelector('.group-count').textContent = `${group.linkCount ?? '…'} ${group.linkCount === 1 ? 'link' : 'links'}`;
    card.addEventListener('click', () => openGroup(group.id));
    list.append(card);
  });
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

async function loadGroups() {
  if (!currentUser) return;
  setAppError();
  try {
    const snapshot = await getDocs(userCollection('groups'));
    groups = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), linkCount: 0 }));
    groups.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    await Promise.all(groups.map(async (group) => {
      const links = await getDocs(userCollection('groups', group.id, 'links'));
      group.linkCount = links.size;
    }));
    renderGroups();
    if (selectedGroupId && groupById(selectedGroupId)) await loadLinks(selectedGroupId);
    else goHome();
  } catch (error) {
    setAppError(friendlyError(error));
  }
}

async function openGroup(id) {
  if (!groupById(id)) return;
  selectedGroupId = id;
  groupsView.hidden = true;
  linksView.hidden = false;
  $('#selected-group-name').textContent = groupById(id).name;
  await loadLinks(id);
}

function goHome() {
  selectedGroupId = null;
  linksView.hidden = true;
  groupsView.hidden = false;
  renderGroups();
  setAppError();
}

async function loadLinks(groupId) {
  setAppError();
  const list = $('#link-list');
  list.replaceChildren();
  $('#empty-links').hidden = true;
  try {
    const snapshot = await getDocs(userCollection('groups', groupId, 'links'));
    const links = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    links.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    $('#empty-links').hidden = links.length > 0;
    links.forEach((link) => renderLinkRow(link));
    const group = groupById(groupId);
    if (group) group.linkCount = links.length;
    renderGroups();
    $('#selected-group-name').textContent = group?.name || '';
  } catch (error) {
    setAppError(friendlyError(error));
  }
}

function renderLinkRow(link) {
  const row = document.createElement('article');
  row.className = 'link-card';
  const host = (() => { try { return new URL(link.url).hostname.replace(/^www\./, ''); } catch { return 'Link pessoal'; } })();
  row.innerHTML = '<div class="link-favicon" aria-hidden="true">↗</div><div class="link-main"><h3></h3><a class="link-url" target="_blank" rel="noopener noreferrer"></a><p class="link-description"></p></div><div class="link-actions"><button class="link-action-button edit-link" type="button" aria-label="Editar link">✎</button><button class="link-action-button delete-link" type="button" aria-label="Excluir link">×</button><a class="open-link" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg> Abrir site</a></div>';
  row.querySelector('h3').textContent = link.name;
  const domain = row.querySelector('.link-url');
  domain.href = safeUrl(link.url) || '#';
  domain.textContent = host;
  const description = row.querySelector('.link-description');
  description.textContent = link.description || '';
  description.hidden = !link.description;
  row.querySelector('.open-link').href = safeUrl(link.url) || '#';
  row.querySelector('.edit-link').addEventListener('click', () => openLinkEditor(link));
  row.querySelector('.delete-link').addEventListener('click', () => removeLink(link));
  $('#link-list').append(row);
}

function openEditor(kind, item = null) {
  editorState = { kind, id: item?.id || null };
  const isLink = kind.includes('link');
  const isEdit = kind.startsWith('edit');
  $('#dialog-kicker').textContent = `${isEdit ? 'EDITAR' : 'NOVO'} ${isLink ? 'LINK' : 'GRUPO'}`;
  $('#dialog-title').textContent = isEdit ? `Editar ${isLink ? 'link' : 'grupo'}` : `Criar ${isLink ? 'um link' : 'um grupo'}`;
  $('#dialog-description').textContent = isLink ? 'Informe o endereço e, se quiser, uma breve descrição.' : 'Dê um nome para encontrar seus links com facilidade.';
  $('#name-label').textContent = isLink ? 'Nome do link' : 'Nome do grupo';
  $('#url-field').hidden = !isLink;
  $('#submit-dialog').textContent = isEdit ? 'Salvar alterações' : (isLink ? 'Adicionar link' : 'Criar grupo');
  nameInput.value = item?.name || '';
  urlInput.value = item?.url || '';
  descriptionInput.value = item?.description || '';
  $('#form-error').hidden = true;
  editorDialog.showModal();
  nameInput.focus();
}

function openGroupEditor() {
  const group = groupById(selectedGroupId);
  if (group) openEditor('edit-group', group);
}

function openLinkEditor(link) { openEditor('edit-link', link); }

async function saveEditor(event) {
  event.preventDefault();
  if (!currentUser || !editorState) return;
  const name = nameInput.value.trim();
  const error = $('#form-error');
  const isLink = editorState.kind.includes('link');
  if (!name) { error.textContent = 'Informe um nome para continuar.'; error.hidden = false; nameInput.focus(); return; }
  const url = isLink ? safeUrl(urlInput.value.trim()) : null;
  if (isLink && !url) { error.textContent = 'Digite um endereço válido começando com http:// ou https://.'; error.hidden = false; urlInput.focus(); return; }
  const submit = $('#submit-dialog');
  submit.disabled = true;
  try {
    if (editorState.kind.endsWith('group')) {
      const groupRef = editorState.id
        ? userDocument('groups', editorState.id)
        : null;
      if (groupRef) await updateDoc(groupRef, { name, updatedAt: serverTimestamp() });
      else await addDoc(userCollection('groups'), { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    } else {
      const linkData = { name, url, description: descriptionInput.value.trim(), updatedAt: serverTimestamp() };
      if (editorState.id) await updateDoc(userDocument('groups', selectedGroupId, 'links', editorState.id), linkData);
      else await addDoc(userCollection('groups', selectedGroupId, 'links'), { ...linkData, createdAt: serverTimestamp() });
    }
    editorDialog.close();
    if (isLink) await loadLinks(selectedGroupId);
    else await loadGroups();
    toast(isLink ? 'Link salvo na sua conta.' : 'Grupo salvo na sua conta.');
  } catch (saveError) {
    error.textContent = friendlyError(saveError);
    error.hidden = false;
  } finally { submit.disabled = false; }
}

async function removeLink(link) {
  if (!currentUser || !window.confirm(`Excluir o link "${link.name}"?`)) return;
  try {
    await deleteDoc(userDocument('groups', selectedGroupId, 'links', link.id));
    await loadLinks(selectedGroupId);
    toast('Link excluído.');
  } catch (error) { setAppError(friendlyError(error)); }
}

async function removeGroup() {
  const group = groupById(selectedGroupId);
  if (!currentUser || !group || !window.confirm(`Excluir o grupo "${group.name}" e todos os links dele?`)) return;
  try {
    const links = await getDocs(userCollection('groups', group.id, 'links'));
    await Promise.all(links.docs.map((item) => deleteDoc(item.ref)));
    await deleteDoc(userDocument('groups', group.id));
    goHome();
    await loadGroups();
    toast('Grupo excluído.');
  } catch (error) { setAppError(friendlyError(error)); }
}

async function signIn() {
  $('#login-error').hidden = true;
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (error) { $('#login-error').textContent = friendlyError(error); $('#login-error').hidden = false; }
}

function showSignedOut() {
  currentUser = null;
  groups = [];
  selectedGroupId = null;
  loginPanel.hidden = false;
  appPanel.hidden = true;
  $('#user-email').hidden = true;
  $('#signout-button').hidden = true;
}

async function showSignedIn(user) {
  currentUser = user;
  loginPanel.hidden = true;
  appPanel.hidden = false;
  $('#user-email').textContent = user.email || user.displayName || 'Conta Google';
  $('#user-email').hidden = false;
  $('#signout-button').hidden = false;
  $('#welcome-name').textContent = user.displayName ? `Olá, ${user.displayName.split(' ')[0]}` : 'Sua biblioteca';
  await loadGroups();
}

function initializeFirebase() {
  if (!firebaseConfigured) {
    $('#google-signin').disabled = true;
    $('#setup-message').hidden = false;
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    auth.useDeviceLanguage();
    db = getFirestore(app);
    onAuthStateChanged(auth, (user) => {
      if (user) void showSignedIn(user);
      else showSignedOut();
    }, (error) => {
      $('#login-error').textContent = friendlyError(error);
      $('#login-error').hidden = false;
    });
  } catch (error) {
    $('#google-signin').disabled = true;
    $('#setup-message').textContent = `Não foi possível iniciar o Firebase: ${friendlyError(error)}`;
    $('#setup-message').hidden = false;
  }
}

$('#brand-home').addEventListener('click', (event) => {
  event.preventDefault();
  if (currentUser) goHome();
});
$('#theme-toggle').addEventListener('click', () => applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
$('#google-signin').addEventListener('click', signIn);
$('#signout-button').addEventListener('click', async () => {
  try { await signOut(auth); }
  catch (error) { toast(friendlyError(error)); }
});
$('#add-group-button').addEventListener('click', () => openEditor('new-group'));
$('#empty-groups').querySelector('[data-action="new-group"]').addEventListener('click', () => openEditor('new-group'));
$('#back-button').addEventListener('click', goHome);
$('#add-link-button').addEventListener('click', () => openEditor('new-link'));
$('#edit-group-button').addEventListener('click', openGroupEditor);
$('#delete-group-button').addEventListener('click', removeGroup);
$('#close-dialog').addEventListener('click', () => editorDialog.close());
$('#cancel-dialog').addEventListener('click', () => editorDialog.close());
form.addEventListener('submit', saveEditor);
editorDialog.addEventListener('click', (event) => { if (event.target === editorDialog) editorDialog.close(); });

try { applyTheme(localStorage.getItem(THEME_KEY) || 'light', false); }
catch { applyTheme('light', false); }
initializeFirebase();
