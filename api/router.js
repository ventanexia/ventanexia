import adminApproval from "../server/handlers/admin-approval.js";
import adminBilling from "../server/handlers/admin-billing.js";
import adminDeviceLicense from "../server/handlers/admin-device-license.js";
import adminLogin from "../server/handlers/admin-login.js";
import adminLogout from "../server/handlers/admin-logout.js";
import adminPromoteSolution from "../server/handlers/admin-promote-solution.js";
import adminState from "../server/handlers/admin-state.js";
import adminTenants from "../server/handlers/admin-tenants.js";
import appQuoteRequest from "../server/handlers/app-quote-request.js";
import chat from "../server/handlers/chat-desktop-router.js";
import clientConfig from "../server/handlers/client-config.js";
import clientLead from "../server/handlers/client-lead.js";
import contractAccept from "../server/handlers/contract-accept.js";
import createCheckout from "../server/handlers/create-checkout.js";
import createCreditCheckout from "../server/handlers/create-credit-checkout.js";
import customerEvent from "../server/handlers/customer-event.js";
import customerPortal from "../server/handlers/customer-portal.js";
import deviceRegister from "../server/handlers/device-register.js";
import deviceStatus from "../server/handlers/device-status.js";
import desktopUpdate from "../server/handlers/desktop-update.js";
import entitlementStatus from "../server/handlers/entitlement-status.js";
import freeValue from "../server/handlers/free-value.js";
import health from "../server/handlers/health.js";
import lead from "../server/handlers/lead.js";
import meetingEvent from "../server/handlers/meeting-event.js";
import modulePlanner from "../server/handlers/module-planner.js";
import onboardingSave from "../server/handlers/onboarding-save.js";
import onboardingState from "../server/handlers/onboarding-state.js";
import oauthStart from "../server/handlers/oauth-start.js";
import oauthCallback from "../server/handlers/oauth-callback.js";
import oauthStatus from "../server/handlers/oauth-status.js";
import oauthDiagnostic from "../server/handlers/oauth-diagnostic.js";
import oauthRefresh from "../server/handlers/oauth-refresh.js";
import policyEvaluate from "../server/handlers/policy-evaluate.js";
import portalBilling from "../server/handlers/portal-billing.js";
import portalChangeRequest from "../server/handlers/portal-change-request.js";
import portalLogin from "../server/handlers/portal-login.js";
import portalLogout from "../server/handlers/portal-logout.js";
import portalReactivate from "../server/handlers/portal-reactivate.js";
import portalRequestLink from "../server/handlers/portal-request-link.js";
import portalState from "../server/handlers/portal-state.js";
import proposalEvent from "../server/handlers/proposal-event.js";
import releasePublish from "../server/handlers/release-publish.js";
import prospectSearch from "../server/handlers/prospect-search.js";
import ordersExtract from "../server/handlers/orders-extract.js";
import qualify from "../server/handlers/qualify.js";
import socialPlan from "../server/handlers/social-plan.js";
import socialPublish from "../server/handlers/social-publish.js";
import socialQueue from "../server/handlers/social-queue.js";
import socialSweep from "../server/handlers/social-sweep.js";
import solutionBuilder from "../server/handlers/solution-builder.js";
import startTrial from "../server/handlers/start-trial.js";
import stripeWebhook from "../server/handlers/stripe-webhook.js";
import supportEscalate from "../server/handlers/support-escalate.js";
import trialSweep from "../server/handlers/trial-sweep.js";
import whatsappSimulator from "../server/handlers/whatsapp-simulator.js";
import whatsappChannel from "../server/handlers/whatsapp-channel.js";
import whatsappWebhook from "../server/handlers/whatsapp-webhook.js";
import videoUsage from "../server/handlers/video-usage.js";
import usageMeter from "../server/handlers/usage-meter.js";
import provisioningAdmin from "../server/handlers/provisioning-admin.js";
import shopifyOwnConnect from "../server/handlers/shopify-own-connect.js";

export const config = { api: { bodyParser: false } };

const handlers = {
  "admin-approval": adminApproval,
  "admin-billing": adminBilling,
  "admin-device-license": adminDeviceLicense,
  "admin-login": adminLogin,
  "admin-logout": adminLogout,
  "admin-promote-solution": adminPromoteSolution,
  "admin-state": adminState,
  "admin-tenants": adminTenants,
  "app-quote-request": appQuoteRequest,
  "chat": chat,
  "client-config": clientConfig,
  "client-lead": clientLead,
  "contract-accept": contractAccept,
  "create-checkout": createCheckout,
  "create-credit-checkout": createCreditCheckout,
  "customer-event": customerEvent,
  "customer-portal": customerPortal,
  "device-register": deviceRegister,
  "device-status": deviceStatus,
  "desktop-update": desktopUpdate,
  "entitlement-status": entitlementStatus,
  "free-value": freeValue,
  "health": health,
  "lead": lead,
  "meeting-event": meetingEvent,
  "module-planner": modulePlanner,
  "onboarding-save": onboardingSave,
  "onboarding-state": onboardingState,
  "oauth-start": oauthStart,
  "oauth-callback": oauthCallback,
  "oauth-status": oauthStatus,
  "oauth-diagnostic": oauthDiagnostic,
  "oauth-refresh": oauthRefresh,
  "policy-evaluate": policyEvaluate,
  "portal-billing": portalBilling,
  "portal-change-request": portalChangeRequest,
  "portal-login": portalLogin,
  "portal-logout": portalLogout,
  "portal-reactivate": portalReactivate,
  "portal-request-link": portalRequestLink,
  "portal-state": portalState,
  "proposal-event": proposalEvent,
  "release-publish": releasePublish,
  "prospect-search": prospectSearch,
  "orders-extract": ordersExtract,
  "qualify": qualify,
  "social-plan": socialPlan,
  "social-publish": socialPublish,
  "social-queue": socialQueue,
  "social-sweep": socialSweep,
  "solution-builder": solutionBuilder,
  "start-trial": startTrial,
  "stripe-webhook": stripeWebhook,
  "support-escalate": supportEscalate,
  "trial-sweep": trialSweep,
  "whatsapp-simulator": whatsappSimulator,
  "whatsapp-channel": whatsappChannel,
  "whatsapp-webhook": whatsappWebhook,
  "video-usage": videoUsage,
  "usage-meter": usageMeter,
  "provisioning-admin": provisioningAdmin,
  "shopify-own-connect": shopifyOwnConnect
};

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function prepareBody(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(String(req.method || "GET").toUpperCase())) return;
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
  if (!raw.length) { req.body = {}; return; }
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
  if (!["stripe-webhook","whatsapp-webhook"].includes(endpoint)) {
    try { await prepareBody(req); }
    catch { return res.status(400).json({ error: "Cuerpo de solicitud no válido" }); }
  }
  return handler(req, res);
}
