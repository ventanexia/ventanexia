'use strict';
// Lectura del texto de los adjuntos de un pedido (PDF, Excel .xlsx, Word .docx, CSV, texto).
// Los adjuntos vienen de correos de terceros: se trata todo como NO fiable. Por eso:
//  - límites de tamaño, de páginas y de filas;
//  - Excel y Word se leen con un lector mínimo propio sobre el ZIP (sin ejecutar nada, sin macros);
//  - un PDF escaneado (sin texto) o una imagen no se "adivinan": se avisa de que no se ha podido leer.
const {unzipSync,strFromU8}=require('fflate');

const MAX_BYTES=8*1024*1024;
const MAX_CHARS=60000;
const MAX_ROWS=600;

function decodeText(buf){
  const u8=Buffer.isBuffer(buf)?buf:Buffer.from(buf);
  const utf8=u8.toString('utf8');
  if(!utf8.includes('\uFFFD'))return utf8.replace(/^\uFEFF/,'');
  return u8.toString('latin1');
}
function stripHtml(html=''){
  return String(html).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi,'\n').replace(/<\/t[dh]>/gi,' | ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
}
function xmlText(s=''){return String(s).replace(/&#x([0-9a-f]+);/gi,(_,h)=>{try{return String.fromCodePoint(parseInt(h,16))}catch{return ' '}}).replace(/&#(\d+);/g,(_,d)=>{try{return String.fromCodePoint(Number(d))}catch{return ' '}}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}

// ---- CSV (separador ; , tab o |, con comillas)
function parseCsv(text){
  const t=String(text||'').replace(/^\uFEFF/,'');
  const first=t.split(/\r?\n/).find(l=>l.trim())||'';
  const counts={';':0,',':0,'\t':0,'|':0};let q=false;
  for(const ch of first){if(ch==='"')q=!q;else if(!q&&counts[ch]!==undefined)counts[ch]++}
  const delim=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][1]>0?Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]:';';
  const rows=[];let row=[],cell='',inQ=false;
  for(let i=0;i<t.length;i++){
    const c=t[i];
    if(inQ){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++}else inQ=false}else cell+=c}
    else if(c==='"')inQ=true;
    else if(c===delim){row.push(cell);cell=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()!==''))rows.push(row);row=[];if(rows.length>=MAX_ROWS*5)break}
    else cell+=c;
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(x=>String(x).trim()!==''))rows.push(row)}
  return rows.map(r=>r.map(x=>String(x).trim()));
}

// ---- XLSX (lector mínimo)
function colIndex(ref){const m=String(ref).match(/^([A-Z]+)/);if(!m)return 0;let n=0;for(const ch of m[1])n=n*26+(ch.charCodeAt(0)-64);return n-1}
function readXlsx(buffer){
  const files=unzipSync(new Uint8Array(buffer),{filter:f=>/^xl\/(workbook\.xml|sharedStrings\.xml|worksheets\/sheet\d+\.xml|_rels\/workbook\.xml\.rels)$/.test(f.name)&&f.originalSize<20*1024*1024});
  const shared=[];
  if(files['xl/sharedStrings.xml']){
    const x=strFromU8(files['xl/sharedStrings.xml']);
    for(const si of x.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g))shared.push(xmlText([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join('')));
  }
  const names=[];
  if(files['xl/workbook.xml'])for(const m of strFromU8(files['xl/workbook.xml']).matchAll(/<sheet [^>]*name="([^"]*)"/g))names.push(xmlText(m[1]));
  const sheets=Object.keys(files).filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a,b)=>parseInt(a.match(/(\d+)\.xml/)[1])-parseInt(b.match(/(\d+)\.xml/)[1])).slice(0,3);
  const out=[];
  sheets.forEach((k,si)=>{
    const x=strFromU8(files[k]);const rows=[];
    for(const rm of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
      const cells=[];
      for(const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const attrs=cm[1],body=cm[2]||'';const ref=(attrs.match(/r="([A-Z]+\d+)"/)||[])[1]||'';const t=(attrs.match(/t="(\w+)"/)||[])[1]||'';
        let val='';
        if(t==='s'){const v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];val=shared[Number(v)]??''}
        else if(t==='inlineStr')val=xmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join(''));
        else{const v=(body.match(/<v>([\s\S]*?)<\/v>/)||[])[1];val=v===undefined?'':xmlText(v)}
        cells[colIndex(ref)]=String(val).trim();
      }
      if(cells.some(c=>c!==undefined&&c!==''))rows.push(Array.from(cells,c=>c===undefined?'':c));
      if(rows.length>=MAX_ROWS)break;
    }
    out.push({name:names[si]||('Hoja '+(si+1)),rows});
  });
  return out;
}
function readDocx(buffer){
  const files=unzipSync(new Uint8Array(buffer),{filter:f=>f.name==='word/document.xml'&&f.originalSize<20*1024*1024});
  if(!files['word/document.xml'])return '';
  const x=strFromU8(files['word/document.xml']);
  return xmlText(x.replace(/<\/w:p>/g,'\n').replace(/<w:tab\/>/g,' ').replace(/<\/w:tc>/g,' | ').replace(/<[^>]+>/g,'')).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
}
async function readPdf(buffer){
  const pdfjs=require('pdfjs-dist/legacy/build/pdf.js');
  const data=new Uint8Array(Buffer.from(buffer));
  const doc=await pdfjs.getDocument({data,useSystemFonts:true,isEvalSupported:false,disableFontFace:true,verbosity:0}).promise;
  let out='';
  try{
    for(let i=1;i<=Math.min(doc.numPages,20);i++){
      const page=await doc.getPage(i);const tc=await page.getTextContent();const lines={};
      for(const it of tc.items){if(!it.str)continue;const y=Math.round(it.transform[5]/2);(lines[y]=lines[y]||[]).push([it.transform[4],it.str])}
      out+=Object.keys(lines).map(Number).sort((a,b)=>b-a).map(y=>lines[y].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean).join('\n')+'\n';
    }
  }finally{try{await doc.destroy()}catch{}}
  return out.trim();
}

