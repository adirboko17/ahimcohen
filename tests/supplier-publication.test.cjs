const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/suppliers/publication.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = "gid://shopify/Product/42";
const channel = "gid://shopify/Publication/1";

function fixture() {
  const row = { source_id: "9151", shopify_product_id: id, collection_ids:["boots"], snapshot:{ id:"9151" } };
  const product = { source:{value:"9151"}, tags:["supplier:redback"], variants:{ nodes:[] }};
  const fresh = { variants:[] };
  for (const [i, available, own] of [[1,true,0],[2,false,0],[3,false,2]]) {
    product.variants.nodes.push({ id:"variant-"+i,source:{value:String(i)},inventoryPolicy:available?"DENY":"CONTINUE",
      availability:{value:available?"out_of_stock":"in_stock"},inventoryItem:{tracked:true},sellableOnlineQuantity:own,
      selectedOptions:[{name:"Size",value:String(i)}] });
    fresh.variants.push({id:String(i), options:{Size:String(i)}, available});
  }
  const state = { id, status:"DRAFT", onSite:false, handle:"boot", otherChannels:{nodes:[],pageInfo:{hasNextPage:false}} };
  const events = [];
  const changes = [];
  const deps = {
    "server-only":{}, "node:timers/promises":{setTimeout:async()=>{}},
    "@/lib/shopify/admin-bundles":{adminGraphQL: async(query,vars)=>{
      if (query.includes("query SupplierChannels")) return {nodes:[{...state}]};
      if (query.includes("mutation SupplierStock")) {
        assert.equal(vars.id,id);
        assert.match(query,/allowPartialUpdates:false/);
        events.push("stock"); changes.push(...vars.variants);
        for(const v of vars.variants) {
          assert.deepEqual(Object.keys(v).sort(),["id","inventoryPolicy","metafields"]);
          const target=product.variants.nodes.find(x=>x.id===v.id);
          target.inventoryPolicy=v.inventoryPolicy;
          target.availability.value=v.metafields[0].value;
        }
        return {productVariantsBulkUpdate:{userErrors:[]}};
      }
      if (query.includes("mutation PublishSupplierToSite")) {
        assert.equal(vars.channel,channel); events.push("channel"); state.onSite=true; return {publishablePublish:{userErrors:[]}};
      }
      if (query.includes("mutation ActivateSupplierProduct")) {
        events.push("activate"); state.status="ACTIVE"; return {productUpdate:{userErrors:[]}};
      }
      assert.fail("Unexpected Admin operation");
    }},
    "@/lib/shopify/client":{storefront:async()=> {
      events.push("verify"); assert.equal(state.status,"ACTIVE"); assert.equal(state.onSite,true);
      return {nodes:product.variants.nodes.map(v=>({id:v.id,availableForSale:v.inventoryPolicy==="CONTINUE"||v.sellableOnlineQuantity>0}))};
    }},
    "./redback":{scanRedback:async()=>fresh,isPilotId:()=>true},
    "./woocommerce":{}, "./catalog-model":{productDomain:()=>"redback.co.il",supplierKey:()=>"redback"},
    "./shopify":{readDraft:async()=>product,verifyDraft:()=>events.push("contents")},
    "./storage":{withLinkedProductLock:async(_,fn)=>fn(),savePreview:async()=>events.push("save")},
  };
  const api = {};
  new Function("require","exports","process",source)(key=>deps[key],api,{env:{SHOPIFY_BUNDLE_PUBLICATION_ID:channel}});
  return {api,row,state,product,fresh,events,changes,deps};
}

test("publishing targets the existing product and site, synchronizes variants, and preserves local stock",async()=>{
  const f=fixture();
  assert.equal((await f.api.refreshLinkedProduct(f.row,true)).live,true);
  assert.deepEqual(f.events,["contents","stock","channel","activate","verify","save"]);
  assert.deepEqual(f.changes.map(v=>v.inventoryPolicy),["CONTINUE","DENY","DENY"]);
  f.events.length=0;
  await f.api.refreshLinkedProduct(f.row,true);
  assert.deepEqual(f.events,["verify","save"]);
  f.fresh.variants[0].available=false;
  await f.api.refreshLinkedProduct(f.row,false);
  assert.equal(f.changes.at(-1).inventoryPolicy,"DENY");
});

test("a scan alone cannot publish a draft and source failures preserve the last stock state",async()=>{
  const f=fixture();
  await f.api.refreshLinkedProduct(f.row,false);
  assert.deepEqual(f.events,["save"]);
  f.events.length=0;
  f.deps["./redback"].scanRedback=async()=>{throw Error("offline")};
  await assert.rejects(f.api.refreshLinkedProduct(f.row,true),/offline/);
  assert.deepEqual(f.events,[]);
});

test("incomplete source mappings or other selected sales channels stop publication before any write",async()=>{
  const f=fixture();
  f.fresh.variants.pop();
  await assert.rejects(f.api.refreshLinkedProduct(f.row,true));
  assert.deepEqual(f.changes,[]);
  f.state.otherChannels.nodes.push({publication:{id:"other"}});
  await assert.rejects(f.api.refreshLinkedProduct(f.row,true),/ערוצים/);
  assert.equal(f.state.onSite,false);
  assert.equal(f.state.status,"DRAFT");
});
