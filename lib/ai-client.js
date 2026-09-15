function gatewayToken(){
  return String(process.env.VERCEL_OIDC_TOKEN||"");
}

function providerToken(){
  return String(process.env.OPENAI_API_KEY||"");
}

export function aiConfigured(){
  return Boolean(providerToken()||gatewayToken());
}

export function aiModel(){
  const configured=String(process.env.OPENAI_MODEL||"").trim();
  if(configured)return configured;
  return providerToken()?"gpt-5.4":"openai/gpt-6-astra";
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
