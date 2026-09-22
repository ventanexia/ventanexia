const {ipcMain,dialog,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const {zipSync,strToU8}=require('fflate');

function escXml(v=''){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function escHtml(v=''){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function safeTitle(v='VentaNexIA exportación'){return String(v||'VentaNexIA exportación').replace(/[\\/:*?"<>|]/g,'-').slice(0,90)}
function normalizePayload(payload={}){
  const title=safeTitle(payload.title||'VentaNexIA exportación');
  let headers=Array.isArray(payload.headers)?payload.headers.map(x=>String(x??'')):[];
  let rows=Array.isArray(payload.rows)?payload.rows.map(r=>Array.isArray(r)?r.map(x=>String(x??'')):[String(r??'')]):[];
  const text=String(payload.text||'').trim();
  if(!rows.length&&text){
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const split=lines.map(line=>line.includes(' · ')?line.split(' · ').map(x=>x.trim()):[line]);
    const width=Math.max(1,...split.map(r=>r.length));
    rows=split.map(r=>[...r,...Array(Math.max(0,width-r.length)).fill('')]);
    if(!headers.length)headers=width>1?Array.from({length:width},(_,i)=>`Campo ${i+1}`):['Resultado'];
  }
  if(!headers.length&&rows.length)headers=Array.from({length:Math.max(...rows.map(r=>r.length))},(_,i)=>`Campo ${i+1}`);
  const blocks=Array.isArray(payload.blocks)?payload.blocks.map(b=>({
    type:String(b?.type||'paragraph'),
    text:String(b?.text||''),
    marker:String(b?.marker||''),
    label:String(b?.label||''),
    fields:Array.isArray(b?.fields)?b.fields.map(f=>({label:String(f?.label||''),value:String(f?.value||'')})):[]
  })):[];
  return {title,headers,rows,text,blocks};
}
function colName(n){let s='';for(let x=n+1;x;x=Math.floor((x-1)/26))s=String.fromCharCode(65+((x-1)%26))+s;return s}
function xlsxBuffer(data){
  const widths=data.headers.map((_,i)=>i===3?70:i===0?24:18);
  const rows=[data.headers,...data.rows];
  const sheetRows=rows.map((row,ri)=>{
    const cells=data.headers.map((_,ci)=>{
      const v=String(row[ci]??'');
      const ref=colName(ci)+(ri+1);
      const style=ri===0?1:2;
      return `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escXml(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri+1}">${cells}</row>`;
  }).join('');
  const cols=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
  const files={
    '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Informe" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE8EF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="thin"><color rgb="FFE5EBEF"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`
  };
  const input={};for(const [k,v] of Object.entries(files))input[k]=strToU8(v);
  return Buffer.from(zipSync(input,{level:6}));
}
function htmlDocument(data){
  let body='';
  if(data.blocks?.length){
    body=data.blocks.map(b=>{
      if(b.type==='heading')return `<h2>${escHtml(b.text)}</h2>`;
      if(b.type==='subheading')return `<h3>${escHtml(b.text)}</h3>`;
      if(b.type==='record')return `<div class="record">${(b.fields||[]).map(f=>`<div><b>${escHtml(f.label)}</b><span>${escHtml(f.value)}</span></div>`).join('')}</div>`;
      if(b.type==='fact')return `<div class="fact">${b.label?`<b>${escHtml(b.label)}</b>`:''}<span>${escHtml(b.text)}</span></div>`;
      if(b.type==='question')return `<div class="question"><span>?</span><p>${escHtml(b.text)}</p></div>`;
      if(b.type==='bullet')return `<div class="item"><span>•</span><p>${escHtml(b.text)}</p></div>`;
      if(b.type==='number')return `<div class="item"><span>${escHtml(b.marker)}</span><p>${escHtml(b.text)}</p></div>`;
      return `<div class="item"><span>•</span><p>${escHtml(b.text)}</p></div>`;
    }).join('');
  }else if(data.text){
    body=`<p>${escHtml(data.text)}</p>`;
  }else{
    body=`<table><thead><tr>${data.headers.map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${data.headers.map((_,i)=>`<td>${escHtml(r[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:A4;margin:18mm 17mm 16mm}
    body{font-family:Arial,sans-serif;color:#203246;margin:0;font-size:11.5pt;line-height:1.5}
    .brand{font-size:9pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#4b6f86}
    h1{font-size:20pt;line-height:1.15;margin:5px 0 4px;color:#102235}
    .subtitle{font-size:8.5pt;color:#748595;margin:0 0 10px}
    .rule{height:1.5px;background:#dce6ed;margin:0 0 18px}
    h2{font-size:13pt;color:#123b58;margin:18px 0 8px;padding:6px 8px;background:#edf5f9;border-left:3px solid #2274a0;page-break-after:avoid}
    h3{font-size:11pt;color:#345b73;margin:13px 0 6px;padding-bottom:4px;border-bottom:1px solid #dce7ed;page-break-after:avoid}
    p{margin:0;white-space:pre-wrap}
    .item{display:grid;grid-template-columns:22px 1fr;gap:4px;margin:0 0 6px;page-break-inside:avoid}
    .item span{font-weight:700;color:#2274a0}.item p{margin:0}
    .record{border:1px solid #dce7ed;border-radius:7px;padding:8px 10px;margin:0 0 8px;background:#fbfdfe;page-break-inside:avoid}
    .record>div{display:grid;grid-template-columns:112px 1fr;gap:8px;padding:2.5px 0;font-size:10.5pt;line-height:1.4}
    .record b{color:#31566f}.record span{white-space:pre-wrap}
    .fact{display:grid;grid-template-columns:120px 1fr;gap:8px;padding:5px 0;border-bottom:1px solid #edf1f4;page-break-inside:avoid}
    .fact b{color:#294b62}.fact span{white-space:pre-wrap}
    .question{display:grid;grid-template-columns:22px 1fr;gap:4px;background:#fff8e8;border:1px solid #f1d79c;border-radius:6px;padding:7px 8px;margin:6px 0;page-break-inside:avoid}
    .question>span{font-weight:700;color:#a46a00}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #d8e2ea;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3f7}
    footer{margin-top:22px;padding-top:8px;border-top:1px solid #e4ebf0;font-size:8pt;color:#6e7d89}
  </style></head><body><div class="brand">VentaNexIA</div><h1>${escHtml(data.title)}</h1><div class="subtitle">Resumen de trabajo · información ordenada para decidir rápido</div><div class="rule"></div>${body}<footer>Generado por VentaNexIA</footer></body></html>`;
}

ipcMain.handle('export:data',async(_e,payload={})=>{
  const format=payload.format==='pdf'?'pdf':payload.format==='print'?'print':'excel';
  const data=normalizePayload(payload);
  if(format==='print'){
    const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    try{
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDocument(data))}`);
      const ok=await new Promise((resolve,reject)=>win.webContents.print({silent:false,printBackground:true},(success,reason)=>success?resolve(true):reject(new Error(reason||'No se pudo imprimir'))));
      return {ok,format:'print'};
    }finally{if(!win.isDestroyed())win.destroy()}
  }
  const ext=format==='pdf'?'pdf':'xlsx';
  const result=await dialog.showSaveDialog({title:`Guardar ${format==='pdf'?'PDF':'Excel'}`,defaultPath:`${data.title}.${ext}`,filters:[format==='pdf'?{name:'PDF',extensions:['pdf']}:{name:'Excel',extensions:['xlsx']} ]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  if(format==='excel')await fs.writeFile(result.filePath,xlsxBuffer(data));
  else{
    const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    try{
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDocument(data))}`);
      const pdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',landscape:data.headers.length>6});
      await fs.writeFile(result.filePath,pdf);
    }finally{if(!win.isDestroyed())win.destroy()}
  }
  return {ok:true,path:result.filePath,format};
});
