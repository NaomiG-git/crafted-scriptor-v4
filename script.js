/* ======= State ======= */
const outlineEl = document.getElementById('outline');
const canvasEl  = document.getElementById('canvas');
const pageEl    = document.getElementById('page');
const pageBgEl  = document.getElementById('pageBg');

const sections = []; // {id,title,html}
let activeId = null;

const DAILY_KEY = 'crafted.v4.daily';
const PROJ_KEY  = 'crafted.v4.project';

// ===== Load categories dynamically from categories.txt =====
async function loadCategories() {
  try {
    const response = await fetch('categories.txt');
    const text = await response.text();

    // Split lines, remove empty ones, trim spaces
    const categories = text.split('\n').map(c => c.trim()).filter(c => c);

    const nicheSelect = document.getElementById('nicheSelect');
    categories.forEach(category => {
      const opt = document.createElement('option');
      opt.value = category;
      opt.textContent = category;
      nicheSelect.appendChild(opt);
    });

    console.log("Categories loaded:", categories.length);
  } catch (err) {
    console.error("Error loading categories.txt:", err);
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', loadCategories);


let promptMap = new Map(); // category -> [prompts]
let cycleIndex = new Map();
// ===== Load prompt library and hook up Inspiration Station =====

// In-memory store: { "Category Name": ["Prompt 1", "Prompt 2", ...] }
const PROMPTS_BY_CATEGORY = Object.create(null);

// Track which prompt index a user is on per category
const promptIndices = Object.create(null);

async function loadPromptLibrary() {
  try {
    const res = await fetch('prompt-library.txt');
    const raw = await res.text();

    // Parse sections like:
    // >>> Category Name
    // Prompt line 1
    // Prompt line 2
    const lines = raw.split(/\r?\n/);
    let currentCategory = null;
    let bucket = [];

    const flushBucket = () => {
      if (currentCategory && bucket.length) {
        // Collapse multi-line prompts separated by blank lines:
        // group consecutive non-blank lines; blank line starts a new prompt
        const prompts = [];
        let acc = [];
        for (const l of bucket) {
          if (l.trim() === '') {
            if (acc.length) {
              prompts.push(acc.join('\n').trim());
              acc = [];
            }
          } else {
            acc.push(l);
          }
        }
        if (acc.length) prompts.push(acc.join('\n').trim());

        PROMPTS_BY_CATEGORY[currentCategory] = prompts;
      }
    };

    for (const line of lines) {
      const headerMatch = line.match(/^>>>[ \t]*(.+)$/); // e.g. ">>> Food & Cooking"
      if (headerMatch) {
        // new category header
        flushBucket();
        currentCategory = headerMatch[1].trim();
        bucket = [];
      } else {
        // prompt content line
        if (currentCategory) bucket.push(line);
      }
    }
    flushBucket();

    console.log('Loaded prompt categories:', Object.keys(PROMPTS_BY_CATEGORY).length);
  } catch (err) {
    console.error('Error loading prompt-library.txt:', err);
  }
}

// Helpers
function getNextPrompt(category) {
  const list = PROMPTS_BY_CATEGORY[category] || [];
  if (!list.length) return '';
  const i = (promptIndices[category] ?? 0) % list.length;
  const text = list[i];
  promptIndices[category] = i + 1;
  return text;
}

// Wire UI
function initInspirationStation() {
  const nicheSelect = document.getElementById('nicheSelect');
  const getBtn = document.getElementById('getPromptBtn');
  const copyBtn = document.getElementById('copyPromptBtn');
  const promptBox = document.getElementById('promptBox');

  // Reset index when category changes
  nicheSelect.addEventListener('change', () => {
    const cat = nicheSelect.value;
    if (cat) promptIndices[cat] = 0;
    promptBox.value = ''; // clear display box
  });

  // Get Prompt → show next prompt (sequential, no shuffle)
  getBtn.addEventListener('click', () => {
    const cat = nicheSelect.value;
    if (!cat) return;
    const text = getNextPrompt(cat);
    promptBox.value = text || '(No prompts found for this category.)';
  });

  // Copy current prompt to clipboard
  copyBtn.addEventListener('click', async () => {
    if (!promptBox.value) return;
    try {
      await navigator.clipboard.writeText(promptBox.value);
      // Optional: brief visual feedback
      copyBtn.disabled = true;
      setTimeout(() => (copyBtn.disabled = false), 600);
    } catch (e) {
      console.warn('Clipboard permission issue:', e);
    }
  });
}

// Boot
document.addEventListener('DOMContentLoaded', async () => {
  await loadPromptLibrary();  // loads PROMPTS_BY_CATEGORY
  initInspirationStation();   // hooks up buttons
});

/* ======= Build default outline (V4) ======= */
const defaultTitles = [
  "Title Page","Copyright","Dedication","Table of Contents","Foreword","Introduction","Chapter 1"
];
defaultTitles.forEach(addSection);

function addSection(title){
  const id = 'sec_' + Math.random().toString(36).slice(2,9);
  sections.push({id,title,html:''});
  const row = document.createElement('div'); row.className='sectionItem'; row.dataset.id=id;
  const a = document.createElement('div'); a.className='sectionTitle'; a.textContent=title;
  a.addEventListener('click',()=>activate(id));
  const b = document.createElement('div'); b.className='sectionBtns';
  const rn = btn('Rename',()=>renameSection(id));
  const del= btn('Delete',()=>deleteSection(id));
  b.append(rn,del);
  row.append(a,b);
  outlineEl.appendChild(row);
  if(!activeId) activate(id);
}
function btn(txt,fn){ const x=document.createElement('button'); x.className='btn'; x.textContent=txt; x.onclick=fn; return x; }
function renameSection(id){
  const s = sections.find(x=>x.id===id);
  const newName = prompt('Rename section:', s.title) || s.title;
  s.title = newName;
  const row = [...outlineEl.children].find(r=>r.dataset.id===id);
  row.querySelector('.sectionTitle').textContent=newName;
  saveProject();
}
function deleteSection(id){
  if(!confirm('Delete this section?')) return;
  const idx = sections.findIndex(x=>x.id===id);
  if(idx>=0){ sections.splice(idx,1); }
  const row = [...outlineEl.children].find(r=>r.dataset.id===id);
  row?.remove();
  if(activeId===id){ activeId = sections[0]?.id || null; }
  activate(activeId);
  saveProject();
}
function activate(id){
  if(!id){ canvasEl.innerHTML=''; return; }
  const s = sections.find(x=>x.id===id);
  if(!s) return;
  // save previous
  if(activeId){
    const cur = sections.find(x=>x.id===activeId);
    if(cur) cur.html = canvasEl.innerHTML;
  }
  activeId = id;
  canvasEl.innerHTML = s.html || '';
  wordCountTick();
  saveProject();
}
document.getElementById('addSectionBtn').onclick = ()=>{
  const name = document.getElementById('newSectionName').value.trim();
  if(!name) return;
  addSection(name);
  document.getElementById('newSectionName').value='';
  saveProject();
};

/* ======= Toolbar actions ======= */
function exec(command, value=null){
  document.execCommand(command,false,value);
  canvasEl.focus();
  saveProjectSoon();
}
document.getElementById('toolbar').addEventListener('click',(e)=>{
  const t = e.target.closest('button'); if(!t) return;
  if(t.dataset.cmd){
    const c = t.dataset.cmd;
    if(c==='back'){ history.back(); return; }
    if(c==='undo'){ exec('undo'); return; }
    if(c==='redo'){ exec('redo'); return; }
    if(c==='bold') return exec('bold');
    if(c==='italic') return exec('italic');
    if(c==='underline') return exec('underline');
    if(c==='strike') return exec('strikeThrough');
    if(c==='indent') return exec('indent');
    if(c==='outdent') return exec('outdent');
  }
  if(t.dataset.list){
    if(t.dataset.list==='ul') exec('insertUnorderedList');
    if(t.dataset.list==='ol') exec('insertOrderedList');
    if(t.dataset.list==='check'){
      document.execCommand('insertHTML',false,'<ul class="checklist"><li>Task</li></ul>');
      saveProjectSoon();
    }
  }
  if(t.id==='insertLinkBtn'){
    showModal('Insert Link', `
      <input id="linkHref" class="input" placeholder="https://example.com">
    `, ()=>{
      const href = document.getElementById('linkHref').value.trim();
      if(href) exec('createLink',href);
    });
  }
  if(t.id==='uploadImageBtn'){
    showModal('Insert Image', `
      <input id="imgFile" type="file" accept="image/*" class="input">
      <div class="row"><label>Size:</label>
        <select id="imgSize" class="input small">
          <option value="s">Small</option><option value="m" selected>Medium</option><option value="l">Large</option>
        </select>
      </div>
    `, async ()=>{
      const file = document.getElementById('imgFile').files?.[0];
      const sz   = document.getElementById('imgSize').value;
      if(!file) return;
      const url = URL.createObjectURL(file);
      addDraggableImage(url, sz);
    });
  }
});
document.getElementById('blockType').onchange = (e)=>{
  const v = e.target.value;
  if(v==='p') exec('formatBlock','<p>');
  else if(v==='quote') document.execCommand('insertHTML',false,'<blockquote>Quote</blockquote>');
  else if(v==='div') document.execCommand('insertHTML',false,'<hr>');
  else exec('formatBlock','<' + v + '>');
};
document.getElementById('fontColor').oninput = (e)=> exec('foreColor', e.target.value);

document.querySelectorAll('[data-align]').forEach(b=>{
  b.addEventListener('click',()=> exec('justify' + b.dataset.align));
});

/* ======= Search / Replace ======= */
const searchInput  = document.getElementById('searchInput');
const replaceInput = document.getElementById('replaceInput');
document.getElementById('replaceBtn').onclick = ()=> replace(false);
document.getElementById('replaceAllBtn').onclick = ()=> replace(true);
function replace(all){
  const s = searchInput.value; if(!s) return;
  const r = replaceInput.value ?? '';
  const scope = document.getElementById('replaceScope').value;
  const doOne = html => html.replace(s,r);
  const doAll = html => html.split(s).join(r);

  if(scope==='active'){
    const cur = sections.find(x=>x.id===activeId);
    if(!cur) return;
    cur.html = (all?doAll:doOne)(cur.html || canvasEl.innerHTML);
    activate(activeId);
  }else{
    sections.forEach(sec=> sec.html = (all?doAll:doOne)(sec.html||'') );
    activate(activeId);
  }
  saveProject();
}

/* ======= Page size ======= */
const pageSize = document.getElementById('pageSize');
function applyPageSize(){
  pageEl.classList.remove('a4','letter','legal','planner');
  pageEl.classList.add(pageSize.value);
}
pageSize.onchange = applyPageSize;
applyPageSize(); // default A4

/* ======= Background image that prints ======= */
document.getElementById('setBgBtn').onclick = ()=> document.getElementById('bgInput').click();
document.getElementById('bgInput').onchange = (e)=>{
  const file = e.target.files?.[0]; if(!file) return;
  const url = URL.createObjectURL(file);
  pageBgEl.style.backgroundImage = `url("${url}")`;
  saveProjectSoon();
};
document.getElementById('clearBgBtn').onclick = ()=>{
  pageBgEl.style.backgroundImage = '';
  saveProjectSoon();
};

/* ======= Upload / Download ======= */
const downloadBtn = document.getElementById('downloadBtn');
const downloadMenu= document.getElementById('downloadMenu');
downloadBtn.addEventListener('click',()=> downloadMenu.style.display =
  downloadMenu.style.display==='block' ? 'none':'block');
document.addEventListener('click',e=>{
  if(!e.target.closest('#downloadBtn') && !e.target.closest('#downloadMenu')) downloadMenu.style.display='none';
});
downloadMenu.addEventListener('click',e=>{
  const t = e.target.closest('button'); if(!t) return;
  if(t.dataset.dl==='pdf') downloadPDF();
  if(t.dataset.dl==='docx') downloadDOCX();
  downloadMenu.style.display='none';
});

document.getElementById('uploadBtn').onclick = ()=> document.getElementById('uploadInput').click();
document.getElementById('uploadInput').onchange = async (e)=>{
  const file = e.target.files?.[0]; if(!file) return;
  const name = file.name.toLowerCase();
  if(name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.html') || name.endsWith('.htm')){
    const text = await file.text();
    pasteIntoActive(text);
  }else if(name.endsWith('.docx') && window.mammoth){
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({arrayBuffer});
    pasteIntoActive(result.value);
  }else if(name.match(/\.(png|jpe?g|gif)$/)){
    const url = URL.createObjectURL(file);
    addDraggableImage(url,'m');
  }else{
    alert('Unsupported file type.');
  }
};

function pasteIntoActive(html){
  if(!activeId) return;
  const s = sections.find(x=>x.id===activeId);
  s.html = (s.html||'') + '\n' + html;
  activate(activeId);
  saveProject();
}

/* ======= DOCX export (simple, preserves headings/lists/paragraphs) ======= */
async function downloadDOCX(){
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = window.docx;
  const paragraphs = [];
  sections.forEach(sec=>{
    if(!sec.html) return;
    paragraphs.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_1 }));
    // Strip tags rudimentarily and split by lines
    const tmp = document.createElement('div'); tmp.innerHTML = sec.html;
    tmp.querySelectorAll('h1,h2,h3,p,li').forEach(node=>{
      const text = node.innerText.replace(/\s+\n/g,'\n').trim();
      if(!text) return;
      if(node.tagName==='H1') paragraphs.push(new Paragraph({text, heading: HeadingLevel.HEADING_1}));
      else if(node.tagName==='H2') paragraphs.push(new Paragraph({text, heading: HeadingLevel.HEADING_2}));
      else if(node.tagName==='H3') paragraphs.push(new Paragraph({text, heading: HeadingLevel.HEADING_3}));
      else paragraphs.push(new Paragraph(text));
    });
  });
  const doc = new Document({ sections:[{ properties:{}, children: paragraphs }]});
  const blob = await Packer.toBlob(doc);
  saveAs(blob, 'Crafted_Scriptor.docx');
}

