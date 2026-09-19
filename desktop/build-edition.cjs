const fs=require('node:fs');
const path=require('node:path');

const edition=String(process.env.VNX_BUILD_EDITION||'').trim().toLowerCase();
if(!['master','customer'].includes(edition)){
  console.error('VNX_BUILD_EDITION must be master or customer');
  process.exit(2);
}
const out="module.exports={EDITION:"+JSON.stringify(edition)+"};\n";
fs.writeFileSync(path.join(__dirname,'edition.generated.cjs'),out,'utf8');
console.log('VentaNexIA build edition:',edition);
