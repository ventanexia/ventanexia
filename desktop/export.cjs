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
  return {title,headers,rows,text};
}
function spreadsheetXml(data){
  const header=data.headers.map(v=>`<Cell><Data ss:Type="String">${escXml(v)}</Data></Cell>`).join('');
  const body=data.rows.map(row=>`<Row>${data.headers.map((_,i)=>`<Cell><Data ss:Type="String">${escXml(row[i]??'')}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Datos"><Table><Row>${header}</Row>${body}</Table></Worksheet></Workbook>`;
}
function htmlDocument(data){
  const table=data.rows.length?`<table><thead><tr>${data.headers.map(h=>`<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(r=>`<tr>${data.headers.map((_,i)=>`<td>${escHtml(r[i]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<pre>${escHtml(data.text)}</pre>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:28px;color:#13233a}h1{font-size:22px;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #d8e2ea;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eef3f7}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px}</style></head><body><h1>${escHtml(data.title)}</h1>${table}<p style="margin-top:18px;font-size:10px;color:#667">Generado por VentaNexIA</p></body></html>`;
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
