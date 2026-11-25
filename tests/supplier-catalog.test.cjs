const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function moduleFor(name, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../lib/suppliers/", name + ".ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const out = {};
  new Function("require", "exports", js)((id) => deps[id] ?? require(id), out);
  return out;
}
const { pricedProduct, descendants, mappedCollections, formatMonitorCountdown } = moduleFor("catalog-model");
test("the supplier monitor countdown displays hours, minutes and seconds", () => {
  assert.equal(formatMonitorCountdown(24 * 3600), "24:00:00");
  assert.equal(formatMonitorCountdown(3661), "01:01:01");
  assert.equal(formatMonitorCountdown(3599), "00:59:59");
  assert.equal(formatMonitorCountdown(0), "00:00:00");
});
test("site percentage and manual pricing preserve the raw and per-variant prices", () => {
  const p = {
    variants: [
      { price: 100, regular: 120 },
      { price: 89.95, regular: 99 },
    ],
  };
  assert.deepEqual(pricedProduct(p, 10, null).variants, [
    { price: 110, regular: 132 },
    { price: 98.95, regular: 108.9 },
  ]);
  assert.equal(pricedProduct(p, -10, null).variants[0].price, 90);
  assert.deepEqual(pricedProduct(p, 10, 105).variants, [
    { price: 105, regular: 105 },
    { price: 105, regular: 105 },
  ]);
  assert.equal(p.variants[0].price, 100);
  assert.throws(() => pricedProduct({ ...p, currency: "EUR" }, 0, null));
  assert.equal(pricedProduct({ ...p, currency: "EUR" }, 0, 100).variants[0].price, 100);
});
test("category selection expands descendants and inherits the nearest approved mapping", () => {
  const categories = [
    { id: "1", parent: "0" },
    { id: "2", parent: "1" },
    { id: "3", parent: "2" },
    { id: "4", parent: "0" },
  ];
  const site = { categories, mappings: { 1: ["all"], 2: ["boots"], 4: ["sale"] } };
  assert.deepEqual(descendants(["2"], categories), ["2", "3"]);
  assert.deepEqual(mappedCollections(["3", "4"], site), ["boots", "sale"]);
});
const { readWooProduct, catalogPage, wooThumbnail, wooReviewImages } = moduleFor("woocommerce", {
  "server-only": {}, "./public-source": {}, "./catalog-model": moduleFor("catalog-model"),
});
test("pull estimates use measured first-page work and reserve 100% for completion", () => {
  const { pullProgress } = moduleFor("catalog-model");
  const run = { state: "running", pull_checked: 2, pull_total: 10, page_count: 1,
    pull_started_at: "2026-01-01T10:00:00Z", pull_sampled_at: "2026-01-01T10:00:06Z" };
  assert.deepEqual(pullProgress(run), { percent: 20, secondsLeft: 24 });
  assert.equal(pullProgress({ ...run, pull_checked: 1 }).secondsLeft, null);
  assert.deepEqual(pullProgress({ ...run, page_count: 0, pull_total: null }), { percent: null, secondsLeft: null });
  assert.equal(pullProgress({ ...run, page_count: 2, pull_total: null }).secondsLeft, 66);
  assert.equal(pullProgress({ ...run, pull_checked: 10 }).percent, 99);
  assert.equal(pullProgress({ ...run, state: "complete" }).percent, 100);
});
test("the source total follows the selected pages, with an unknown total until the final short page", async () => {
  const page = (n, length, headers) => catalogPage(async () => ({ data: Array(length), headers }), n);
  assert.equal((await page(1, 12, { "x-wp-total": "14", "x-wp-totalpages": "2" })).total, 14);
  assert.equal((await page(1, 12, {})).total, null);
  assert.equal((await page(2, 2, {})).total, 14);
  assert.equal((await page(1, 0, {})).total, 0);
});
test("a pull reports product progress inside page one and stops claiming work after removal", async () => {
  const model = moduleFor("catalog-model");
  const site = { domain: "example.com", state: "queued", removed_at: null, pull_all: true, cursor_page: 1,
    pull_checked: 0, pulled: 0, issues: [], selection: [], categories: [], attempts: 0 };
  const samples = [];
  const saved = [];
  const sites = moduleFor("sites", {
    "server-only": {}, "@/lib/shopify/config": {}, "./import-queue": { processNextImport: async () => {} },
    "./catalog-model": model, "./shopify-source": {}, "./public-source": { sourceReader: async () => ({}) },
    "./woocommerce": {
      catalogPage: async () => ({ products: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 3, pages: 1, more: false }),
      wooThumbnail,
      readWooProduct: async (_, domain, p) => p,
    },
    "./storage": {
      shopFilter: () => ({ shop_domain: "eq.test" }),
      supplierRequest: async (table, method, filters, body) => {
        assert.equal(table, "ahim_supplier_sites");
        assert.equal(filters.shop_domain, "eq.test");
        assert.equal(filters.removed_at, "is.null");
        if (site.removed_at || (filters.lease && filters.lease !== "eq." + site.lease)) return [];
        if (method === "PATCH") {
          assert.equal(filters.domain, "eq.example.com");
          Object.assign(site, body);
          if (body.pull_total) samples.push(body.pull_checked);
        }
        return [{ ...site }];
      },
      savePreview: async (product) => {
        saved.push(product.id);
        if (product.id === 2) await sites.removeSite(site.domain);
      },
    },
  });
  await sites.processCatalogJobs();
  await sites.processCatalogJobs();
  assert.deepEqual(samples, [0, 1]);
  assert.deepEqual(saved, [1, 2]);
  assert.deepEqual(await sites.listSites(), []);
  assert.equal(site.lease, null);
  assert.equal(site.state, "idle");
});
const domain = "example.com",
  sourceImage = "https://example.com/img.jpg";
