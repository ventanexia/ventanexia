function expectedOrigin(){
  try{return new URL(process.env.PUBLIC_APP_URL||"https://www.ventanexia.es").origin}catch{return ""}
}
export function requireSameOrigin(req){
  const method=String(req.method||"GET").toUpperCase();
  if(["GET","HEAD","OPTIONS"].includes(method)) return true;
  const origin=String(req.headers?.origin||"");
  if(!origin) return false;
  return origin===expectedOrigin();
}
