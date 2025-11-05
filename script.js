// script.js — FlowMRP (client-side MRP calculator)
// Features: Items & BOM, demand & receipts, MRP explosion, LFL/FOQ, safety stock, lead time offset, CSV export, print, demo data

// ---------- State ----------
const state = {
  periods: 8,
  startLabel: 'W1',
  items: {}, // itemId -> { id, desc, lt, lot, foq, ss, oh }
  bom: [],   // [{parent, child, qty}]
  demand: {}, // itemId -> [p1..pn]
  receipts: {}, // itemId -> [p1..pn]
  results: {}, // itemId -> table rows per period
};

// ---------- Shortcuts ----------
const qs = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];
const toast = (t)=>M.toast({html:t, classes:'rounded'});

// ---------- UI helpers ----------
function periodLabels(){
  const arr=[]; const base = state.startLabel.replace(/\d+/,'');
  let num = Number(state.startLabel.replace(/[^\d]/g,'')) || 1;
  for(let i=0;i<state.periods;i++) arr.push(base + (num+i));
  return arr;
}

function buildMiniTable(title, id, rows){
  const wrap = document.createElement('div');
  wrap.className = 'table-card p-3';
  wrap.innerHTML = `<div class="flex items-center justify-between mb-2"><h4 class="font-semibold">${title}</h4></div>`;
  const table = document.createElement('table');
  table.className = 'table-mini striped';
  const thead = document.createElement('thead');
  const head = ['Item', ...periodLabels()];
  thead.innerHTML = `<tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="font-medium">${r.item}</td>${r.values.map((v,i)=>`<td><div class="cell-edit" contenteditable data-item="${r.item}" data-idx="${i}" data-type="${id}">${v}</div></td>`).join('')}`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return wrap.appendChild(table), wrap;
}

function renderDemandAndReceipts(){
  const labels = periodLabels();
  const items = Object.values(state.items).map(x=>x.id);
  // Demand
  const dRows = items.map(it=>({ item: it, values: (state.demand[it]||Array(state.periods).fill(0)) }));
  const dTable = buildMiniTable('Independent Demand', 'demand', dRows);
  const dWrap = qs('#demandWrap'); dWrap.innerHTML=''; dWrap.appendChild(dTable);
  // Receipts
  const rRows = items.map(it=>({ item: it, values: (state.receipts[it]||Array(state.periods).fill(0)) }));
  const rTable = buildMiniTable('Scheduled Receipts', 'receipts', rRows);
  const rWrap = qs('#receiptsWrap'); rWrap.innerHTML=''; rWrap.appendChild(rTable);

  // Bind edits
  qsa('[data-type="demand"]').forEach(c=>c.addEventListener('input', onCellEdit));
  qsa('[data-type="receipts"]').forEach(c=>c.addEventListener('input', onCellEdit));
}

function renderItems(){
  const tb = qs('#itemsTable tbody'); tb.innerHTML='';
  Object.values(state.items).forEach(it=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.id}</td>
      <td>${it.desc||''}</td>
      <td>${it.lt}</td>
      <td><span class="tag">${it.lot}</span></td>
      <td>${it.foq||''}</td>
      <td>${it.ss||0}</td>
      <td>${it.oh||0}</td>
      <td>
        <button class="btn-flat" data-edit-item="${it.id}"><i class="material-icons">edit</i></button>
        <button class="btn-flat" data-del-item="${it.id}"><i class="material-icons">delete</i></button>
      </td>`;
    tb.appendChild(tr);
  });
  qsa('[data-edit-item]').forEach(b=>b.addEventListener('click', openEditItem));
  qsa('[data-del-item]').forEach(b=>b.addEventListener('click', delItem));
}

function renderBOM(){
  const tb = qs('#bomTable tbody'); tb.innerHTML='';
  state.bom.forEach((b,idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${b.parent}</td><td>${b.child}</td><td>${b.qty}</td>
      <td><button class="btn-flat" data-del-bom="${idx}"><i class="material-icons">delete</i></button></td>`;
    tb.appendChild(tr);
  });
  qsa('[data-del-bom]').forEach(b=>b.addEventListener('click', (e)=>{ const i=Number(e.currentTarget.dataset.delBom); state.bom.splice(i,1); renderBOM(); }));
}

function onCellEdit(e){
  const el = e.currentTarget; const item = el.dataset.item; const idx = Number(el.dataset.idx); const type = el.dataset.type;
  const val = Number(el.textContent.replace(/[^\d.-]/g,''))||0;
  const arr = (type==='demand'? (state.demand[item] = state.demand[item]||Array(state.periods).fill(0))
                            : (state.receipts[item] = state.receipts[item]||Array(state.periods).fill(0)));
  arr[idx] = val;
}

