const ENDPOINT="https://api.typesafe.ai/v1/systemone";

function key(){return String(process.env.TYPESAFE_API_KEY||process.env.JEV_API_KEY||"").trim()}
export function jevConfigured(){return Boolean(key())}
export function jevModel(){return String(process.env.JEV_MODEL||"jev-latest").trim()||"jev-latest"}

function validateQuestions(questions={}){
  if(!questions||typeof questions!=="object"||Array.isArray(questions)||!Object.keys(questions).length)throw new Error("JEV_QUESTIONS_REQUIRED");
  for(const [name,q] of Object.entries(questions)){
    const type=String(q?.type||"").toLowerCase();
    if(!["choice","score","noul"].includes(type))throw new Error("JEV_INVALID_QUESTION_TYPE:"+name);
    if(!String(q?.instructions||"").trim())throw new Error("JEV_INSTRUCTIONS_REQUIRED:"+name);
    if(type==="choice"&&(!q.criteria||Array.isArray(q.criteria)||typeof q.criteria!=="object"||Object.keys(q.criteria).length<2))throw new Error("JEV_CHOICE_CRITERIA_REQUIRED:"+name);
    if(type==="score"&&(!Array.isArray(q.criteria)||q.criteria.length<2))throw new Error("JEV_SCORE_CRITERIA_REQUIRED:"+name);
  }
}

export async function createJevDecision({state,questions,model=jevModel(),timeoutMs=8000}={}){
  const token=key();if(!token)throw new Error("JEV_NOT_CONFIGURED");
  validateQuestions(questions);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||8000));
  try{
    const r=await fetch(ENDPOINT,{
      method:"POST",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({model,state,questions}),
      signal:controller.signal
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(String(data?.error?.message||data?.error||data?.message||("JEV_HTTP_"+r.status)).slice(0,400));
    const answers=data?.answers&&typeof data.answers==="object"?data.answers:data;
    if(!answers||typeof answers!=="object")throw new Error("JEV_INVALID_RESPONSE");
    return {ok:true,model:data?.model||model,answers,usage:data?.usage||null};
  }catch(e){
    if(e?.name==="AbortError")throw new Error("JEV_TIMEOUT");
    throw e;
  }finally{clearTimeout(timer)}
}

export function choiceAnswer(result,name,{minConfidence=0.55}={}){
  const a=result?.answers?.[name]||{};
  const choice=String(a.choice||"").trim(),confidence=Number(a.confidence);
  return {choice,confidence:Number.isFinite(confidence)?confidence:0,probabilities:a.probabilities||{},decided:Boolean(choice)&&Number.isFinite(confidence)&&confidence>=minConfidence};
}

export function noulAnswer(result,name,{yesAt=0.65,noAt=0.35}={}){
  const a=result?.answers?.[name]||{},p=Number(a.noul);
  if(!Number.isFinite(p))return {probability:null,decision:null,decided:false};
  if(p>=yesAt)return {probability:p,decision:true,decided:true};
  if(p<=noAt)return {probability:p,decision:false,decided:true};
  return {probability:p,decision:null,decided:false};
}
