import crypto from "node:crypto";
import {db,enforceEntitlement,recordUsage,getMonthlyUsage} from "./entitlement.js";

const SENSITIVE = [
  /credential|secret|password|token|api[_ -]?key/i,
  /payment|refund|price|discount|invoice|bank|iban|financial/i,
  /contract|legal|complaint|lawsuit|demand/i,
  /bulk|mass|broadcast|new[_ -]?channel/i,
  /delete|purge|irreversible|production_install/i
];

function clean(v,n=500){return String(v||"").trim().slice(0,n)}
function budgetFor(plan){
  const key=`VNX_MONTHLY_ACTION_BUDGET_${String(plan||"core").toUpperCase()}`;
  const n=Number(process.env[key]||0);
  return Number.isFinite(n)&&n>0?n:null;
}
function sensitive(actionType,metadata={}){
  const hay=`${actionType} ${JSON.stringify(metadata)}`;
  return SENSITIVE.some(r=>r.test(hay));
}
async function policyFor(tenantId,actionType,context={}){
  const rows=await db(`vnx_policies?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=priority.asc`);
  for(const p of rows||[]){
    if(!(p.policy_key===actionType||p.policy_key==="*")) continue;
    const cond=p.conditions||{};let ok=true;
    for(const [k,v] of Object.entries(cond)){
      if(Array.isArray(v)){if(!v.includes(context[k])){ok=false;break}}
      else if(context[k]!==v){ok=false;break}
    }
    if(ok) return {effect:p.effect,policy:p.policy_key};
  }
  return null;
}
async function existingExecution(tenantId,idempotencyKey){
  if(!idempotencyKey) return null;
  const rows=await db(`vnx_execution_requests?tenant_id=eq.${encodeURIComponent(tenantId)}&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=*`);
  return rows?.[0]||null;
}
async function createExecution(row){
  const rows=await db("vnx_execution_requests",{method:"POST",body:JSON.stringify([row])});
  return rows?.[0]||null;
}
export async function authorizeExecution({tenantId,capability="action",actionType,context={},metadata={},idempotencyKey="",approved=false}){
  if(!tenantId||!actionType) return {allowed:false,effect:"deny",reason:"MISSING_SCOPE"};
  const idem=clean(idempotencyKey,180)||crypto.createHash("sha256").update(`${tenantId}:${actionType}:${JSON.stringify(metadata)}`).digest("hex");
  const prior=await existingExecution(tenantId,idem);
  if(prior&&["approved","dispatched","completed"].includes(prior.status)) return {allowed:true,effect:"allow",reason:"IDEMPOTENT_REPLAY",execution:prior,idempotent:true};

  const access=await enforceEntitlement(tenantId,capability);
  if(!access.allowed) return {allowed:false,effect:"deny",reason:access.reason,entitlement:access.entitlement||null};

  const plan=access.entitlement?.plan_key||"core";
  const used=await getMonthlyUsage(tenantId);
  const total=Object.values(used.byCapability||{}).reduce((a,b)=>a+Number(b||0),0);
  const budget=budgetFor(plan);
  if(budget&&total>=budget) return {allowed:false,effect:"deny",reason:"MONTHLY_ACTION_BUDGET_REACHED",usage:{total,budget,plan}};

  const p=await policyFor(tenantId,actionType,context).catch(()=>null);
  let effect=p?.effect||"allow";
  let reason=p?.policy?`POLICY:${p.policy}`:"DEFAULT_POLICY";
  if(sensitive(actionType,metadata)&&!approved){effect="approval_required";reason="GUARDIAN_SENSITIVE_ACTION"}
  if(effect==="deny") return {allowed:false,effect,reason};

  let execution=prior;
  if(!execution){
    execution=await createExecution({tenant_id:tenantId,action_type:actionType,capability,status:effect==="approval_required"?"approval_required":"approved",idempotency_key:idem,context,metadata});
  }
  if(effect==="approval_required"){
    await db("vnx_approvals",{method:"POST",body:JSON.stringify([{
      tenant_id:tenantId,agent_key:"guardian",action_type:actionType,
      title:`Autorizar: ${actionType}`,rationale:"Guardian ha detenido una acción sensible antes de su ejecución.",
      risk:"high",status:"pending",payload:{execution_id:execution?.id,capability,context,metadata}
    }])}).catch(()=>{});
    return {allowed:false,effect,reason,execution};
  }
  return {allowed:true,effect:"allow",reason,execution,usage:{total,budget,plan}};
}

export async function markExecutionStatus(executionId,status,result={}){
  if(!executionId) return;
  await db(`vnx_execution_requests?id=eq.${encodeURIComponent(executionId)}`,{method:"PATCH",body:JSON.stringify({status,result,updated_at:new Date().toISOString()})});
}

export async function completeExecution({executionId,tenantId,capability="action",quantity=1,result={}}){
  await markExecutionStatus(executionId,"completed",result);
  await recordUsage(tenantId,capability,quantity,{execution_id:executionId,...result});
}
