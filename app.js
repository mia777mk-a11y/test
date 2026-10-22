"use strict";
(() => {
  const KEY = "ghaim-notes-v2";
  const LEGACY_KEYS = ["ghaim-diary-v1", "notestackNotes", "ultimateNotes"];
  const $ = id => document.getElementById(id);
  const els = {
    list: $("notesList"), empty: $("emptyState"), emptyTitle: $("emptyTitle"), emptyMessage: $("emptyMessage"),
    title: $("noteTitle"), body: $("noteBody"), category: $("categorySelect"), search: $("searchInput"),
    indicator: $("saveIndicator"), saveLabel: $("saveLabel"), wordCount: $("noteWordCount"), charCount: $("charCount"),
    viewTitle: $("viewTitle"), viewSubtitle: $("viewSubtitle"), summary: $("listSummary"), sort: $("sortSelect"),
    editor: $("editorPane"), pane: $("notesPane"), toast: $("toast"), backdrop: $("confirmBackdrop")
  };
  const labels = {journal:"يومياتي",ideas:"أفكار صغيرة",general:"عام"};
  const viewCopy = {
    all:["كل الملاحظات","أفكارك، تفاصيل يومك، وكل ما يستحق أن يبقى."],
    favorites:["المفضّلة","الملاحظات التي تريدين العودة إليها دائمًا."],
    journal:["يومياتي","مساحة لتفاصيل الأيام والمشاعر الصغيرة."],
    ideas:["أفكار صغيرة","التقطي أفكارك قبل أن تتبخر."],
    trash:["سلة المحذوفات","يمكنك استعادة ملاحظاتك أو حذفها نهائيًا."]
  };
  let notes = [], trash = [], currentId = null, currentView = "all", timer = null, toastTimer = null, confirmAction = null, lastSaved = "", dirty = false;
  const makeId = () => (crypto && crypto.randomUUID) ? crypto.randomUUID() : "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const now = () => new Date().toISOString();
  const number = n => new Intl.NumberFormat("ar").format(n);
  const formatDate = (value, options={day:"numeric",month:"short",year:"numeric"}) => {
    try { return new Intl.DateTimeFormat("ar", options).format(new Date(value)); } catch { return ""; }
  };
  const wordCount = value => (value.trim().match(/\S+/g) || []).length;
  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2500);
  }
  function setStatus(state, text) {
    els.indicator.classList.remove("saving","error");
    if (state === "saving") els.indicator.classList.add("saving");
    if (state === "error") els.indicator.classList.add("error");
    els.saveLabel.textContent = text;
  }
  function normaliseNote(item, index=0) {
    if (typeof item === "string") item = {body:item};
    if (!item || typeof item !== "object") return null;
    const body = typeof item.body === "string" ? item.body : typeof item.text === "string" ? item.text : "";
    const title = typeof item.title === "string" ? item.title : "";
    const created = item.created || item.createdAt || item.updated || item.date || now();
    const updated = item.updated || item.updatedAt || created;
    const cat = ["journal","ideas","general"].includes(item.category) ? item.category : item.folder ? "general" : "journal";
    return {
      id: String(item.id || makeId() + index), title, body,
      category: cat, favorite: Boolean(item.favorite || item.isFavorite),
      deleted: Boolean(item.deleted), created, updated,
      mood: typeof item.mood === "string" ? item.mood : "",
      labels: Array.isArray(item.labels) ? item.labels : []
    };
  }
  function loadData() {
    let loaded = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        notes = Array.isArray(data.notes) ? data.notes.map(normaliseNote).filter(Boolean) : [];
        trash = Array.isArray(data.trash) ? data.trash.map(normaliseNote).filter(Boolean) : [];
        loaded = true;
      }
    } catch { toast("تعذّرت قراءة البيانات المحفوظة؛ تحققي من النسخة الاحتياطية إن وجدت."); }
    if (!loaded) {
      for (const key of LEGACY_KEYS) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const data = JSON.parse(raw);
          const arr = Array.isArray(data) ? data : Array.isArray(data.notes) ? data.notes : [];
          const converted = arr.map(normaliseNote).filter(Boolean);
          if (converted.length) { notes.push(...converted); loaded = true; }
        } catch {}
      }
      try {
        const oldTrash = JSON.parse(localStorage.getItem("ultimateTrash") || "[]");
        if (Array.isArray(oldTrash)) trash = oldTrash.map(normaliseNote).filter(Boolean);
      } catch {}
      if (loaded) persist();
    }
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({version:2,notes,trash}));
      return true;
    } catch (err) {
      setStatus("error","تعذّر الحفظ");
      toast("لم يتم الحفظ. صدّري نسخة احتياطية أو أفرغي مساحة المتصفح.");
      return false;
    }
  }
  function activeNote() { return notes.find(n => n.id === currentId && !n.deleted) || null; }
  function showEditorOnMobile() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      els.pane.classList.add("list-hidden");
      els.editor.classList.remove("editor-hidden");
      $("sidebar").classList.remove("mobile-open");
    }
  }
  function showListOnMobile() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      els.pane.classList.remove("list-hidden");
      els.editor.classList.add("editor-hidden");
      document.body.classList.remove("focus-mode");
    }
  }
  function newNote() {
    clearTimeout(timer);
    const note = {id:makeId(),title:"",body:"",category:currentView==="ideas"?"ideas":currentView==="journal"?"journal":"journal",favorite:false,deleted:false,created:now(),updated:now(),mood:"",labels:[]};
    notes.unshift(note);
    currentId = note.id;
    if (!persist()) { notes = notes.filter(n => n.id !== note.id); currentId = null; return; }
    openNote(note.id);
    els.title.focus();
    els.title.setSelectionRange(0,0);
    toast("فتحتُ لكِ ملاحظة جديدة. اكتبي بحرية 💙");
  }
  function openNote(id) {
    const note = notes.find(n => n.id === id && !n.deleted);
    if (!note) return;
    currentId = id;
    els.title.value = note.title || "";
    els.body.value = note.body || "";
    els.category.value = labels[note.category] ? note.category : "journal";
    $("noteDate").textContent = "أُنشئت " + formatDate(note.created, {day:"numeric",month:"long",year:"numeric"});
    $("favoriteBtn").textContent = note.favorite ? "♥" : "♡";
    $("favoriteBtn").classList.toggle("is-on",note.favorite);
    $("favoriteBtn").setAttribute("aria-label",note.favorite?"إزالة من المفضلة":"إضافة للمفضلة");
    $("favoriteBtn").title = note.favorite ? "إزالة من المفضلة" : "إضافة للمفضلة";
    els.title.placeholder = "عنوان ملاحظتك…";
    updateCounters();
    setStatus("saved", "كل شيء محفوظ");
    lastSaved = JSON.stringify([note.title,note.body,note.category,note.favorite]);
    dirty = false;
    render();
    showEditorOnMobile();
  }
  function scheduleSave() {
    updateCounters();
    dirty = true;
    setStatus("saving","جارٍ الحفظ…");
    clearTimeout(timer);
    timer = setTimeout(saveCurrent, 300);
  }
  function saveCurrent() {
    clearTimeout(timer);
    const note = activeNote();
    if (!note) return;
    const next = JSON.stringify([els.title.value,els.body.value,els.category.value,note.favorite]);
    if (next === lastSaved) { dirty = false; setStatus("saved","كل شيء محفوظ"); return; }
    note.title = els.title.value;
    note.body = els.body.value;
    note.category = els.category.value;
    note.updated = now();
    if (persist()) {
      lastSaved = JSON.stringify([note.title,note.body,note.category,note.favorite]);
      dirty = false;
      setStatus("saved","حُفظ تلقائيًا");
      renderListOnly();
    }
  }
  function updateCounters() {
    const content = els.body.value;
    els.wordCount.textContent = number(wordCount(content)) + " كلمة";
    els.charCount.textContent = number(content.length) + " حرف";
  }
  function safeText(el, value) { el.textContent = value; return el; }
  function visibleNotes() {
    const query = els.search.value.trim().toLocaleLowerCase("ar");
    let list = currentView === "trash" ? trash : notes.filter(n => !n.deleted);
    if (currentView === "favorites") list = list.filter(n => n.favorite);
    if (currentView === "journal" || currentView === "ideas") list = list.filter(n => n.category === currentView);
    if (query) list = list.filter(n => ((n.title||"") + " " + (n.body||"")).toLocaleLowerCase("ar").includes(query));
    if (els.sort.value === "title") list = [...list].sort((a,b)=>(a.title||"").localeCompare(b.title||"","ar"));
    else if (els.sort.value === "created") list = [...list].sort((a,b)=>new Date(b.created)-new Date(a.created));
    else list = [...list].sort((a,b)=>new Date(b.updated)-new Date(a.updated));
    return list;
  }
  function makeCard(note) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "note-card" + (note.id === currentId ? " selected" : "");
    card.setAttribute("aria-label","فتح الملاحظة " + (note.title || "بلا عنوان"));
    if (currentView !== "trash") card.addEventListener("click",()=>openNote(note.id));
    const top = document.createElement("div"); top.className = "note-card-top";
    const h = document.createElement("h3"); h.textContent = note.title.trim() || "ملاحظة بلا عنوان";
    top.append(h);
    if (note.favorite) { const fav = document.createElement("span"); fav.className = "fav-mark"; fav.textContent = "♥"; top.append(fav); }
    const preview = document.createElement("p"); preview.className = "note-preview"; preview.textContent = note.body.trim() || "لا توجد كلمات هنا بعد…";
    const bottom = document.createElement("div"); bottom.className = "note-card-bottom";
    const date = document.createElement("span"); date.textContent = formatDate(note.updated,{day:"numeric",month:"short"});
    const cat = document.createElement("span"); cat.className = "category-tag"; cat.textContent = labels[note.category] || "عام";
    bottom.append(date,cat); card.append(top,preview,bottom);
    if (currentView === "trash") {
      card.addEventListener("click",()=>{ currentId = note.id; openTrashActions(note); });
    }
    return card;
  }
  function renderListOnly() {
    const list = visibleNotes();
    els.list.replaceChildren();
    list.forEach(n=>els.list.append(makeCard(n)));
    const noNotes = list.length === 0;
    els.empty.classList.toggle("visible",noNotes);
    els.list.style.display = noNotes ? "none" : "flex";
    const copy = viewCopy[currentView] || viewCopy.all;
    els.viewTitle.textContent = copy[0];
    els.viewSubtitle.textContent = copy[1];
    els.summary.textContent = number(list.length) + (currentView==="trash"?" عناصر في السلة":" ملاحظات");
    $("allCount").textContent = number(notes.filter(n=>!n.deleted).length);
    $("favoriteCount").textContent = number(notes.filter(n=>!n.deleted&&n.favorite).length);
    $("trashCount").textContent = number(trash.length);
    if (currentView==="trash") {
      els.emptyTitle.textContent = "سلة المحذوفات فارغة";
      els.emptyMessage.textContent = "الملاحظات التي تحذفينها ستظهر هنا لتتمكني من استعادتها.";
      $("emptyNewBtn").style.display = "none";
    } else {
      els.emptyTitle.textContent = els.search.value ? "لم نعثر على هذه الملاحظة" : "مساحة بيضاء تنتظر كلماتك";
      els.emptyMessage.textContent = els.search.value ? "جرّبي كلمة أخرى أو امسحي البحث." : "ابدئي بملاحظة صغيرة، لا يلزم أن تكون الكلمات مثالية.";
      $("emptyNewBtn").style.display = "";
    }
  }
  function render() { renderListOnly(); }
  function openTrashActions(note) {
    askConfirm("ماذا تريدين أن تفعلي؟","يمكنك استعادة هذه الملاحظة أو حذفها نهائيًا.",()=>{
      trash = trash.filter(n=>n.id!==note.id);
      note.deleted = false; note.updated = now(); notes.unshift(note);
      persist(); render(); toast("تمت استعادة الملاحظة.");
    }, "استعادة", true, () => {
      trash = trash.filter(n=>n.id!==note.id);
      persist(); currentId=null; clearEditor(); render(); toast("حُذفت الملاحظة نهائيًا.");
    }, "حذف نهائي");
  }
  function askConfirm(title,text,okay,label="متابعة",showDanger=false,second=null,secondLabel="حذف نهائي") {
    $("confirmTitle").textContent=title; $("confirmText").textContent=text;
    const btn=$("confirmOkay"); btn.textContent=label; btn.className=showDanger?"secondary-btn":"danger-btn";
    const cancel=$("confirmCancel"); cancel.textContent="إلغاء";
    const dialogActions=$("confirmBackdrop").querySelector(".confirm-actions");
    let secondBtn=$("confirmSecond");
    if (secondBtn) secondBtn.remove();
    if (second) {
      secondBtn=document.createElement("button"); secondBtn.id="confirmSecond"; secondBtn.className="danger-btn"; secondBtn.textContent=secondLabel;
      secondBtn.addEventListener("click",()=>{closeConfirm();second();},{once:true});
      dialogActions.append(secondBtn);
    }
    confirmAction=okay;
    els.backdrop.hidden=false;
    btn.onclick=()=>{const action=confirmAction;closeConfirm();if(action)action();};
    cancel.onclick=closeConfirm;
  }
  function closeConfirm(){els.backdrop.hidden=true;confirmAction=null;}
  function clearEditor() {
    currentId=null; els.title.value=""; els.body.value=""; els.category.value="journal";
    $("noteDate").textContent="ملاحظة جديدة"; $("favoriteBtn").textContent="♡"; $("favoriteBtn").classList.remove("is-on");
    lastSaved=""; updateCounters(); setStatus("saved","جاهز للكتابة");
  }
  function deleteCurrent() {
    const note=activeNote(); if(!note)return;
    if(dirty) saveCurrent();
    askConfirm("نقل الملاحظة إلى السلة؟","يمكنك استعادتها لاحقًا من سلة المحذوفات.",()=>{
      clearTimeout(timer); notes=notes.filter(n=>n.id!==note.id); note.deleted=true;note.updated=now();trash.unshift(note);
      currentId=null;clearEditor();persist();render();toast("نُقلت الملاحظة إلى سلة المحذوفات.");
      showListOnMobile();
    },"نقل إلى السلة");
  }
  function toggleFavorite() {
    const note=activeNote(); if(!note)return;
    note.favorite=!note.favorite;note.updated=now();
    if(persist()){lastSaved=JSON.stringify([els.title.value,els.body.value,els.category.value,note.favorite]);$("favoriteBtn").textContent=note.favorite?"♥":"♡";$("favoriteBtn").classList.toggle("is-on",note.favorite);render();toast(note.favorite?"أُضيفت إلى المفضّلة":"أُزيلت من المفضّلة");}
  }
  function exportBackup() {
    saveCurrent();
    const blob=new Blob([JSON.stringify({app:"Ghaim",version:2,exportedAt:now(),notes,trash},null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="ghaim-notes-backup-"+new Date().toISOString().slice(0,10)+".json";
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("تم تجهيز النسخة الاحتياطية.");
  }
  function importBackup(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onerror=()=>toast("تعذّر قراءة الملف.");
    reader.onload=()=>{
      try {
        const data=JSON.parse(String(reader.result));
        const incoming=Array.isArray(data)?data:Array.isArray(data.notes)?data.notes:null;
        if(!incoming)throw new Error("invalid");
        const clean=incoming.map(normaliseNote).filter(Boolean);
        askConfirm("استيراد نسخة احتياطية؟","سيتم دمج "+number(clean.length)+" ملاحظة مع ملاحظاتك الحالية دون حذفها.",()=>{
          const existing=new Set([...notes,...trash].map(n=>n.id));
          clean.forEach(n=>{if(existing.has(n.id))n.id=makeId();n.deleted=false;notes.push(n);});
          if(Array.isArray(data.trash))trash.push(...data.trash.map(normaliseNote).filter(Boolean));
          persist();render();toast("تم استيراد النسخة الاحتياطية.");
        },"استيراد");
      }catch{toast("هذا الملف ليس نسخة احتياطية صالحة من الملاحظات.");}
      $("importFile").value="";
    };
    reader.readAsText(file);
  }
  function setView(view) {
    if (dirty) saveCurrent();
    currentView=view;
    document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    if(view==="trash"){els.editor.classList.add("editor-hidden");document.querySelector(".main-area").classList.add("trash-mode");currentId=null;showListOnMobile();}
    else if(!activeNote() || (view==="favorites"&&!activeNote().favorite) || ((view==="journal"||view==="ideas")&&activeNote().category!==view)) {
      const first=visibleNotes()[0];
      if(first)openNote(first.id);else {currentId=null;clearEditor();if(window.matchMedia("(max-width: 760px)").matches)els.editor.classList.add("editor-hidden");}
    }
    render();
    if(view!=="trash" && window.matchMedia("(max-width: 760px)").matches)showListOnMobile();
  }
  function initTheme() {
    let theme="light";try{theme=localStorage.getItem("ghaim-theme")||"light"}catch{}
    document.body.classList.toggle("dark-mode",theme==="dark");
    $("themeLabel").textContent=theme==="dark"?"الوضع النهاري":"الوضع الليلي";
    $("themeIcon").textContent=theme==="dark"?"☀":"☾";
  }
  $("newNoteBtn").addEventListener("click",newNote);
  $("mobileNewBtn").addEventListener("click",newNote);
  $("emptyNewBtn").addEventListener("click",newNote);
  els.title.addEventListener("input",scheduleSave);
  els.body.addEventListener("input",scheduleSave);
  els.category.addEventListener("change",scheduleSave);
  els.search.addEventListener("input",render);
  els.sort.addEventListener("change",render);
  $("favoriteBtn").addEventListener("click",toggleFavorite);
  $("deleteBtn").addEventListener("click",deleteCurrent);
  $("backBtn").addEventListener("click",showListOnMobile);
  $("focusBtn").addEventListener("click",()=>document.body.classList.toggle("focus-mode"));
  $("mobileMenuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("mobile-open"));
  $("themeBtn").addEventListener("click",()=>{
    const dark=!document.body.classList.contains("dark-mode");document.body.classList.toggle("dark-mode",dark);
    try{localStorage.setItem("ghaim-theme",dark?"dark":"light")}catch{}
    $("themeLabel").textContent=dark?"الوضع النهاري":"الوضع الليلي";$("themeIcon").textContent=dark?"☀":"☾";
  });
  $("exportBtn").addEventListener("click",exportBackup);
  $("importBtn").addEventListener("click",()=>$("importFile").click());
  $("importFile").addEventListener("change",e=>importBackup(e.target.files[0]));
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
  $("confirmCancel").addEventListener("click",closeConfirm);
  els.backdrop.addEventListener("click",e=>{if(e.target===els.backdrop)closeConfirm();});
  document.addEventListener("keydown",e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&e.key.toLowerCase()==="n"){e.preventDefault();newNote();}
    if(mod&&e.key.toLowerCase()==="k"){e.preventDefault();els.search.focus();}
    if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();saveCurrent();toast("تم حفظ الملاحظة.");}
    if(e.key==="Escape"){closeConfirm();document.body.classList.remove("focus-mode");$("sidebar").classList.remove("mobile-open");}
  });
  window.addEventListener("beforeunload",()=>{if(dirty)saveCurrent();});
  $("dateChip").textContent=formatDate(now(),{weekday:"short",day:"numeric",month:"short"});
  loadData();initTheme();
  // If the old diary was open, preserve its notes and open the most recent one.
  const first=notes.filter(n=>!n.deleted).sort((a,b)=>new Date(b.updated)-new Date(a.updated))[0];
  if(first)openNote(first.id);else{clearEditor();render();}
  render();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
  }
})();