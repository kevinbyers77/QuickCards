/* Card Wallet — with brightness/haptics, readable dialog, camera+library pickers */
(() => {
  const dbName = 'card-wallet-db';
  const storeName = 'cards';
  let db, deferredPrompt = null, wakeLock = null;

  const gallery = document.getElementById('gallery');
  const tpl = document.getElementById('cardTpl');
  const addBtn = document.getElementById('btnAdd');
  const editDialog = document.getElementById('editDialog');
  const editForm = document.getElementById('editForm');
  const dialogTitle = document.getElementById('dialogTitle');
  const nameInput = document.getElementById('nameInput');
  const sortBy = document.getElementById('sortBy');
  const search = document.getElementById('search');
  const barcodeDialog = document.getElementById('barcodeDialog');
  const barcodeImg = document.getElementById('barcodeImg');
  const installBtn = document.getElementById('installBtn');
  const brightToggle = document.getElementById('brightToggle');
  const hapticsToggle = document.getElementById('hapticsToggle');

  // new picker elements
  const cardTake = document.getElementById('cardTake');
  const cardChoose = document.getElementById('cardChoose');
  const cardCameraInput = document.getElementById('cardImageCamera');
  const cardFileInput = document.getElementById('cardImageFile');
  const cardSelected = document.getElementById('cardSelected');

  const barTake = document.getElementById('barTake');
  const barChoose = document.getElementById('barChoose');
  const barCameraInput = document.getElementById('barcodeCamera');
  const barFileInput = document.getElementById('barcodeFile');
  const barSelected = document.getElementById('barSelected');

  let pendingCardFile = null;
  let pendingBarFile  = null;

  const PREFS_KEY = 'cw_prefs_v1';

  // PWA install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; if (installBtn) installBtn.hidden = false;
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); await deferredPrompt.userChoice;
    deferredPrompt = null; installBtn.hidden = true;
  });

  // Prefs
  function loadPrefs(){
    try{
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (typeof p.bright === 'boolean') brightToggle.checked = p.bright;
      if (typeof p.haptics === 'boolean') hapticsToggle.checked = p.haptics;
    }catch{}
  }
  function savePrefs(){
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      bright: !!brightToggle.checked,
      haptics: !!hapticsToggle.checked
    }));
  }
  brightToggle.addEventListener('change', savePrefs);
  hapticsToggle.addEventListener('change', savePrefs);
  loadPrefs();

  // Haptics + Brightness
  function haptic(ms=20){ if (hapticsToggle.checked && navigator.vibrate) navigator.vibrate(ms); }
  async function enterBrightMode(){
    if (!brightToggle.checked) return;
    document.body.classList.add('bright-mode');
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI:'hide' });
    } catch {}
  }
  async function exitBrightMode(){
    document.body.classList.remove('bright-mode');
    try { if (wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {}
    try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch {}
  }

  // IndexedDB
  function openDB(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(dbName,1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.createObjectStore(storeName,{keyPath:'id',autoIncrement:true});
        store.createIndex('name','name');
        store.createIndex('lastOpened','lastOpened');
        store.createIndex('openCount','openCount');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idb(mode){ if(!db) db = await openDB(); return db.transaction(storeName,mode).objectStore(storeName); }
  async function getAll(){ const s=await idb('readonly'); return new Promise((res,rej)=>{ const out=[]; const r=s.openCursor(); r.onsuccess=e=>{const c=e.target.result; if(c){out.push(c.value); c.continue();} else res(out)}; r.onerror=()=>rej(r.error); }); }
  async function addCard(d){ const s=await idb('readwrite'); return new Promise((res,rej)=>{ const r=s.add(d); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function putCard(d){ const s=await idb('readwrite'); return new Promise((res,rej)=>{ const r=s.put(d); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
  async function deleteCard(id){ const s=await idb('readwrite'); return new Promise((res,rej)=>{ const r=s.delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

  // Utils
  const readFile = (file) => new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsArrayBuffer(file); });
  const blobFrom = (buf,type) => new Blob([buf], { type: type || 'image/png' });
  const fmtDate = (ts)=> ts ? new Date(ts).toLocaleString([], {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}) : '—';

  function sortCards(cards){
    const q = (search.value||'').toLowerCase().trim();
    let arr = [...cards]; if (q) arr = arr.filter(c => (c.name||'').toLowerCase().includes(q));
    switch (sortBy.value) {
      case 'opens': arr.sort((a,b)=>(b.openCount||0)-(a.openCount||0)); break;
      case 'name': arr.sort((a,b)=>(a.name||'').localeCompare(b.name||'')); break;
      case 'recent':
      default: arr.sort((a,b)=>(b.lastOpened||0)-(a.lastOpened||0)); break;
    }
    return arr;
  }

  async function render(){
    const cards = sortCards(await getAll());
    gallery.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const card of cards){
      const node = tpl.content.firstElementChild.cloneNode(true);
      const imgEl = node.querySelector('.thumb');
      imgEl.src = URL.createObjectURL(card.cardImage);
      imgEl.onload = () => URL.revokeObjectURL(imgEl.src);
      node.querySelector('.name').textContent = card.name || 'Untitled';
      node.querySelector('.opens').textContent = card.openCount || 0;
      node.querySelector('.recent').textContent = fmtDate(card.lastOpened);

      node.querySelector('.thumbBtn').addEventListener('click', async () => {
        barcodeImg.src = URL.createObjectURL(card.barcodeImage);
        barcodeDialog.showModal(); haptic(25); await enterBrightMode();
        card.openCount = (card.openCount||0) + 1;
        card.lastOpened = Date.now();
        await putCard(card); await render();
      });

      node.querySelector('.edit').addEventListener('click', () => openEdit(card));
      node.querySelector('.del').addEventListener('click', async () => {
        if (confirm(`Delete “${card.name}”?`)) { await deleteCard(card.id); await render(); }
      });

      frag.appendChild(node);
    }
    gallery.appendChild(frag);
  }

  function openEdit(card){
    editForm.reset();
    pendingCardFile = null; pendingBarFile = null;
    cardSelected.textContent = 'No image selected';
    barSelected.textContent = 'No image selected';

    dialogTitle.textContent = card ? 'Edit card' : 'Add card';
    if (card){ editForm.dataset.id = card.id; nameInput.value = card.name || ''; }
    else { delete editForm.dataset.id; }
    editDialog.showModal();
  }

  addBtn.addEventListener('click', () => openEdit(null));

  // Camera / library triggers
  cardTake.addEventListener('click', () => cardCameraInput.click());
  cardChoose.addEventListener('click', () => cardFileInput.click());
  barTake.addEventListener('click', () => barCameraInput.click());
  barChoose.addEventListener('click', () => barFileInput.click());

  // Capture selected files into state
  [cardCameraInput, cardFileInput].forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.files && inp.files[0]) {
        pendingCardFile = inp.files[0];
        cardSelected.textContent = `${pendingCardFile.name || 'Photo selected'}`;
      }
    });
  });
  [barCameraInput, barFileInput].forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.files && inp.files[0]) {
        pendingBarFile = inp.files[0];
        barSelected.textContent = `${pendingBarFile.name || 'Photo selected'}`;
      }
    });
  });

  // Allow Cancel to close without being blocked by preventDefault
  editForm.addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') {
      editDialog.close();
      return;
    }
    e.preventDefault(); // only for Save

    const id = editForm.dataset.id ? Number(editForm.dataset.id) : null;
    const name = nameInput.value.trim();

    // Read chosen files (from either camera or library)
    async function toBlob(file){ if (!file) return null; const buf = await readFile(file); return blobFrom(buf, file.type); }
    const cardBlob = await toBlob(pendingCardFile);
    const barBlob  = await toBlob(pendingBarFile);

    if (id){
      const current = (await getAll()).find(c => c.id === id);
      const updated = {
        ...current,
        name,
        cardImage: cardBlob || current.cardImage,
        barcodeImage: barBlob || current.barcodeImage,
      };
      await putCard(updated);
    } else {
      if (!cardBlob || !barBlob) { alert('Please add both images.'); return; }
      await addCard({ name, cardImage: cardBlob, barcodeImage: barBlob, created: Date.now(), lastOpened: 0, openCount: 0 });
    }

    editDialog.close();
    await render();
  });

  barcodeDialog.addEventListener('click', () => { if (document.startViewTransition) document.startViewTransition(()=>{}); haptic(15); barcodeDialog.close(); });
  barcodeDialog.addEventListener('close', exitBrightMode);
  sortBy.addEventListener('change', render);
  search.addEventListener('input', render);

  render();
})();