/* ======= PDF export (print dialog) ======= */
function downloadPDF(){
  window.print();
}

/* ======= Clear Canvas / Delete Project / Theme ======= */
document.getElementById('clearCanvasBtn').onclick = ()=>{
  if(!activeId) return;
  if(!confirm('Clear this section?')) return;
  const s = sections.find(x=>x.id===activeId);
  s.html = '';
  activate(activeId);
  saveProject();
};
document.getElementById('deleteProjectBtn').onclick = ()=>{
  if(!confirm('Delete the whole project?')) return;
  localStorage.removeItem(PROJ_KEY);
  while(outlineEl.firstChild) outlineEl.firstChild.remove();
  sections.splice(0,sections.length);
  defaultTitles.forEach(addSection);
  saveProject();
};
document.getElementById('toggleThemeBtn').onclick = ()=>{
  document.body.classList.toggle('dark');
  saveProjectSoon();
};

/* ======= Word goal + confetti ======= */
const goalInput = document.getElementById('dailyGoal');
const wordCountEl= document.getElementById('wordCount');
canvasEl.addEventListener('input', ()=>{ wordCountTick(); saveProjectSoon(); });
goalInput.addEventListener('change', wordCountTick);
function wordCountTick(){
  const text = canvasEl.innerText || '';
  const words = (text.match(/\b\w+\b/g)||[]).length;
  const goal  = Number(goalInput.value||500);
  wordCountEl.textContent = `${words} / ${goal}`;
  if(words>=goal && !localStorage.getItem(DAILY_KEY)){
    localStorage.setItem(DAILY_KEY, new Date().toDateString());
    if(window.confetti){
      confetti({ particleCount: 140, spread: 70, origin: { y: 0.6 } });
    }
  }
}

