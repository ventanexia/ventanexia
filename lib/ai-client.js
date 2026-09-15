function gatewayToken(){
  return String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||"");
}

function providerToken(){
  return String(process.env.OPENAI_API_KEY||"");
}

export function aiConfigured(){
  return Boolean(providerToken()||gatewayToken());
}

export function aiModel(){
  const configured=String(process.env.OPENAI_MODEL||"").trim();
  const unsupported=new Set([
    "gpt-6-astra",
    "openai/gpt-6-astra",
    "gpt-5.6-terra",
    "openai/gpt-5.6-terra"
  ]);
  if(configured&&!unsupported.has(configured))return configured;
  return providerToken()?"gpt-5-mini":"openai/gpt-5-mini";
}

export async function createAIResponse(payload){
  const direct=providerToken();
  const token=direct||gatewayToken();
  if(!token)throw new Error("AI_NOT_CONFIGURED");
  const configuredModel=aiModel();
  const model=direct&&configuredModel.startsWith("openai/")
    ?configuredModel.slice("openai/".length)
    :!direct&&!configuredModel.includes("/")
      ?`openai/${configuredModel}`
      :configuredModel;
  const base=direct?"https://api.openai.com/v1":"https://ai-gateway.vercel.sh/v1";
  const response=await fetch(`${base}/responses`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({...payload,model})
  });
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,data};
}
