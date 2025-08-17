const gallery=document.getElementById('gallery');
const tpl=document.getElementById('cardTpl');
const addBtn=document.getElementById('btnAdd');
const editDialog=document.getElementById('editDialog');
const editForm=document.getElementById('editForm');
const nameInput=document.getElementById('nameInput');
const cardImageInput=document.getElementById('cardImageInput');
const barcodeImageInput=document.getElementById('barcodeImageInput');
const barcodeDialog=document.getElementById('barcodeDialog');
const barcodeImg=document.getElementById('barcodeImg');
const brightToggle=document.getElementById('brightToggle');
const hapticsToggle=document.getElementById('hapticsToggle');

let cards=[]; let wakeLock=null;

function haptic(ms=20){if(hapticsToggle.checked && navigator.vibrate)navigator.vibrate(ms);}
async function enterBright(){if(!brightToggle.checked)return;document.body.classList.add('bright-mode');try{if('wakeLock'in navigator)wakeLock=await navigator.wakeLock.request('screen');}catch{}try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}}
async function exitBright(){document.body.classList.remove('bright-mode');try{if(wakeLock){await wakeLock.release();wakeLock=null;}}catch{}try{if(document.fullscreenElement)await document.exitFullscreen();}catch{}}

function render(){gallery.innerHTML='';cards.forEach((c,i)=>{const node=tpl.content.firstElementChild.cloneNode(true);node.querySelector('.thumb').src=c.card;node.querySelector('.name').textContent=c.name;node.querySelector('.thumbBtn').onclick=()=>{barcodeImg.src=c.barcode;barcodeDialog.showModal();enterBright();haptic(30);};gallery.appendChild(node);});}

editForm.onsubmit=e=>{e.preventDefault();const name=nameInput.value;const fr1=new FileReader();fr1.onload=()=>{const card=fr1.result;const fr2=new FileReader();fr2.onload=()=>{cards.push({name,card,barcode:fr2.result});render();editDialog.close();};fr2.readAsDataURL(barcodeImageInput.files[0]);};fr1.readAsDataURL(cardImageInput.files[0]);};

addBtn.onclick=()=>{editForm.reset();editDialog.showModal();};
barcodeDialog.onclick=()=>{barcodeDialog.close();exitBright();haptic(15);};
