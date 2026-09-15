function originOf(value){
  if(!value)return "";
  try{return new URL(value.includes("://")?value:`https://${value}`).origin}catch{return ""}
}
function expectedOrigins(){
  return new Set([
    originOf(process.env.PUBLIC_APP_URL||"https://www.ventanexia.es"),
    originOf(process.env.VERCEL_URL),
    originOf(process.env.VERCEL_BRANCH_URL),
    originOf(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  ].filter(Boolean));
}
export function requireSameOrigin(req){
  const method=String(req.method||"GET").toUpperCase();
  if(["GET","HEAD","OPTIONS"].includes(method))return true;
  const origin=originOf(String(req.headers?.origin||""));
  return Boolean(origin)&&expectedOrigins().has(origin);
}