// ---------- Item & BOM Modals ----------
let editingItemId = null;
function openAddItem(){ editingItemId=null; qs('#itemId').value=''; qs('#itemDesc').value=''; qs('#itemLT').value=1; qs('#itemLot').value='LFL'; qs('#itemFOQ').value=50; qs('#itemSS').value=0; qs('#itemOH').value=0; M.updateTextFields(); M.Modal.getInstance(qs('#itemModal')).open(); }
function openEditItem(e){ const id = e.currentTarget.dataset.editItem; const it = state.items[id]; editingItemId=id; qs('#itemId').value=it.id; qs('#itemDesc').value=it.desc||''; qs('#itemLT').value=it.lt; qs('#itemLot').value=it.lot; qs('#itemFOQ').value=it.foq||50; qs('#itemSS').value=it.ss||0; qs('#itemOH').value=it.oh||0; M.updateTextFields(); M.Modal.getInstance(qs('#itemModal')).open(); }
function delItem(e){ const id = e.currentTarget.dataset.delItem; delete state.items[id]; state.bom = state.bom.filter(x=>x.parent!==id && x.child!==id); delete state.demand[id]; delete state.receipts[id]; renderItems(); renderBOM(); renderDemandAndReceipts(); }

function saveItem(){
  const id = qs('#itemId').value.trim(); if(!id) return toast('Item code is required');
  const data = { id,
    desc: qs('#itemDesc').value.trim(),
    lt: Number(qs('#itemLT').value)||0,
    lot: qs('#itemLot').value,
    foq: Number(qs('#itemFOQ').value)||0,
    ss: Number(qs('#itemSS').value)||0,
    oh: Number(qs('#itemOH').value)||0,
  };
  if(editingItemId && editingItemId!==id){ delete state.items[editingItemId]; }
  state.items[id] = data; renderItems(); renderDemandAndReceipts();
}

function openAddBom(){ qs('#bomParent').value=''; qs('#bomChild').value=''; qs('#bomQty').value=1; M.updateTextFields(); M.Modal.getInstance(qs('#bomModal')).open(); }
function saveBom(){
  const p = qs('#bomParent').value.trim(); const c = qs('#bomChild').value.trim(); const q = Number(qs('#bomQty').value)||0;
  if(!state.items[p] || !state.items[c]) return toast('Both parent and component must exist');
  if(p===c) return toast('Parent and component cannot be same');
  state.bom.push({parent:p, child:c, qty:q}); renderBOM();
}

// ---------- MRP Core ----------
function parentsOf(child){ return state.bom.filter(x=>x.child===child).map(x=>x.parent); }
function childrenOf(parent){ return state.bom.filter(x=>x.parent===parent).map(x=>({id:x.child, qty:x.qty})); }

function topoOrder(){
  // Simple Kahn: items with no parents first
  const items = Object.keys(state.items);
  const indeg = Object.fromEntries(items.map(i=>[i,0]));
  state.bom.forEach(b=> indeg[b.child] = (indeg[b.child]||0)+1 );
  const q = items.filter(i=>!indeg[i]);
  const out=[]; const edges = state.bom.map(b=>({...b}));
  while(q.length){ const n=q.shift(); out.push(n); for(const e of edges.filter(e=>e.parent===n)){ indeg[e.child]--; if(indeg[e.child]===0) q.push(e.child); } }
  // append any remaining (to avoid empty):
  items.forEach(i=>{ if(!out.includes(i)) out.push(i); });
  return out;
}

function runMRP(){
  const P = state.periods; const labels = periodLabels();
  const results = {}; // item -> {GR, SR, OH, NR, PORcpt, PORel}
  const getArr = ()=>Array(P).fill(0);

  // Seed independent demand & receipts and initial on-hand
  for(const it of Object.keys(state.items)){
    results[it] = { GR:getArr(), SR:getArr(), OH:getArr(), NR:getArr(), PORcpt:getArr(), PORel:getArr() };
    if(state.demand[it]) results[it].GR = [...state.demand[it]];
    if(state.receipts[it]) results[it].SR = [...state.receipts[it]];
  }

  // Process items level by level (parents first to drive children demand)
  const order = topoOrder();

  for(const it of order){
    const m = state.items[it]; const r = results[it];
    let onhand = m.oh||0; const ss = m.ss||0; const lt = Math.max(0, m.lt||0);

    for(let t=0;t<P;t++){
      // Available at start of period t
      onhand += r.PORcpt[t] + r.SR[t];
      // Satisfy gross req
      const gross = r.GR[t]||0;
      const projected = onhand - gross;
      // Maintain safety stock end of period
      if(projected < ss){
        const need = ss - projected; // net requirements for receipt in t
        const receiptQty = (m.lot==='FOQ' && m.foq>0) ? Math.ceil(need / m.foq) * m.foq : need;
        r.NR[t] = need;
        r.PORcpt[t] = receiptQty;
        // Offset release by lead time
        const relIdx = t - lt;
        if(relIdx >= 0) r.PORel[relIdx] += receiptQty; // planned order release
        onhand += receiptQty; // increase to cover this period
      }
      // Ending on-hand
      onhand -= gross;
      r.OH[t] = onhand;
    }

    // Drive component GR from this parent's planned order releases
    const kids = childrenOf(it);
    if(kids.length){
      for(let t=0;t<P;t++){
        const rel = r.PORel[t]||0;
        if(rel>0){
          for(const k of kids){
            const child = results[k.id] || (results[k.id] = { GR:getArr(), SR:getArr(), OH:getArr(), NR:getArr(), PORcpt:getArr(), PORel:getArr() });
            const offsetIdx = t + (state.items[k.id]?.lt||0); // child receipt when parent starts? here we accumulate GR at child's needed period = parent's release period
            if(offsetIdx < P) child.GR[offsetIdx] += rel * k.qty;
          }
        }
      }
    }
  }

  state.results = results;
  renderResults();
  toast('MRP run completed.');
}

