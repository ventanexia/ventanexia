import {qualifyLead} from "../../lib/lead-qualification.js";

function clean(v,max=2000){return String(v||"").trim().slice(0,max)}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  return res.status(200).json(await qualifyLead(req.body||{}));
}
