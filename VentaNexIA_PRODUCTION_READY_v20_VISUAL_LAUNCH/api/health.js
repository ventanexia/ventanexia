export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  return res.status(200).json({
    service:"VentaNexIA",
    ok:true,
    integrations:{
      crm:!!process.env.HUBSPOT_ACCESS_TOKEN,
      ai:!!process.env.OPENAI_API_KEY,
      booking:!!process.env.BOOKING_URL,
      stripe:!!process.env.STRIPE_SECRET_KEY,
      stripeWebhook:!!process.env.STRIPE_WEBHOOK_SECRET,
      orchestration:!!process.env.N8N_AUTOMATION_WEBHOOK,
      automationSecret:!!process.env.AUTOMATION_WEBHOOK_SECRET
    },
    model:process.env.OPENAI_MODEL||"gpt-5.6-terra",
    timestamp:new Date().toISOString()
  });
}