function renderResults(){
  const wrap = qs('#results'); wrap.innerHTML='';
  const labels = periodLabels();
  const items = Object.keys(state.items);
  items.forEach(it=>{
    const r = state.results[it] || { GR:[], SR:[], OH:[], NR:[], PORcpt:[], PORel:[] };
    const card = document.createElement('div');
    card.className = 'table-card p-3';
    const head = `<div class="flex items-center justify-between mb-2"><div><h4 class="font-semibold">${it} — ${state.items[it].desc||''}</h4><div class="text-slate-600 text-sm">LT ${state.items[it].lt} • ${state.items[it].lot}${state.items[it].lot==='FOQ'? ' '+state.items[it].foq:''} • SS ${state.items[it].ss} • OH ${state.items[it].oh}</div></div></div>`;
    const table = document.createElement('table'); table.className='table-mini striped';
    const thead = document.createElement('thead'); thead.innerHTML = `<tr><th>Row</th>${labels.map(l=>`<th>${l}</th>`).join('')}</tr>`;
    const tbody = document.createElement('tbody');
    const rows = [ ['GR', r.GR], ['SR', r.SR], ['OH', r.OH], ['NR', r.NR], ['PO Rcpt', r.PORcpt], ['PO Rel', r.PORel] ];
    rows.forEach(([name, arr])=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="font-medium">${name}</td>${arr.map(v=>`<td class="text-right">${v||0}</td>`).join('')}`;
      tbody.appendChild(tr);
    });
    table.appendChild(thead); table.appendChild(tbody);
    card.innerHTML = head; card.appendChild(table);
    wrap.appendChild(card);
  });
}

// ---------- CSV Export ----------
function exportCSV(){
  const labels = periodLabels();
  const rows = [ ['Item','Row',...labels] ];
  for(const it of Object.keys(state.items)){
    const r = state.results[it] || { GR:[], SR:[], OH:[], NR:[], PORcpt:[], PORel:[] };
    const add = (name, arr)=> rows.push([it, name, ...labels.map((_,i)=>arr[i]||0)]);
    add('GR', r.GR); add('SR', r.SR); add('OH', r.OH); add('NR', r.NR); add('PO Rcpt', r.PORcpt); add('PO Rel', r.PORel);
  }
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'flowmrp_results.csv'; a.click();
}

// ---------- Demo Data ----------
function loadDemo(){
  state.periods = 8; qs('#periods').value='8'; state.startLabel='W1'; qs('#startLabel').value='W1';
  state.items = {
    'A': {id:'A', desc:'Finished Assembly', lt:1, lot:'LFL', foq:0, ss:0, oh:20},
    'B': {id:'B', desc:'Subassembly B', lt:1, lot:'FOQ', foq:50, ss:10, oh:10},
    'C': {id:'C', desc:'Component C', lt:0, lot:'LFL', foq:0, ss:0, oh:50},
    'D': {id:'D', desc:'Component D', lt:0, lot:'FOQ', foq:30, ss:0, oh:0},
  };
  state.bom = [ {parent:'A', child:'B', qty:1}, {parent:'A', child:'C', qty:2}, {parent:'B', child:'D', qty:3} ];
  state.demand = { 'A': [0, 40, 30, 60, 0, 40, 0, 20] };
  state.receipts = { 'B': [0, 0, 0, 0, 50, 0, 0, 0] };
  renderItems(); renderBOM(); renderDemandAndReceipts(); renderResults();
  toast('Demo data loaded.');
}

// ---------- Wiring ----------
window.addEventListener('DOMContentLoaded', ()=>{
  M.Modal.init(qs('#itemModal')); M.Modal.init(qs('#bomModal'));
  qs('#addItemBtn').addEventListener('click', openAddItem);
  qs('#saveItem').addEventListener('click', saveItem);
  qs('#addBomBtn').addEventListener('click', openAddBom);
  qs('#saveBom').addEventListener('click', saveBom);
  qs('#runMrp').addEventListener('click', runMRP);
  qs('#loadDemo').addEventListener('click', loadDemo);
  qs('#exportCsv').addEventListener('click', exportCSV);
  qs('#printBtn').addEventListener('click', ()=>window.print());

  qs('#periods').addEventListener('change', ()=>{ state.periods = Number(qs('#periods').value); renderDemandAndReceipts(); renderResults(); });
  qs('#startLabel').addEventListener('input', ()=>{ state.startLabel = qs('#startLabel').value || 'W1'; renderDemandAndReceipts(); renderResults(); });

  // First render with empty data
  renderItems(); renderBOM(); renderDemandAndReceipts(); renderResults();
});