function kindOf(name='',mime=''){
  const n=String(name).toLowerCase(),m=String(mime).toLowerCase();
  if(/\.pdf$/.test(n)||m==='application/pdf')return 'pdf';
  if(/\.xlsx$/.test(n)||m.includes('spreadsheetml'))return 'xlsx';
  if(/\.xls$/.test(n)||m==='application/vnd.ms-excel')return 'xls';
  if(/\.docx$/.test(n)||m.includes('wordprocessingml'))return 'docx';
  if(/\.(csv|tsv)$/.test(n)||m==='text/csv')return 'csv';
  if(/\.(txt|json|xml|md)$/.test(n)||m==='text/plain'||m==='application/json'||m==='application/xml'||m==='text/xml')return 'text';
  if(/\.html?$/.test(n)||m==='text/html')return 'html';
  if(/\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(n)||m.startsWith('image/'))return 'image';
  return 'other';
}
function isReadable(name,mime){return ['pdf','xlsx','csv','text','html','docx'].includes(kindOf(name,mime))}

async function extractText({name,mime,buffer}){
  const kind=kindOf(name,mime);const base={name:String(name||'adjunto'),kind};
  try{
    if(kind==='image')return {...base,text:'',issue:'imagen: no se lee sin OCR'};
    if(kind==='other')return {...base,text:'',issue:'formato no soportado'};
    if(kind==='xls')return {...base,text:'',issue:'formato .xls antiguo no soportado: guárdalo como .xlsx'};
    if(!buffer||!buffer.length)return {...base,text:'',issue:'vacío'};
    if(buffer.length>MAX_BYTES)return {...base,text:'',issue:'demasiado grande (más de 8 MB)'};
    if(kind==='pdf'){
      const text=await readPdf(buffer);
      if(text.replace(/\s/g,'').length<30)return {...base,text:'',issue:'PDF sin texto (probablemente escaneado): no se puede leer sin OCR'};
      return {...base,text:text.slice(0,MAX_CHARS)};
    }
    if(kind==='xlsx'){
      const sheets=readXlsx(buffer);
      const rows=sheets.flatMap(s=>s.rows);
      if(!rows.length)return {...base,text:'',issue:'Excel sin datos'};
      const text=sheets.map(s=>'HOJA '+s.name+'\n'+s.rows.map(r=>r.join(' | ')).join('\n')).join('\n\n');
      return {...base,text:text.slice(0,MAX_CHARS),rows:sheets[0].rows,sheets};
    }
    if(kind==='docx'){const text=readDocx(buffer);return text?{...base,text:text.slice(0,MAX_CHARS)}:{...base,text:'',issue:'Word sin texto'}}
    if(kind==='csv'){const rows=parseCsv(decodeText(buffer));return {...base,text:rows.map(r=>r.join(' | ')).join('\n').slice(0,MAX_CHARS),rows}}
    if(kind==='text')return {...base,text:decodeText(buffer).slice(0,MAX_CHARS)};
    if(kind==='html')return {...base,text:stripHtml(decodeText(buffer)).slice(0,MAX_CHARS)};
    return {...base,text:'',issue:'formato no soportado'};
  }catch(e){return {...base,text:'',issue:'no se pudo leer ('+String(e?.message||e).slice(0,80)+')'}}
}

async function readTableBuffer(name,buffer){
  const k=kindOf(name);
  if(k==='xlsx'){const s=readXlsx(buffer);return s[0]?.rows||[]}
  if(k==='csv'||k==='text')return parseCsv(decodeText(buffer));
  throw new Error('Formato no soportado para listas: usa .xlsx o .csv');
}

module.exports={extractText,readTableBuffer,kindOf,isReadable,parseCsv,readXlsx,stripHtml,decodeText,MAX_BYTES};