/* ======= Autosave / Restore ======= */
function saveProject(){
  // capture current section
  if(activeId){
    const cur = sections.find(x=>x.id===activeId);
    if(cur) cur.html = canvasEl.innerHTML;
  }
  const data = { theme: document.body.classList.contains('dark')?'dark':'light',
    sections, activeId, pageSize: pageSize.value, bg: pageBgEl.style.backgroundImage || '' };
  localStorage.setItem(PROJ_KEY, JSON.stringify(data));
}
let saveTimer=null; function saveProjectSoon(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveProject,400); }

(function restore(){
  try{
    const raw = localStorage.getItem(PROJ_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    document.body.classList.toggle('dark', data.theme==='dark');
    // rebuild outline
    while(outlineEl.firstChild) outlineEl.firstChild.remove();
    sections.splice(0,sections.length);
    data.sections.forEach(s=>{
      sections.push({id:s.id,title:s.title,html:s.html});
      // rows
      const row = document.createElement('div'); row.className='sectionItem'; row.dataset.id=s.id;
      const a = document.createElement('div'); a.className='sectionTitle'; a.textContent=s.title;
      a.addEventListener('click',()=>activate(s.id));
      const b = document.createElement('div'); b.className='sectionBtns';
      b.append(btn('Rename',()=>renameSection(s.id)), btn('Delete',()=>deleteSection(s.id)));
      row.append(a,b); outlineEl.appendChild(row);
    });
    activeId = data.activeId || sections[0]?.id || null;
    pageSize.value = data.pageSize || 'a4';
    applyPageSize();
    pageBgEl.style.backgroundImage = data.bg || '';
    activate(activeId);
  }catch(e){ console.warn('restore failed',e); }
})();

/* ======= Download menu position fix ======= */
document.getElementById('downloadBtn').addEventListener('click',()=>{
  const menu = document.getElementById('downloadMenu');
  menu.style.display='block';
});

/* ======= Inspiration Station (Prompt loader) ======= */
const getPromptBtn = document.getElementById('getPromptBtn');
const copyPromptBtn= document.getElementById('copyPromptBtn');
const promptBox    = document.getElementById('promptBox');

async function loadPromptLibrary(){
  try{
    const res = await fetch('prompt-library.txt',{cache:'no-store'});
    if(!res.ok) throw new Error('not found');
    const text = await res.text();
    // Assumption: library is in exact category order; split by blank lines
    const allPrompts = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    // Distribute evenly by category order (e.g., 25 prompts per category)
    const per = Math.floor(allPrompts.length / CATEGORIES.length);
    let i=0;
    CATEGORIES.forEach(cat=>{
      promptMap.set(cat, allPrompts.slice(i,i+per)); i+=per;
      cycleIndex.set(cat,0);
    });
    document.getElementById('promptNote').textContent = `${allPrompts.length} prompts loaded.`;
  }catch(e){
    document.getElementById('promptNote').textContent = `No prompt-library.txt found yet.`;
  }
}
loadPromptLibrary();

getPromptBtn.onclick = ()=>{
  const cat = nicheSelect.value;
  if(!cat){ promptBox.textContent='Pick a niche first.'; return; }
  const list = promptMap.get(cat);
  if(!list || !list.length){ promptBox.textContent='No prompts found for this niche (add prompt-library.txt).'; return; }
  const idx = cycleIndex.get(cat) ?? 0;
  promptBox.textContent = list[idx];
  cycleIndex.set(cat, (idx+1) % list.length);
};
copyPromptBtn.onclick = ()=>{
  navigator.clipboard.writeText(promptBox.textContent||'');
};

/* ======= Draggable images (S/M/L) ======= */
function addDraggableImage(url, size='m'){
  const fig = document.createElement('div'); fig.className='figure';
  const img = new Image(); img.src = url; fig.appendChild(img);
  const base = size==='s'? 180 : size==='l'? 420 : 300;
  fig.style.width = base+'px';
  fig.style.left  = '40px';
  fig.style.top   = '40px';
  canvasEl.appendChild(fig);
  // drag
  let sx=0, sy=0, ox=0, oy=0, dragging=false;
  fig.addEventListener('mousedown',e=>{ dragging=true; sx=e.clientX; sy=e.clientY; ox=parseInt(fig.style.left)||0; oy=parseInt(fig.style.top)||0; e.preventDefault(); });
  document.addEventListener('mousemove',e=>{ if(!dragging) return; fig.style.left = (ox + e.clientX - sx)+'px'; fig.style.top = (oy + e.clientY - sy)+'px'; });
  document.addEventListener('mouseup',()=>{ dragging=false; saveProjectSoon(); });
}