test("review photos accept any public image host and skip addresses that are not public", async () => {
  const ids = ["42","43","44"];
  const cdn = "https://res.cloudinary.com/demo/image/upload/boot.jpg";
  const woo = await wooReviewImages(async path => {
    assert.equal(new URL(path,sourceImage).searchParams.get("include"),"42,43,44");
    return {data:[
      {id:43,images:[]}, {id:99,images:[{src:sourceImage}]},
      {id:42,type:"unsupported",images:[{thumbnail:"http://cdn.example/img.jpg",src:cdn}]},
      {id:44,images:[{src:"https://10.1.2.3/secret.jpg"}]},
    ]};
  },domain,ids);
  assert.deepEqual(woo,{"42":cdn});
  const {shopifyReviewImages} = moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),
  });
  const shopify = await shopifyReviewImages(async (_,body) => {
    assert.deepEqual(body.variables.ids,ids.map(id=>"gid://shopify/Product/"+id));
    return {data:{data:{nodes:[null,
      {id:"gid://shopify/Product/42",featuredImage:{url:sourceImage}},
      {id:"gid://shopify/Product/43",featuredImage:{url:"https://other.example/img.jpg"}},
      {id:"gid://shopify/Product/44",featuredImage:{url:"https://user:pass@cdn.shopify.com/x.jpg"}},
    ]}}};
  },domain,ids);
  assert.deepEqual(shopify,{"42":sourceImage,"43":"https://other.example/img.jpg"});
});
test("Storefront indexing merges selected collections with durable cursor pagination", async () => {
  const {indexShopifyPage}=moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),
  });
  const site={selection:["1","3"], categories:[{id:"1"},{id:"2"},{id:"3"}],index_group:0,index_page:1,source_index:{}};
  const requests=[];
  const read=async (_,body)=>{
    requests.push(body.variables);
    const more=requests.length===1;
    return {data:{data:{collection:{products:{nodes:[{id:"gid://shopify/Product/42",handle:"boot"}],
      pageInfo:{hasNextPage:more,endCursor:more?"cursor":null}}}}}};
  };
  Object.assign(site,await indexShopifyPage(read,site));
  Object.assign(site,await indexShopifyPage(read,site));
  Object.assign(site,await indexShopifyPage(read,site));
  assert.equal(site.phase,"catalog");
  assert.deepEqual(site.source_index,{"42":{handle:"boot",categories:["1","3"]}});
  assert.deepEqual(requests.map(r=>[r.id,r.after]),[
    ["gid://shopify/Collection/1",null],["gid://shopify/Collection/1","cursor"],["gid://shopify/Collection/3",null]]);
});
test("Storefront product pages preserve availability, prices, images, and reject incomplete variants", async () => {
  const {readShopifyProduct}=moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),
  });
  const page=(nodes,more=false)=>({nodes,pageInfo:{hasNextPage:more,endCursor:more?"cursor":null}});
  const money=amount=>({amount,currencyCode:"ILS"});
  const v={id:"gid://shopify/ProductVariant/123",price:money("110"),compareAtPrice:money("125"),
    availableForSale:true,currentlyNotInStock:true,selectedOptions:[{name:"Size",value:"M"}]};
  const other={...v,id:"gid://shopify/ProductVariant/124",currentlyNotInStock:false,selectedOptions:[{name:"Size",value:"L"}],
    image:{url:"https://cdn.shopify.com/l.jpg"}};
  const read=async(_,body)=>({data:{data:{product:{
    id:"gid://shopify/Product/42",handle:"boot",title:"Boot",options:[{name:"Size",values:["M","L"]}],
    images:page([{url:"https://res.cloudinary.com/demo/image/upload/boot.jpg"}]),
    variants:body.variables.variants?page([other]):page([v],true)
  }}}});
  const scan=()=>readShopifyProduct(read,"example.com","42","ILS",[{id:"1",name:"Boots"}]);
  const result=await scan();
  assert.deepEqual(result.variants.map(v=>[v.id,v.available,v.price,v.regular]),[["123",false,110,125],["124",true,110,125]]);
  assert.deepEqual(result.images,["https://res.cloudinary.com/demo/image/upload/boot.jpg","https://cdn.shopify.com/l.jpg"]);
  delete v.availableForSale;
  await assert.rejects(scan);
});
test("monitor discoveries keep previous approvals and dismissals across retries", async () => {
  const ops=[];
  let exists=false;
  const net=global.fetch;
  const prevURL=process.env.SUPABASE_URL,prevKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL="https://db.example";process.env.SUPABASE_SECRET_KEY="fake";
  try {
    global.fetch=async (url,opts)=>{
      const body=JSON.parse(opts.body);ops.push(body);
      const ignored=exists && opts.headers.Prefer.includes("ignore-duplicates");exists=true;
      return Response.json(ignored?[]:[body]);
    };
    const storage=moduleFor("storage",{"server-only":{},"@/lib/shopify/config":{shopDomain:()=>"shop.example"},
      "./catalog-model":moduleFor("catalog-model")});
    await storage.savePreview({id:"1",domain:"source.example"},true);
    await storage.savePreview({id:"1",domain:"source.example"},true);
    assert.equal(ops[0].review_state,"pending");
    assert.equal(ops[1].review_state,"pending");
    assert.ok(!Object.hasOwn(ops[2],"review_state"));
  } finally {
    global.fetch=net;
    if(prevURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=prevURL;
    if(prevKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=prevKey;
  }
});
const parent = {
  id: 30,
  type: "variable",
  name: "Boot",
  permalink: "https://example.com/boot",
  attributes: [
    {
      name: "Size",
      terms: [
        { name: "Small", slug: "s" },
        { name: "Medium", slug: "m" },
      ],
    },
  ],
  variations: [
    { id: 31, attributes: [{ name: "Size", value: "s" }] },
    { id: 32, attributes: [{ name: "Size", value: "m" }] },
  ],
  images: [{ src: sourceImage }],
  prices: { currency_code: "ILS" },
  categories: [{ id: 1, name: "Boots" }],
  description: "<p>Boot</p>",
};
const row = (id, stock) => ({
  id,
  parent: 30,
  sku: "shared",
  is_in_stock: stock,
  is_purchasable: true,
  prices: { price: "10000", regular_price: "12000", currency_minor_unit: 2, currency_code: "ILS" },
  images: [{ src: "https://example.com/" + id + ".jpg" }, { src: "https://res.cloudinary.com/demo/image/upload/side.jpg" }],
});
test("reads every declared combination, including sold-out sizes and secondary variation images", async () => {
  const result = await readWooProduct(
    async () => ({ data: [row(32, false), row(31, true)], headers: {} }),
    domain,
    parent,
  );
  assert.deepEqual(
    result.variants.map((v) => [v.id, v.options["מידה"], v.available]),
    [
      ["31", "Small", true],
      ["32", "Medium", false],
    ],
  );
  assert.equal(result.images.length, 4);
  assert.ok(result.images.includes("https://res.cloudinary.com/demo/image/upload/side.jpg"));
});
test("a partial variation response cannot replace known availability", async () => {
  await assert.rejects(readWooProduct(async () => ({ data: [row(32, false)], headers: {} }), domain, parent));
});
test("bulk import includes the entire category subtree across pages and keeps the approved prices", async () => {
  const imports = [];
  const seen = [];
  const api = moduleFor("import-queue", {
    "server-only": {}, "@/lib/shopify/config": {shopDomain: () => "test.myshopify.com"},
    "./shopify": {}, "./catalog-model": moduleFor("catalog-model"),
    "./storage": {shopFilter: () => ({}), supplierRequest: async (table, method, params, body) => {
      if (table === "ahim_supplier_previews") {
        seen.push(params);
        const make = id => ({source_id:String(id), revision:"abc", manual_price:id===301?119:null, category_ids:["2"], currency:"ILS"});
        return params.source_id ? [make(301)] : Array.from({length:300}, (_,i)=>make(i+1));
      }
      if (method === "POST") imports.push(...body);
      return [];
    }},
  });
  await api.queueImports({domain:"example.com",categories:[{id:"1",parent:"0"},{id:"2",parent:"1"}],
    mappings:{"1":["collection"]},percent:10},[],"1");
  assert.equal(imports.length,301);
  assert.deepEqual(seen.map(q=>q.category_ids),["ov.{1,2}","ov.{1,2}"]);
  assert.deepEqual(imports[300].collection_ids,["collection"]);
  assert.equal(imports[300].manual_price,119);
  assert.equal(imports[0].percent,10);
});
test("a scrolling selection can include more than 100 distinct products without widening its scope", async () => {
  const ids = Array.from({length:125}, (_, i) => String(2*i+1));
  const groups = [], queued = [];
  const api = moduleFor("import-queue", {
    "server-only":{}, "@/lib/shopify/config":{shopDomain:()=>"test"}, "./shopify":{},
    "./catalog-model":moduleFor("catalog-model"),
    "./storage":{shopFilter:()=>({}), supplierRequest:async (table,method,params,body)=>{
      if (table === "ahim_supplier_previews") {
        assert.match(params.source_id,/^in\.\(.+\)$/);
        const slice=params.source_id.slice(4,-1).split(",");
        groups.push(slice.length);
        return slice.map(source_id=>({source_id,revision:"r",manual_price:null,category_ids:["1"],currency:"ILS"}));
      }
      if (method === "POST") { queued.push(...body); return body; }
      return [];
    }},
  });
  await api.queueImports({domain:"example.com",categories:[{id:"1",parent:"0"}],
    mappings:{1:["collection"]},percent:0},[...ids,ids[0]]);
  assert.deepEqual(groups,[100,25]);
  assert.deepEqual(queued.map(t=>t.source_id),ids);
});
test("catalog scrolling requests the next filtered batch and checks one extra row for the end", async () => {
  const model=moduleFor("catalog-model");
  const site={domain:"example.com",percent:0,categories:[{id:"1",parent:"0"},{id:"2",parent:"1"}]};
  const requests=[];
  const data=Array.from({length:24},(_,i)=>({source_id:String(i+1),manual_price:null,category_ids:["2"],
    snapshot:{id:String(i+1),variants:[{price:100,regular:100}],images:["img"]}}));
  const api=moduleFor("catalog-batch",{"server-only":{},"./catalog-model":model,
    "./publication":{catalogPublicationStates:async()=>[]},"./import-queue":{importStatuses:async()=>[]},
    "./storage":{previews:async(domain,params)=>{
      assert.equal(domain,site.domain);requests.push(params);
      return data.slice(+params.offset,+params.offset + +params.limit);
    }},
  });
  const first=await api.readCatalogBatch(site,"1",1),second=await api.readCatalogBatch(site,"1",2);
  assert.deepEqual([first.more,second.more],[true,false]);
  assert.deepEqual([...first.items,...second.items].map(i=>i.id),data.map(row=>row.source_id));
  assert.deepEqual(requests.map(r=>[r.offset,r.limit,r.category_ids,r.review_state]),[
    ["0","13","ov.{1,2}","eq.known"],["12","13","ov.{1,2}","eq.known"],
  ]);
});
test("imported catalog filters before pagination and reports Shopify draft and storefront states", async () => {
  const model = moduleFor("catalog-model");
  const site = { domain: "example.com", percent: 0, categories: [{ id: "1", parent: "0" }] };
  const requests = [];
  const rows = Array.from({ length: 28 }, (_, index) => {
    const id = String(index + 1);
    return {
      source_id: id,
      shopify_product_id: index % 2 === 0 ? "gid" + id : null,
      review_state: index === 0 ? "ignored" : "known",
      category_ids: ["1"],
      manual_price: null,
      snapshot: { id, variants: [{ price: 100, regular: 100 }], images: ["img"] },
    };
  });
  const api = moduleFor("catalog-batch", {
    "server-only": {},
    "./catalog-model": model,
    "./storage": { previews: async (domain, params) => {
      assert.equal(domain, site.domain);
      requests.push(params);
      const imported = rows.filter(row => row.shopify_product_id);
      return imported.slice(Number(params.offset), Number(params.offset) + Number(params.limit));
    } },
    "./publication": { catalogPublicationStates: async ids => ids.map(id => ({
      id, handle: "example-product", status: id === "gid1" ? "DRAFT" : "ACTIVE", onSite: id !== "gid1",
    })) },
    "./import-queue": { importStatuses: async () => [] },
  });
  const first = await api.readCatalogBatch(site, "1", 1, true);
  const second = await api.readCatalogBatch(site, "1", 2, true);
  assert.deepEqual([first.more, second.more], [true, false]);
  assert.deepEqual([...first.items, ...second.items].map(item => item.id),
    rows.filter(row => row.shopify_product_id).map(row => row.source_id));
  assert.deepEqual(requests.map(r => [r.shopify_product_id, r.review_state, r.category_ids, r.offset]), [
    ["not.is.null", undefined, "ov.{1}", "0"], ["not.is.null", undefined, "ov.{1}", "12"],
  ]);
  assert.equal(first.items[0].shopifyStatus, "DRAFT");
  assert.equal(first.items[0].siteUrl, undefined);
  assert.equal(first.items[1].siteUrl, "/p/example-product");
});
test("monitor imports an individual discovery or the full pending list across pages", async () => {
  const ids = Array.from({ length: 312 }, (_, index) => String(index + 1)).sort();
  const candidates = ids.map(source_id => ({
    source_id, title: "New product", revision: "r", category_ids: ["1"], shopify_product_id: null,
  }));
  const tasks = [];
  const queried = [];
  const preview = {
    source_id: "9", review_state: "pending", revision: "r", manual_price: null, shopify_product_id: null,
    snapshot: { variants: [{ price: 100, regular: 100 }] },
  };
  const api = moduleFor("import-queue", {
    "server-only": {}, "@/lib/shopify/config": { shopDomain: () => "shop.example" },
    "./catalog-model": moduleFor("catalog-model"),
    "./shopify": { importDraft: async row => { assert.equal(row, preview); preview.review_state = "known"; } },
    "./storage": {
      shopFilter: () => ({ shop_domain: "eq.shop.example" }), getPreview: async () => preview,
      supplierRequest: async (table, method, filters, values) => {
        if (table === "ahim_supplier_previews") {
          assert.equal(filters.review_state,"eq.pending");
          assert.equal(filters.shopify_product_id,"is.null");
          assert.equal(filters.supplier,"eq.example.com");
          queried.push(filters.source_id);
          if (filters.source_id?.startsWith("in.")) return candidates.filter(row => row.source_id === "9");
          return candidates.filter(row => !filters.source_id || row.source_id > filters.source_id.slice(3)).slice(0,300);
        }
        if (method === "POST") { tasks.push(...values); return values; }
        if (method === "PATCH") return [{ ...tasks[0], ...values }];
        if (filters.available_at) return [tasks[0]];
        return [];
      },
    },
  });
  const site = { domain: "example.com", percent: 0, categories: [{ id: "1", parent: "0" }], mappings: { "1": ["collection"] } };
  assert.equal((await api.queueImports(site, ["9"], undefined, "draft", "pending")).queued, 1);
  assert.equal(tasks[0].source_id, "9");
  tasks[0].manual_price = null;
  await api.processNextImport();
  assert.equal(preview.review_state, "known");
  tasks.length = 0;
  assert.equal((await api.queueImports(site, [], "", "draft", "pending")).queued, ids.length);
  assert.deepEqual(queried, ["in.(9)",undefined,"gt." + ids[299]]);
  assert.deepEqual(tasks.map(task => task.source_id), ids);
  assert.ok(tasks.every(task => task.intent === "draft"));
});
test("publishing a selection imports once and resumes from its linked draft after a publication failure", async () => {
  const task = {domain:"example.com",source_id:"1",revision:"r",manual_price:null,percent:10,
    collection_ids:["collection"],intent:"publish",attempts:0,state:"queued"};
  const row = {source_id:"1",revision:"r",manual_price:null,review_state:"known",scan_error:null,
    shopify_product_id:null,snapshot:{variants:[{price:100,regular:100}]}};
  const calls=[];
  const api=moduleFor("import-queue",{
    "server-only":{}, "@/lib/shopify/config":{}, "./catalog-model":moduleFor("catalog-model"),
    "./storage":{shopFilter:()=>({}),getPreview:async()=>({...row}),
      supplierRequest:async(_,method,filters,values)=>{
        if(method==="PATCH")Object.assign(task,values);
        return [{...task}];
      }},
    "./shopify":{importDraft:async(_,collections,p)=>{
      assert.deepEqual(collections,["collection"]);assert.equal(p.variants[0].price,110);
      row.shopify_product_id="existing-draft";calls.push("import");return {id:"existing-draft"};
    }},
    "./publication":{refreshLinkedProduct:async(p,publish)=>{
      assert.equal(p.shopify_product_id,"existing-draft");assert.equal(publish,true);
      calls.push("publish");if(calls.length===2)throw Error("temporary");return {live:true};
    }},
  });
  await api.processNextImport();
  assert.equal(task.state,"queued");assert.equal(task.error,"temporary");
  await api.processNextImport();
  assert.deepEqual(calls,["import","publish","publish"]);assert.equal(task.state,"done");
});
test("bulk publication includes existing drafts, skips live products and isolates missing mappings", async () => {
  const products=["1","2","3","4"].map((id,i)=>({source_id:id,revision:"r",manual_price:null,
    category_ids:i===3?[]:["1"],collection_ids:["approved"],shopify_product_id:i<2?"gid"+id:null}));
  let submitted=[];
  const api=moduleFor("import-queue",{
    "server-only":{},"@/lib/shopify/config":{shopDomain:()=>"shop.test"},"./catalog-model":moduleFor("catalog-model"),"./shopify":{},
    "./publication":{catalogPublicationStates:async()=>[{id:"gid1",status:"DRAFT",onSite:false},{id:"gid2",status:"ACTIVE",onSite:true}]},
    "./storage":{shopFilter:()=>({}),supplierRequest:async(table,method,params,body)=>{
      if(table==="ahim_supplier_previews"){assert.equal(params.shopify_product_id,undefined);return products}
      if(method==="POST"){submitted=body;return body}
      return [];
    }},
  });
  const result=await api.queueImports({domain:"vendor.test",categories:[{id:"1",parent:"0"}],mappings:{1:["collection"]},percent:0},[],"","publish");
  assert.deepEqual(submitted.map(t=>[t.source_id,t.intent,t.collection_ids]),[["1","publish",["approved"]],["3","publish",["collection"]]]);
  assert.equal(result.queued,2);assert.equal(result.skipped.length,2);
});
