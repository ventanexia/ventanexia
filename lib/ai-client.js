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
  if(configured)return configured;
  return providerToken()?"gpt-5-mini":"openai/gpt-5.6-sol";
}

function inputToMessages(payload){
  const messages=[];
  if(payload?.instructions) messages.push({role:"system",content:String(payload.instructions)});
  for(const item of Array.isArray(payload?.input)?payload.input:[]){
    if(!item||!["user","assistant"].includes(item.role))continue;
    let text="";
    if(typeof item.content==="string") text=item.content;
    else if(Array.isArray(item.content)) text=item.content.map(c=>typeof c?.text==="string"?c.text:"").filter(Boolean).join("\n");
    if(text) messages.push({role:item.role,content:text});
  }
  return messages;
}

export async function createAIResponse(payload){
  const direct=providerToken();
  const gateway=gatewayToken();
  const token=direct||gateway;
  if(!token)throw new Error("AI_NOT_CONFIGURED");
  const configuredModel=aiModel();

  if(!direct){
    const model=configuredModel.includes("/")?configuredModel:`openai/${configuredModel}`;
    const response=await fetch("https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",
      headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model,
        messages:inputToMessages(payload),
        max_tokens:Number(payload?.max_output_tokens)||1200,
        temperature:0.35
      })
    });
    const raw=await response.json().catch(()=>({}));
    const text=raw?.choices?.[0]?.message?.content;
    const data=typeof text==="string"&&text.trim()?{output_text:text.trim()}:raw;
    return {ok:response.ok,status:response.status,data};
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
