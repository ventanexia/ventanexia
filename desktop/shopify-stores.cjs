'use strict';

const {updateState}=require('./state-store.cjs');

function normalizeShop(value=''){
  let v=String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
  if(/^[a-z0-9][a-z0-9-]*$/.test(v))v+='.myshopify.com';
  return v;
}
function storeKey(value=''){return normalizeShop(value)}
function rawStores(state){
  const raw=state?.secret?.shopifyStores;
  if(Array.isArray(raw))return raw.filter(Boolean);
  if(raw&&typeof raw==='object')return Object.values(raw).filter(Boolean);
  return [];
}
function listShopifyStores(state){
  const out=[],seen=new Set();
  const push=x=>{
    if(!x?.shop)return;
    const k=storeKey(x.shop);if(!k||seen.has(k))return;
    seen.add(k);out.push({...x,shop:k});
  };
  for(const x of rawStores(state))push(x);
  push(state?.secret?.integrations?.shopify);
  return out;
}
function getShopifyStore(state,shop=null){
  const stores=listShopifyStores(state);
  if(shop){
    const key=storeKey(shop);
    return stores.find(x=>storeKey(x.shop)===key)||null;
  }
  const active=state?.secret?.integrations?.shopify;
  if(active?.shop){
    const hit=stores.find(x=>storeKey(x.shop)===storeKey(active.shop));
    if(hit)return hit;
  }
  return stores[0]||null;
}
function hasShopifyStore(state,shop){return Boolean(getShopifyStore(state,shop))}
function ensureContainers(state){
  state.secret=state.secret||{};
  state.secret.integrations=state.secret.integrations||{};
  if(!state.secret.shopifyStores||Array.isArray(state.secret.shopifyStores))state.secret.shopifyStores={};
  return state;
}
function seedStoreMap(state){
  const existing=listShopifyStores(state);
  ensureContainers(state);
  const map={};
  for(const x of existing){
    const k=storeKey(x.shop);if(k)map[k]={...x,shop:k};
  }
  state.secret.shopifyStores=map;
  return map;
}
function upsertShopifyStore(state,cfg,{makeActive=true}={}){
  if(!cfg?.shop)throw new Error('Falta la tienda Shopify.');
  const map=seedStoreMap(state),key=storeKey(cfg.shop);
  const next={...(map[key]||{}),...cfg,shop:key};
  map[key]=next;
  state.secret.shopifyStores=map;
  if(makeActive)state.secret.integrations.shopify=next;
  return next;
}
function setActiveShopifyStore(state,shop){
  ensureContainers(state);
  const hit=getShopifyStore(state,shop);
  if(!hit)throw new Error('La tienda Shopify seleccionada ya no está conectada.');
  state.secret.integrations.shopify={...hit};
  return state.secret.integrations.shopify;
}
function removeShopifyStore(state,shop){
  const key=storeKey(shop),map=seedStoreMap(state);
  const existed=Boolean(map[key]);delete map[key];state.secret.shopifyStores=map;
  const active=state.secret.integrations.shopify;
  if(active?.shop&&storeKey(active.shop)===key){
    const next=Object.values(map)[0]||null;
    if(next)state.secret.integrations.shopify={...next};else delete state.secret.integrations.shopify;
  }
  return existed;
}
async function persistShopifyStorePatch(shop,patch){
  const key=storeKey(shop);
  if(!key)return;
  await updateState(state=>{
    const current=getShopifyStore(state,key);
    if(!current)return state;
    const activeKey=storeKey(state?.secret?.integrations?.shopify?.shop||'');
    upsertShopifyStore(state,{...current,...patch,shop:key},{makeActive:activeKey===key});
    return state;
  });
}
function publicShopifyStore(x){
  if(!x)return null;
  return {
    shop:x.shop||null,shopName:x.shopName||x.shop||null,mode:x.mode||'read',
    scopes:Array.isArray(x.scopes)?x.scopes:[],connectedAt:x.connectedAt||null,
    authMode:x.authMode||null,expiresAt:x.expiresAt||null
  };
}
module.exports={
  normalizeShop,storeKey,listShopifyStores,getShopifyStore,hasShopifyStore,
  upsertShopifyStore,setActiveShopifyStore,removeShopifyStore,persistShopifyStorePatch,publicShopifyStore
};
