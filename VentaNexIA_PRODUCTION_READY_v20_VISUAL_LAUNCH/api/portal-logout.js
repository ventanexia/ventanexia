import {clearPortalCookie} from "../lib/portal-auth.js";
export default async function handler(req,res){
  clearPortalCookie(res);
  return res.status(200).json({ok:true});
}
