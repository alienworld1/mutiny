import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const winning = JSON.parse(
  readFileSync("crates/game-core/tests/fixtures/winning-logs.json", "utf8"),
)[0].log;
// Test-only service boundary. Uses real browser Wasm for every game transition,
// frozen opening and commitment. No fake wallet or Registry enters release code.
async function mockChain(page: Page, paid = false) {
  await page.route(/\/src\/near\/chain\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    import * as engine from '/src/game/engine.ts';
    import {digest,supportedContentHash} from '/src/near/jobs.ts';
    const accountId='owner.testnet',paid=${paid};
    const activeAccount=()=>localStorage.getItem('test-account')||(paid?'renter.testnet':accountId);
    const fee=()=>localStorage.getItem('test-price')||'4000000000000000000001';
    const stored=()=>JSON.parse(localStorage.getItem('test-chain')||'null');
    const put=(v)=>localStorage.setItem('test-chain',JSON.stringify(v));
    const height=()=>Number(localStorage.getItem('test-height')||'100');
    export function createChainClient(){return {
      async account(){return activeAccount();},
      async connect(){},async disconnect(){localStorage.setItem('test-account','other.testnet');},
      async view(method,args){
        if(localStorage.getItem('test-outage')) throw Error('Testnet is unavailable.');
        const job=stored();
        if(method==='get_worker')return {token:{token_id:'rook',owner_id:accountId},worker_account:'rook.registry.testnet',character:'Rook',role:'courier',packages:['fire','shouting'],visual_identity:'rook',status:['active','payment_pending','recovery_pending'].includes(job?.status)?job.status:job&&job.status!=='cancelled'?'cooldown':'idle',job,block_height:String(height()),job_storage_deposit:'30000000000000000000000',lease_blocks:'2400',cooldown_blocks:'20',content_hash:localStorage.getItem('test-bad-content') || await supportedContentHash(),...(paid?{paid_enabled:true,offer:{package_option:0,starting_ask:fee(),floor_ask:fee(),discount_step:'0',available_since:'100'},quote:fee(),claim:JSON.parse(localStorage.getItem('test-claim')||'null')}: {})};
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
          if(deposit!==30000000000000000000000n+(method==='hire_and_open'?BigInt(fee()):0n))throw Error('Wrong deposit');
          const config={setup_id:args.setup_id,placement:args.placement,worker:0,package_option:args.package_option};
          const s=engine.configure(config);
          put({job_id:String(Number(stored()?.job_id??-1)+1),renter_id:activeAccount(),token_id:'rook',worker_account:'rook.registry.testnet',config,unit_slot:config.placement==='escort'?1:4,rules_version:s.log.rules_version,content_version:s.log.content_version,content_hash:localStorage.getItem('test-bad-content') || await supportedContentHash(),setup_hash:await digest(new TextEncoder().encode(JSON.stringify(s.setup))),accepted_fee:paid?fee():'0',credit_status:paid?'staged':'none',created_at_block:'100',expires_at_block:'2500',status:localStorage.getItem('test-credit-pending')?'payment_pending':'active',cooldown_until:'0',record:null,bond:String(deposit),storage_bytes:500,refund_owed:'0',refund_in_flight:false});
        } else if(method==='reconcile_payment'){const job=stored();job.status='active';job.credit_status='finalized';put(job);
        } else if(method==='cancel_pending_hire'){const job=stored();job.status='cancelled';job.credit_status='reversed';put(job);
        } else if(method==='request_claim'){localStorage.setItem('test-claim',JSON.stringify({claim_id:'0',recipient:activeAccount(),amount:args.amount,status:'pending'}));
        } else if(method==='reconcile_claim'){const claim=JSON.parse(localStorage.getItem('test-claim'));claim.status='paid';localStorage.setItem('test-claim',JSON.stringify(claim));localStorage.setItem('test-claimed','1');
        } else if(method==='set_offer'||method==='withdraw_offer'){} else if(method==='settle'){
          if(localStorage.getItem('test-pending'))return {hash:'pending-test-transaction',signer:accountId};
          const job=stored(),log=JSON.parse(args.action_log),state=engine.replay(log).state;
          const setup=Uint8Array.from(atob(job.setup_hash),c=>c.charCodeAt(0)),canonical=engine.canonical(log),combined=new Uint8Array(setup.length+canonical.length);combined.set(setup);combined.set(canonical,setup.length);
          job.record={outcome:state.outcome,round:state.round,cart_hp:state.cart_hp,strikes:state.strikes,borrows:0,clauses:[],commitment:await digest(combined),final_hash:await digest(new TextEncoder().encode(JSON.stringify(state))),confirmed_block:'110'};
          job.status='saved';job.storage_bytes=800;put(job);
        } else if(method==='expire'){const job=stored();job.status='expired';put(job);}
        return {hash:'test-transaction',signer:accountId};
      }
    }};
  `,
    }),
  );
}
async function openJob(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
  await page.getByRole("button", { name: "Hire", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume Job", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
  await page.getByRole("button", { name: /^Claim 0/ }).click();
  await expect(
    page.getByRole("button", { name: "Check claim", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
  await expect(page.getByText(/^Earnings claimed/)).toHaveCount(0);
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
  await page.getByRole("button", { name: "Contract Job", exact: true }).click();
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
