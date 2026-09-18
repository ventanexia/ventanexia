function gatewayToken(runtimeOidc=""){
  // In Vercel Functions the fresh OIDC token can arrive in the request header
  // x-vercel-oidc-token. Prefer it over a possibly stale manually configured key.
  return String(runtimeOidc||process.env.VERCEL_OIDC_TOKEN||process.env.AI_GATEWAY_API_KEY||"");
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
  return providerToken()?"gpt-5-mini":"openai/gpt-5.6-sol";
}

function contentToText(content){
  if(typeof content==="string") return content;
  if(Array.isArray(content)) return content.map(c=>typeof c?.text==="string"?c.text:typeof c?.content==="string"?c.content:"").filter(Boolean).join("\n");
  return "";
}

function inputToMessages(payload){
  const messages=[];
  if(payload?.instructions) messages.push({role:"system",content:String(payload.instructions)});

  if(typeof payload?.input==="string" && payload.input.trim()){
    messages.push({role:"user",content:payload.input.trim()});
    return messages;
  }

  for(const item of Array.isArray(payload?.input)?payload.input:[]){
    if(!item||!["user","assistant","system"].includes(item.role))continue;
    const text=contentToText(item.content);
    if(text) messages.push({role:item.role,content:text});
  }
  return messages;
}

function normalizeGatewayData(raw){
  const content=raw?.choices?.[0]?.message?.content;
  if(typeof content==="string"&&content.trim()) return {output_text:content.trim(),raw};
  if(Array.isArray(content)){
    const text=content.map(x=>typeof x?.text==="string"?x.text:"").filter(Boolean).join("\n").trim();
    if(text) return {output_text:text,raw};
  }
  return raw;
}

export async function createAIResponse(payload,options={}){
  const direct=providerToken();
  const gateway=gatewayToken(options?.oidcToken||"");
  const token=direct||gateway;
  if(!token)throw new Error("AI_NOT_CONFIGURED");
  const configuredModel=aiModel();

  if(!direct){
    const model=configuredModel.includes("/")?configuredModel:`openai/${configuredModel}`;
    const messages=inputToMessages(payload);
    if(!messages.some(m=>m.role==="user")) messages.push({role:"user",content:"Responde a la petición siguiendo las instrucciones anteriores."});
    const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",
      headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({model,messages})
    });
    const raw=await response.json().catch(()=>({}));
    return {ok:response.ok,status:response.status,data:normalizeGatewayData(raw)};
  }

  const model=configuredModel.startsWith("openai/")?configuredModel.slice("openai/".length):configuredModel;
  const response=await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({...payload,model})
  });
  const data=await response.json().catch(()=>({}));
  return {ok:response.ok,status:response.status,data};
}
