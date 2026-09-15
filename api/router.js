import adminApproval from "../server/handlers/admin-approval.js";
import adminLogin from "../server/handlers/admin-login.js";
import adminLogout from "../server/handlers/admin-logout.js";
import adminPromoteSolution from "../server/handlers/admin-promote-solution.js";
import adminState from "../server/handlers/admin-state.js";
import adminTenants from "../server/handlers/admin-tenants.js";
import chat from "../server/handlers/chat.js";
import clientConfig from "../server/handlers/client-config.js";
import clientLead from "../server/handlers/client-lead.js";
import createCheckout from "../server/handlers/create-checkout.js";
import customerPortal from "../server/handlers/customer-portal.js";
import entitlementStatus from "../server/handlers/entitlement-status.js";
import health from "../server/handlers/health.js";
import lead from "../server/handlers/lead.js";
import meetingEvent from "../server/handlers/meeting-event.js";
import modulePlanner from "../server/handlers/module-planner.js";
import onboardingSave from "../server/handlers/onboarding-save.js";
import onboardingState from "../server/handlers/onboarding-state.js";
import policyEvaluate from "../server/handlers/policy-evaluate.js";
import portalBilling from "../server/handlers/portal-billing.js";
import portalChangeRequest from "../server/handlers/portal-change-request.js";
import portalLogin from "../server/handlers/portal-login.js";
import portalLogout from "../server/handlers/portal-logout.js";
import portalReactivate from "../server/handlers/portal-reactivate.js";
import portalRequestLink from "../server/handlers/portal-request-link.js";
import portalState from "../server/handlers/portal-state.js";
import proposalEvent from "../server/handlers/proposal-event.js";
import qualify from "../server/handlers/qualify.js";
import socialPlan from "../server/handlers/social-plan.js";
import socialPublish from "../server/handlers/social-publish.js";
import socialQueue from "../server/handlers/social-queue.js";
import socialSweep from "../server/handlers/social-sweep.js";
import solutionBuilder from "../server/handlers/solution-builder.js";
import startTrial from "../server/handlers/start-trial.js";
import stripeWebhook from "../server/handlers/stripe-webhook.js";
import trialSweep from "../server/handlers/trial-sweep.js";

export const config = { api: { bodyParser: false } };

const handlers = {
  "admin-approval": adminApproval,
  "admin-login": adminLogin,
  "admin-logout": adminLogout,
  "admin-promote-solution": adminPromoteSolution,
  "admin-state": adminState,
  "admin-tenants": adminTenants,
  "chat": chat,
  "client-config": clientConfig,
  "client-lead": clientLead,
  "create-checkout": createCheckout,
  "customer-portal": customerPortal,
  "entitlement-status": entitlementStatus,
  "health": health,
  "lead": lead,
  "meeting-event": meetingEvent,
  "module-planner": modulePlanner,
  "onboarding-save": onboardingSave,
  "onboarding-state": onboardingState,
  "policy-evaluate": policyEvaluate,
  "portal-billing": portalBilling,
  "portal-change-request": portalChangeRequest,
  "portal-login": portalLogin,
  "portal-logout": portalLogout,
  "portal-reactivate": portalReactivate,
  "portal-request-link": portalRequestLink,
  "portal-state": portalState,
  "proposal-event": proposalEvent,
  "qualify": qualify,
  "social-plan": socialPlan,
  "social-publish": socialPublish,
  "social-queue": socialQueue,
  "social-sweep": socialSweep,
  "solution-builder": solutionBuilder,
  "start-trial": startTrial,
  "stripe-webhook": stripeWebhook,
  "trial-sweep": trialSweep
};

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function prepareBody(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())) return;

  // Some Vercel runtimes (notably `vercel dev`) may already provide a parsed body.
  // Preserve it instead of consuming an already-drained request stream and replacing it with {}.
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return;
  if (typeof req.body === "string" && req.body.length) {
    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (type.includes("application/json") || type.includes("+json")) {
      try { req.body = JSON.parse(req.body); }
      catch { req.body = {}; }
    } else if (type.includes("application/x-www-form-urlencoded")) {
      req.body = Object.fromEntries(new URLSearchParams(req.body));
    }
    return;
  }

  const raw = await readRaw(req);
  if (!raw.length) {
    req.body = {};
    return;
  }
  const type = String(req.headers["content-type"] || "").toLowerCase();
  const text = raw.toString("utf8");
  if (type.includes("application/json") || type.includes("+json")) {
    try { req.body = JSON.parse(text); }
    catch { req.body = {}; }
  } else if (type.includes("application/x-www-form-urlencoded")) {
    req.body = Object.fromEntries(new URLSearchParams(text));
  } else {
    req.body = text;
  }
}

export default async function router(req, res) {
  const endpoint = String(req.query?.endpoint || "").trim();
  const handler = handlers[endpoint];
  if (!handler) return res.status(404).json({ error: "Endpoint no encontrado" });

  // Stripe signature verification requires the untouched raw request stream.
  if (endpoint !== "stripe-webhook") {
    try { await prepareBody(req); }
    catch { return res.status(400).json({ error: "Cuerpo de solicitud no válido" }); }
  }

  return handler(req, res);
}
