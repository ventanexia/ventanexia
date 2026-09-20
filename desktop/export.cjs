const {ipcMain,dialog,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');

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
  const blocks=Array.isArray(payload.blocks)?payload.blocks.map(b=>({type:String(b?.type||'paragraph'),text:String(b?.text||''),marker:String(b?.marker||'')})):[];
  return {title,headers,rows,text,blocks};
}
function spreadsheetXml(data){
  const header=data.headers.map(v=>`<Cell><Data ss:Type="String">${escXml(v)}</Data></Cell>`).join('');
  const body=data.rows.map(row=>`<Row>${data.headers.map((_,i)=>`<Cell><Data ss:Type="String">${escXml(row[i]??'')}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Datos"><Table><Row>${header}</Row>${body}</Table></Worksheet></Workbook>`;
}
function htmlDocument(data){
  let body='';
  if(data.blocks?.length){
    body=data.blocks.map(b=>{
      if(b.type==='heading')return `<h2>${escHtml(b.text)}</h2>`;
      if(b.type==='subheading')return `<h3>${escHtml(b.text)}</h3>`;
      if(b.type==='bullet')return `<div class="item"><span>•</span><p>${escHtml(b.text)}</p></div>`;
      if(b.type==='number')return `<div class="item"><span>${escHtml(b.marker)}</span><p>${escHtml(b.text)}</p></div>`;
      return `<p>${escHtml(b.text)}</p>`;
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
    h1{font-size:20pt;line-height:1.15;margin:5px 0 9px;color:#102235}
    .rule{height:1.5px;background:#dce6ed;margin:0 0 18px}
    h2{font-size:13pt;color:#123b58;margin:18px 0 7px;page-break-after:avoid}
    h3{font-size:11pt;color:#345b73;margin:13px 0 5px;page-break-after:avoid}
    p{margin:0 0 9px;white-space:pre-wrap}
    .item{display:grid;grid-template-columns:22px 1fr;gap:3px;margin:0 0 6px;page-break-inside:avoid}
    .item span{font-weight:700;color:#2274a0}.item p{margin:0}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:1px solid #d8e2ea;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3f7}
    footer{margin-top:22px;padding-top:8px;border-top:1px solid #e4ebf0;font-size:8pt;color:#6e7d89}
  </style></head><body><div class="brand">VentaNexIA</div><h1>${escHtml(data.title)}</h1><div class="rule"></div>${body}<footer>Generado por VentaNexIA</footer></body></html>`;
}

ipcMain.handle('export:data',async(_e,payload={})=>{
  const format=payload.format==='pdf'?'pdf':'excel';
  const data=normalizePayload(payload);
  const ext=format==='pdf'?'pdf':'xls';
  const result=await dialog.showSaveDialog({title:`Guardar ${format==='pdf'?'PDF':'Excel'}`,defaultPath:`${data.title}.${ext}`,filters:[format==='pdf'?{name:'PDF',extensions:['pdf']}:{name:'Excel',extensions:['xls']} ]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  if(format==='excel'){
    await fs.writeFile(result.filePath,spreadsheetXml(data),'utf8');
  }else{
    const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
    try{
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlDocument(data))}`);
      const pdf=await win.webContents.printToPDF({printBackground:true,pageSize:'A4',landscape:data.headers.length>6});
      await fs.writeFile(result.filePath,pdf);
    }finally{if(!win.isDestroyed())win.destroy()}
  }
  return {ok:true,path:result.filePath,format};
});
