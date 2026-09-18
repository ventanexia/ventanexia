import {connector,sbFetch,callbackUrl} from "./oauth-common.js";

export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método no permitido"});
  const out={
    ok:true,
    googleClientId:Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
    googleClientSecret:Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    supabaseUrl:Boolean(process.env.SUPABASE_URL),
    supabaseServiceRole:Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    callback:callbackUrl("gmail"),
    connector:false,
    database:false,
    error:null
  };
  try{
    const cfg=connector("gmail");
    out.connector=Boolean(cfg.clientId&&cfg.clientSecret&&cfg.auth&&cfg.token);
  }catch(e){out.error="CONNECTOR:"+String(e?.message||e).slice(0,180)}
  try{
    await sbFetch("vnx_oauth_sessions?select=state&limit=1");
    out.database=true;
  }catch(e){
    out.error=(out.error?out.error+" | ":"")+"DB:"+String(e?.message||e).slice(0,240);
  }
  out.ok=out.googleClientId&&out.googleClientSecret&&out.supabaseUrl&&out.supabaseServiceRole&&out.connector&&out.database;
  res.setHeader("Cache-Control","no-store");
  return res.status(out.ok?200:500).json(out);
}
