import {aiConfigured,aiModel} from "../../lib/ai-client.js";

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  const checks={
    database:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),
    crm:!!process.env.HUBSPOT_ACCESS_TOKEN,
    ai:aiConfigured(),
    stripe:!!process.env.STRIPE_SECRET_KEY,
    stripeWebhook:!!process.env.STRIPE_WEBHOOK_SECRET,
    portalAuth:String(process.env.PORTAL_SESSION_SECRET||"").length>=32,
    adminAuth:String(process.env.ADMIN_SESSION_SECRET||"").length>=32&&Boolean(process.env.ADMIN_PASSWORD_HASH||process.env.ADMIN_PASSWORD),
    isolatedSessionSecrets:Boolean(process.env.PORTAL_SESSION_SECRET)&&process.env.PORTAL_SESSION_SECRET!==process.env.ADMIN_SESSION_SECRET,
    trialSigning:String(process.env.TRIAL_SIGNING_SECRET||"").length>=32,
    orchestration:!!process.env.N8N_AUTOMATION_WEBHOOK,
    automationSecret:!!process.env.AUTOMATION_WEBHOOK_SECRET
  };
  const launchReady=Object.values(checks).every(Boolean);
  res.setHeader("Cache-Control","no-store");
  return res.status(200).json({service:"VentaNexIA",ok:true,launchReady,checks,model:aiModel(),timestamp:new Date().toISOString()});
}
