import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const winning = JSON.parse(
  readFileSync("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
)[0].log;
// Test-only service boundary. Uses real browser Wasm for every game transition,
// frozen opening and commitment. No fake wallet or Registry enters release code.
async function mockChain(
  page: Page,
  paid = false,
  six = false,
  company = false,
) {
  await page.route(/\/src\/near\/chain\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    import * as engine from '/src/game/engine.ts';
    import {digest,supportedContentHash} from '/src/near/jobs.ts';
    const accountId='owner.testnet',paid=${paid},six=${six},companyMode=${company};
    const ids=['rook','mallow','nix','dot','brisk','peebles'],indices=[0,1,3,4,5,6],names=['Rook','Mallow','Nix','Dot','Brisk','Peebles'],roles=['courier','shieldbearer','mage','courier','shieldbearer','mage'],options=[['fire','shouting'],['shouting','friendly'],['fire','friendly'],['shouting','friendly'],['fire','friendly'],['fire','shouting']];
    const activeAccount=()=>localStorage.getItem('test-account')||(paid?'renter.testnet':accountId);
    const fee=()=>localStorage.getItem('test-price')||'4000000000000000000001';
    const stored=()=>JSON.parse(localStorage.getItem('test-chain')||'null');
    const put=(v)=>{localStorage.setItem('test-chain',JSON.stringify(v));const jobs=JSON.parse(localStorage.getItem('test-jobs')||'{}');jobs[v.job_id]=v;localStorage.setItem('test-jobs',JSON.stringify(jobs));};
    const height=()=>Number(localStorage.getItem('test-height')||'100');
    export function createChainClient(){return {
      async account(){return activeAccount();},
      async connect(){},async disconnect(){localStorage.setItem('test-account','other.testnet');},
      async view(method,args){
        if(localStorage.getItem('test-outage')) throw Error('Testnet is unavailable.');
        const current=stored(),jobs=JSON.parse(localStorage.getItem('test-jobs')||'{}');if(current)jobs[current.job_id]=current;const index=Math.max(0,ids.indexOf(args.token_id||current?.token_id||'rook')),token=ids[index];const job=args.job_id!==undefined?jobs[args.job_id]:Object.values(jobs).filter(j=>j.token_id===token).sort((a,b)=>Number(b.job_id)-Number(a.job_id))[0]||null;
        if(method==='get_economy'){
          if(!companyMode)return null;
          const initial={version:3,enabled:true,sponsor:'owner.testnet',company:null,stage:0,project:{batch:'0',funded:true,restored:false,slots:[0,0,0,0,0,0,0,0,0],reservations:[null,null,null,null,null,null,null,null,null],unreserved:'500000000000000000000000',reserved:'0',paid:'0'},commissions:[0,1,2].map(i=>({commission_id:String(i),dispatch_id:'0',objective:'routine',payment:'50000000000000000000000',setup_ids:engine.content().filter(s=>s.name===['Dock Fire','Bridge Audit','Friday, Again'][i]).map(s=>s.id),terms_hash:'dGVybXM=',available:true,charter_required:false}))};
          return JSON.parse(localStorage.getItem('test-economy')||JSON.stringify(initial));
        }
        if(method==='get_market')return Promise.all((six?ids:['rook']).map(token_id=>this.view('get_worker',{token_id})));
        if(method==='find_cheapest')return (await this.view('get_market',{})).filter(w=>w.status==='idle'&&w.packages.includes(args.package)&&BigInt(w.quotes[w.packages.indexOf(args.package)])<=BigInt(args.max_price)).sort((a,b)=>a.token.token_id.localeCompare(b.token.token_id))[0]||null;
        if(method==='get_worker')return {token:{token_id:token,owner_id:localStorage.getItem('test-owner-'+token)||accountId},worker_account:token+'.registry.testnet',character:names[index],role:roles[index],packages:options[index],visual_identity:token,status:['active','payment_pending','recovery_pending'].includes(job?.status)?job.status:job&&job.status!=='cancelled'?'cooldown':'idle',job,block_height:String(height()),job_storage_deposit:'30000000000000000000000',lease_blocks:'2400',cooldown_blocks:'20',content_hash:localStorage.getItem('test-bad-content') || await supportedContentHash(),...(paid?{paid_enabled:true,offer:{package_option:0,starting_ask:fee(),floor_ask:fee(),discount_step:'0',available_since:'100'},quote:fee(),offers:[{package_option:0,starting_ask:fee(),floor_ask:fee(),discount_step:'0',available_since:'100'},...(six?[{package_option:1,starting_ask:'5000000000000000000000',floor_ask:'1000000000000000000000',discount_step:'0',available_since:'100'}]:[null])],quotes:[fee(),six?'5000000000000000000000':null],recent_paid_hires:job&&job.accepted_fee!=='0'&&['active','saved','expired'].includes(job.status)?[job]:[],claim:JSON.parse(localStorage.getItem('test-claim')||'null')}: {})};
        if(method==='accounting')return {reserve:'1000000000000000000000000',balance:'3000000000000000000000000',staged:'0',recognized:'3800000000000000000001',paid:'0',claimable:localStorage.getItem('test-claimed')?'0':'3800000000000000000001'};
        if(method==='get_job')return job;
        if(method==='get_opening')return JSON.parse(JSON.stringify(engine.configure(job.config)),(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
        if(method==='get_job_record')return job.record;
        throw Error('Unexpected test view '+method);
      },
      async resolve(){return localStorage.getItem('test-tx-failed')?'failed':'pending';},
      async change(method,args,deposit){
        const counts=JSON.parse(localStorage.getItem('test-calls')||'{}');counts[method]=(counts[method]||0)+1;localStorage.setItem('test-calls',JSON.stringify(counts));
        if(localStorage.getItem('test-cancel')) {localStorage.removeItem('test-cancel');throw Error('User rejected signature');}
        if(method==='open_owned_job'||method==='hire_and_open'){
          if(deposit!==30000000000000000000000n+(method==='hire_and_open'?BigInt(args.package_option===1?'5000000000000000000000':fee()):0n)-BigInt(args.commission?.company_contribution||'0'))throw Error('Wrong deposit');
          const config={setup_id:args.setup_id,placement:args.placement,worker:indices[ids.indexOf(args.token_id)],package_option:args.package_option};
          const s=engine.configure(config);
          put({job_id:String(Number(stored()?.job_id??-1)+1),renter_id:activeAccount(),token_id:args.token_id,worker_account:args.token_id+'.registry.testnet',config,unit_slot:config.placement==='escort'?1:4,rules_version:s.log.rules_version,content_version:s.log.content_version,content_hash:localStorage.getItem('test-bad-content') || await supportedContentHash(),setup_hash:await digest(new TextEncoder().encode(JSON.stringify(s.setup))),accepted_fee:method==='hire_and_open'?(args.package_option===1?'5000000000000000000000':fee()):'0',credit_status:paid?'staged':'none',created_at_block:'100',expires_at_block:'2500',status:localStorage.getItem('test-credit-pending')?'payment_pending':'active',cooldown_until:'0',record:null,bond:String(deposit),storage_bytes:500,refund_owed:'0',refund_in_flight:false});
          if(args.commission){const e=await this.view('get_economy',{}),j=stored();const order=e.commissions.find(c=>c.commission_id===args.commission.commission_id);j.employment={commission_id:order.commission_id,dispatch_id:order.dispatch_id,leg:e.company?.dispatch.completed||0,objective:order.objective,payment:order.payment,company_contribution:args.commission.company_contribution,earned:'0',closed:false};e.company??={account_id:activeAccount(),deliveries:'0',funds:'0',active_job:null,dispatch:{dispatch_id:'0',completed:0,fulfilled:0,jobs:[null,null,null]},withdrawal:{withdrawal_id:'0',amount:'0',status:'none'}};e.company.active_job=j.job_id;e.company.funds=String(BigInt(e.company.funds)-BigInt(args.commission.company_contribution));order.available=false;put(j);localStorage.setItem('test-economy',JSON.stringify(e));}
        } else if(method==='reconcile_payment'){const job=stored();job.status='active';job.credit_status='finalized';put(job);
        } else if(method==='cancel_pending_hire'){const job=stored();job.status='cancelled';job.credit_status='reversed';put(job);
        } else if(method==='nft_transfer'){if(deposit!==1n)throw Error('Need one yocto');localStorage.setItem('test-owner-'+args.token_id,args.receiver_id);
        } else if(method==='request_claim'){localStorage.setItem('test-claim',JSON.stringify({claim_id:'0',recipient:activeAccount(),amount:args.amount,status:'pending'}));
        } else if(method==='reconcile_claim'){const claim=JSON.parse(localStorage.getItem('test-claim'));claim.status='paid';localStorage.setItem('test-claim',JSON.stringify(claim));localStorage.setItem('test-claimed','1');
        } else if(method==='set_offer'||method==='withdraw_offer'){} else if(method==='settle'){
          if(localStorage.getItem('test-pending'))return {hash:'pending-test-transaction',signer:accountId};
          const job=stored(),log=JSON.parse(args.action_log),state=engine.replay(log).state;
          const setup=Uint8Array.from(atob(job.setup_hash),c=>c.charCodeAt(0)),canonical=engine.canonical(log),combined=new Uint8Array(setup.length+canonical.length);combined.set(setup);combined.set(canonical,setup.length);
          job.record={outcome:state.outcome,round:state.round,cart_hp:state.cart_hp,strikes:state.strikes,borrows:0,clauses:[],commitment:await digest(combined),final_hash:await digest(new TextEncoder().encode(JSON.stringify(state))),confirmed_block:'110'};
          job.status='saved';job.storage_bytes=800;
          if(job.employment){const e=await this.view('get_economy',{});job.employment.earned=state.outcome==='delivered'?job.employment.payment:'0';job.employment.closed=true;e.company.funds=String(BigInt(e.company.funds)+BigInt(job.employment.earned));e.company.deliveries=String(Number(e.company.deliveries)+Number(job.employment.earned!=='0'));e.company.active_job=null;e.company.dispatch.completed++;e.company.dispatch.jobs[job.employment.leg]=job.job_id;e.company.dispatch.fulfilled+=Number(job.employment.earned!=='0');localStorage.setItem('test-economy',JSON.stringify(e));}put(job);
        } else if(method==='withdraw_company_funds'){const e=await this.view('get_economy',{});e.company.funds=String(BigInt(e.company.funds)-BigInt(args.amount));e.company.withdrawal={withdrawal_id:'1',amount:args.amount,status:'paid'};localStorage.setItem('test-economy',JSON.stringify(e));} else if(method==='expire'){const job=stored();job.status='expired';put(job);}
        return {hash:'test-transaction',signer:accountId};
      }
    }};
  `,
    }),
  );
}
async function openJob(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Reserve Rook", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
}
async function win(page: Page) {
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  for (const command of winning.commands) {
    if (command.kind === "end_phase") {
      await page
        .getByRole("button", { name: "End Phase", exact: true })
        .click();
      await confirm(page);
    } else {
      await page.getByRole("button", { name: /^Captain / }).click();
      await page.locator('[data-cell="' + command.path.at(-1) + '"]').click();
      await page
        .getByRole("button", { name: "Push Cart", exact: true })
        .click();
      await confirm(page);
    }
  }
  await expect(page.getByRole("heading", { name: "Job Done" })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await mockChain(page);
});
test("owner reserves, plays, refreshes and saves only after a verified record", async ({
  page,
}) => {
  await openJob(page);
  await win(page);
  await expect(
    page.getByRole("button", { name: "Save Job", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "View result", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Job Done" })).toBeVisible();
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(page.getByText(/^Job saved · Delivered/)).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("test-calls")!)),
  ).toEqual({ open_owned_job: 1, settle: 1 });
});
test("submitted Save Job survives refresh without optimistic success or duplicate submission", async ({
  page,
}) => {
  await openJob(page);
  await win(page);
  await page.evaluate(() => localStorage.setItem("test-pending", "1"));
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save Job", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Submitted. Waiting for the Registry to confirm."),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByText("Submitted. Waiting for the Registry to confirm."),
  ).toBeVisible();
  await expect(page.getByText(/^Job saved/)).toHaveCount(0);
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-calls")!).settle,
    ),
  ).toBe(1);
  await page.evaluate(() => {
    localStorage.removeItem("test-pending");
    localStorage.setItem("test-tx-failed", "1");
  });
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry Save Job", exact: true })
    .click();
  await expect(page.getByText(/^Job saved · Delivered/)).toBeVisible();
});
test("wallet rejection keeps the job and RPC outage keeps Free Play available", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.evaluate(() => localStorage.setItem("test-cancel", "1"));
  await page.getByRole("button", { name: "Reserve Rook", exact: true }).click();
  await expect(
    page.getByText("Signature cancelled. Your actions are kept."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reserve Rook", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => localStorage.setItem("test-outage", "1"));
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(page.getByText(/Testnet is unavailable/)).toBeVisible();
  await page.getByRole("button", { name: "Play Free", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Captain / })).toBeVisible();
});
test("account switch prevents signing another renter's saved battle", async ({
  page,
}) => {
  await openJob(page);
  await win(page);
  await page.evaluate(() =>
    localStorage.setItem("test-account", "other.testnet"),
  );
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(
    page.getByText(/Connect owner.testnet to sign this job/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-calls")!).settle ?? 0,
    ),
  ).toBe(0);
});
test("Infiltration freezes the enemy slot and restores a move after refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Contract Job", exact: true })
    .getByRole("combobox", { name: "Placement", exact: true })
    .selectOption("infiltration");
  await page.getByRole("button", { name: "Reserve Rook", exact: true }).click();
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Crew actions" })
      .getByRole("button", { name: /^Rook / }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.locator('[data-cell="38"]').click();
  await page.getByRole("button", { name: "Push Cart", exact: true }).click();
  await confirm(page);
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  await expect(page.getByTestId("pushes")).toHaveText("1 / 3");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-chain")!).unit_slot,
    ),
  ).toBe(4);
});
test("expiry releases the worker without creating a defeat record", async ({
  page,
}) => {
  await openJob(page);
  await page.evaluate(() => localStorage.setItem("test-height", "2500"));
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Release worker", exact: true })
    .click();
  await expect(
    page.getByText("Lease expired. No battle result was saved."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-chain")!).record,
    ),
  ).toBeNull();
});
test("unsupported chain content is rejected before a storage deposit is signed", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("test-bad-content", "unsupported"),
  );
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Reserve Rook", exact: true }).click();
  await expect(page.getByText(/The game content changed/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("test-calls")),
  ).toBeNull();
});

test("renter confirms exact fee, plays and saves the frozen paid job", async ({
  page,
}) => {
  await mockChain(page, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByText("Hire fee: 0.004000000000000000000001 testnet NEAR"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await win(page);
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(page.getByText(/^Job saved · Delivered/)).toBeVisible();
});
test("pending paid hire survives refresh and can activate or fully cancel without another hire", async ({
  page,
}) => {
  await mockChain(page, true);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("test-credit-pending", "1"));
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel hire", exact: true }).click();
  await expect(
    page.getByText("Hire cancelled. Fee and storage deposit returned."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-calls")!).hire_and_open,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await page
    .getByRole("button", { name: "Check payment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
});
test("a changed price needs a new visible confirmation and rejected hire can retry", async ({
  page,
}) => {
  await mockChain(page, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.evaluate(() =>
    localStorage.setItem("test-price", "5000000000000000000000"),
  );
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(page.getByText(/Price or availability changed/)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("test-calls") || "{}").hire_and_open ??
        0,
    ),
  ).toBe(0);
  await page.evaluate(() => localStorage.setItem("test-cancel", "1"));
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByText("Signature cancelled. Your actions are kept."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
});
test("owner claim stays pending across refresh until the worker confirms payment", async ({
  page,
}) => {
  await mockChain(page, true);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("test-account", "owner.testnet"),
  );
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByText("Owner tools", { exact: true }).click();
  await page.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check claim", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(page.getByText(/^Earnings claimed/)).toHaveCount(0);
  await page.getByText("Owner tools", { exact: true }).click();
  await page.getByRole("button", { name: "Check claim", exact: true }).click();
  await expect(page.getByText(/^Earnings claimed ·/)).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("test-calls")!).request_claim,
    ),
  ).toBe(1);
});

test("reconnect restores a newer paid job opened in another browser", async ({
  page,
}) => {
  await mockChain(page, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await win(page);
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(page.getByText(/^Job saved · Delivered/)).toBeVisible();
  await page.getByRole("button", { name: "Job Board", exact: true }).click();
  await page.evaluate(() => {
    const job = JSON.parse(localStorage.getItem("test-chain")!);
    job.job_id = "1";
    job.status = "active";
    job.record = null;
    localStorage.setItem("test-chain", JSON.stringify(job));
  });
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Job 1 · escort · First Shift")).toBeVisible();
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Captain / })).toBeVisible();
});

test("six-worker hall compares both packages, signs the selected Infiltration and locks both offers", async ({
  page,
}) => {
  await mockChain(page, true, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  for (const name of ["Rook", "Mallow", "Nix", "Dot", "Brisk", "Peebles"])
    await expect(
      page.getByRole("button", { name: new RegExp(`^${name} ·`) }),
    ).toBeVisible();
  await page.getByRole("button", { name: /^Peebles ·/ }).click();
  await page
    .getByRole("region", { name: "Contract Job", exact: true })
    .getByRole("button", { name: /^Desk Swap/ })
    .click();
  await page
    .getByRole("region", { name: "Contract Job", exact: true })
    .getByRole("combobox", { name: /^Placement/ })
    .selectOption("infiltration");
  await expect(
    page.getByText("Peebles joins the enemy crew.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
  const job = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test-chain")!),
  );
  expect(job.token_id).toBe("peebles");
  expect(job.config).toMatchObject({
    worker: 6,
    package_option: 1,
    placement: "infiltration",
  });
  await expect(
    page.getByRole("button", { name: "Hire", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("region", { name: "Contract Job", exact: true })
    .getByRole("button", { name: /^Smoke Break/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Hire", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
});

test("Find Cheapest shows the selected live package without opening a shift", async ({
  page,
}) => {
  await mockChain(page, true, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByText("Find a lower fee", { exact: true }).click();
  await page.getByRole("combobox", { name: /^Package/ }).selectOption("fire");
  await page.getByLabel("Maximum fee (NEAR)").fill("0.005");
  await page
    .getByRole("button", { name: "Find Cheapest", exact: true })
    .click();
  await expect(
    page.getByText("Brisk selected. Review the package and fee before Hire."),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Contract Job", exact: true })
      .getByRole("button", { name: /^Smoke Break/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() => localStorage.getItem("test-chain")),
  ).toBeNull();
  await page.getByLabel("Maximum fee (NEAR)").fill("0.0001");
  await page
    .getByRole("button", { name: "Find Cheapest", exact: true })
    .click();
  await expect(
    page.getByText("No available offer within that fee."),
  ).toBeVisible();
});

test("owner transfer refreshes current title and keeps active renter rights", async ({
  page,
}) => {
  await mockChain(page, true, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("test-account", "owner.testnet"),
  );
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await page.getByText("Owner tools", { exact: true }).click();
  await page.getByText("Identity & hire details", { exact: true }).click();
  await page.getByLabel("New owner", { exact: true }).fill("carol.testnet");
  await page.getByRole("button", { name: "Transfer NFT", exact: true }).click();
  await expect(
    page.getByText("Owner: carol.testnet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Transfer NFT", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    localStorage.setItem("test-account", "renter.testnet"),
  );
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
  const job = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("test-chain")!),
  );
  expect(job.renter_id).toBe("renter.testnet");
});

test("switching workers keeps each active job's local moves", async ({
  page,
}) => {
  await mockChain(page, true, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  await page.getByRole("button", { name: /^Captain / }).click();
  await page.getByRole("button", { name: "Guard", exact: true }).click();
  await confirm(page);
  await expect(page.getByRole("button", { name: /^Captain ✓/ })).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByRole("button", { name: /^Peebles ·/ }).click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByText("Job 1 · escort", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByText("Job 1 · escort", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Rook ·/ }).click();
  await expect(
    page.getByText("Job 0 · escort", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume Job", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Captain ✓/ })).toBeVisible();
});

test("Hiring Hall and owner controls fit a narrow screen with enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockChain(page, true, true);
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    localStorage.setItem("test-account", "owner.testnet");
  });
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await page.getByText("Owner tools", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Transfer NFT", exact: true }),
  ).toBeVisible();
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent?.slice(0, 60),
        cls: el.className,
        right: Math.round(el.getBoundingClientRect().right),
      }))
      .slice(0, 20),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    JSON.stringify(overflow),
  ).toBe(true);
  await expect(page.getByRole("button", { name: /^Peebles ·/ })).toBeVisible();
});

test("job selection and house crew carry through the Hiring Hall", async ({
  page,
}) => {
  await mockChain(page, true, true);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Connect Wallet", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "/tmp/mutiny-ui-title.png" });
  await page.getByRole("button", { name: "Job Board", exact: true }).click();
  await page.getByRole("button", { name: "Toll Gate", exact: true }).click();
  await page
    .getByRole("combobox", { name: "House worker", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
  await page.getByRole("button", { name: "Nix · mage", exact: true }).click();
  await page.getByRole("button", { name: /^Clean Shot/ }).click();
  await page
    .getByRole("combobox", { name: "Placement", exact: true })
    .selectOption("infiltration");
  await expect(
    page.getByText("Bridge Audit · Toll Gate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nix joins the enemy crew.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Free Play", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "House worker", exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("combobox", { name: "Placement", exact: true }),
  ).toHaveValue("infiltration");
  await expect(
    page.getByRole("button", { name: "Toll Gate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: "/tmp/mutiny-ui-preparation.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bridge Audit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("grid").getByRole("button", { name: /Wisp, enemy, mage/ }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/mutiny-ui-battle.png", fullPage: true });
  expect(
    await page.evaluate(() => localStorage.getItem("test-calls")),
  ).toBeNull();
});

test("company chooses funded work, earns confirmed funds and recovers its dispatch after refresh", async ({
  page,
}) => {
  await mockChain(page, true, true, true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your company", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hire", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Choose work", exact: true })
    .first()
    .click();
  await expect(
    page.getByText(
      "Wallet payment: 0.034000000000000000000001 NEAR, including the storage deposit, plus gas.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await win(page);
  await expect(page.getByLabel("Confirmed company result")).toHaveCount(0);
  await page.getByRole("button", { name: "Save Job", exact: true }).click();
  await expect(page.getByLabel("Confirmed company result")).toContainText(
    "Commission earned: 0.05 testnet NEAR",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your company has a name on the door." }),
  ).toBeVisible();
  await expect(
    page.getByText("1/3 legs complete. Leave and return after any leg."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw 0.05 NEAR", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Choose work", exact: true })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Dot · courier", exact: true })
    .click();
  await expect(
    page.getByText("Company funds used: 0.004000000000000000000001 NEAR"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Withdraw 0.05 NEAR", exact: true })
    .click();
  await expect(page.getByText("Withdrawal confirmed.")).toBeVisible();
});
test("depleted project keeps earned funds and shows no payable work", async ({
  page,
}) => {
  await mockChain(page, true, true, true);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "test-economy",
      JSON.stringify({
        version: 3,
        enabled: true,
        sponsor: "owner.testnet",
        company: null,
        stage: 3,
        project: {
          batch: "0",
          funded: true,
          restored: true,
          slots: Array(9).fill(2),
          reservations: Array(9).fill(null),
          unreserved: "0",
          reserved: "0",
          paid: "500000000000000000000000",
        },
        commissions: [],
      }),
    ),
  );
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(page.getByText(/^No funded work\./)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hire", exact: true }),
  ).toBeDisabled();
});

test("company remains readable on a narrow screen with enlarged text", async ({
  page,
}) => {
  await mockChain(page, true, true, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.addStyleTag({ content: "html {font-size: 200%}" });
  await page
    .getByRole("button", { name: "Run a company", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your company", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose work", exact: true })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Hire", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/mutiny-company-mobile.png",
    fullPage: true,
  });
});
