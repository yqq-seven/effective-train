// Run with PLAYWRIGHT_MODULE pointing at an installed Playwright package.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root,'app.js'),'utf8');
const users = [...appSource.matchAll(/username: '([^']+)', password: '([^']+)'/g)].map(m=>({name:m[1],password:m[2]}));
const output=path.join(root,'.verification'); fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
  if(!['index.html','styles.css','app.js'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(root,name)));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai'});
    await context.route('**/fonts.googleapis.com/**',r=>r.abort());
    const page=await context.newPage(); page.setDefaultTimeout(8000);
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    const check=async(condition,message)=>assert.ok(await condition,message);
    const close=async()=>{try {await page.locator('.notice-modal [data-action="close-modal"]').click();} catch(error) {console.log('SAVE FAILURE:', await page.locator('#toast').innerText(), await page.locator('#modalRoot').innerText(), errors);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw error;}};
    await page.goto(url);
    await page.locator('[name="username"]').fill('yqq');
    await page.locator('[name="password"]').fill('wrong-password');
    await page.locator('#loginForm button').click();
    await check(page.locator('#loginForm').isVisible(),'invalid password accepted');
    await page.locator('[name="password"]').fill(users.find(u=>u.name==='yqq').password);
    await page.locator('#loginForm button').click();
    await page.locator('.bottom-nav [data-page="profile"]').click();
    await page.locator('[data-action="weight"]').click();
    const today=await page.locator('#weightForm [name="date"]').inputValue();
    await page.locator('#weightForm [name="weight"]').fill('60');
    await page.locator('#weightForm button').click(); await close();
    assert.equal(await page.locator('.chart-point').count(),1);
    assert.equal(await page.locator('.chart-line').count(),0);
    await page.locator('[data-action="weight"]').click();
    await page.locator('#weightForm [name="weight"]').fill('65');
    await page.locator('#weightForm button').click();
    await check(page.locator('#weightForm').isVisible(),'duplicate form unexpectedly closed');
    assert.match(await page.locator('#toast').innerText(),/每天只能保存一次/);
    await page.locator('.modal-close button').click();
    assert.match(await page.locator('.weight-latest').innerText(),/60 kg/);
    console.log('PASS daily weight uniqueness and single-point boundary');

    await page.locator('.bottom-nav [data-page="plans"]').click();
    await page.locator('[data-action="create-plan"]').click();
    await page.locator('#planForm [name="name"]').fill('热身拉伸');
    await page.locator('#planForm [name="detail"]').fill('肩颈、膝盖、髋部');
    await page.locator('#planForm [name="duration"]').fill('5');
    await page.locator('#planForm button').click(); await close();
    await page.locator('[data-plan-check]').check();
    await page.locator('[data-action="edit-plan"]').click();
    await page.locator('#planForm [name="duration"]').fill('8');
    await page.locator('#planForm button').click(); await close();
    await check(page.locator('[data-plan-check]').isChecked(),'edit lost completed status');
    await page.locator('[data-action="use-template"]').first().click(); await close();
    assert.equal(await page.locator('.plan-task').count(),2);
    await page.screenshot({path:path.join(output,'plans.png'),fullPage:true});
    await page.reload(); await page.locator('.bottom-nav [data-page="plans"]').click();
    assert.equal(await page.locator('.plan-task').count(),2);
    await check(page.locator('[data-plan-check]').first().isChecked(),'reload lost task completion');
    await page.locator('[data-kind="plan"][data-delta="-1"]').click();
    assert.equal(await page.locator('.plan-task').count(),0);
    console.log('PASS plan creation/edit/completion/date isolation/reload');

    await page.locator('.bottom-nav [data-page="diet"]').click();
    assert.equal(await page.locator('.bottom-nav [data-page="ranking"]').count(),0);
    await page.locator('[data-action="add-meal"]').first().click();
    await page.locator('#mealForm [name="name"]').fill('全麦面包');
    await page.locator('#mealForm [name="calories"]').fill('120');
    await page.locator('#mealForm [name="time"]').fill('08:00');
    // Generated test image is used only in this isolated browser context.
    const photo=await page.screenshot();
    await page.locator('#mealPhoto').setInputFiles({name:'meal.png',mimeType:'image/png',buffer:photo});
    await page.locator('#mealImagePreview img').waitFor();
    await page.locator('#mealForm button').click(); await close();
    await check(page.locator('.meal-photo img').isVisible(),'meal photo missing');
    await page.locator('[data-action="edit-meal"]').click();
    await page.locator('#mealForm [name="calories"]').fill('150');
    await page.locator('#mealForm button').click(); await close();
    assert.equal(await page.locator('.diet-summary strong').first().innerText(),'150');
    await page.screenshot({path:path.join(output,'diet.png'),fullPage:true});
    await page.locator('[data-kind="diet"][data-delta="-1"]').click();
    assert.equal(await page.locator('.meal-card').count(),0);
    await page.locator('#dietDate').fill(today); await page.locator('#dietDate').dispatchEvent('change');
    assert.equal(await page.locator('.meal-card').count(),1);
    await page.locator('[data-action="delete-meal"]').click();
    await page.locator('.confirm-actions [data-action="close-modal"]').click();
    assert.equal(await page.locator('.meal-card').count(),1);
    console.log('PASS diet photo/create/edit/date filter/delete cancellation');

    const other=await context.newPage(); await other.goto(url);
    await other.locator('[name="username"]').fill('yqq');
    await other.locator('[name="password"]').fill(users.find(u=>u.name==='yqq').password);
    await other.locator('#loginForm button').click();
    await other.locator('.bottom-nav [data-page="diet"]').click();
    await page.locator('[data-action="delete-meal"]').click();
    await page.locator('[data-action="confirm"]').click();
    await other.waitForFunction(()=>!document.querySelector('.meal-card'));
    console.log('PASS same-browser live storage update');
    await page.locator('.bottom-nav [data-page="profile"]').click();
    await page.locator('.profile-link').click();
    await check(page.locator('.rank-list').isVisible(),'profile ranking missing');
    assert.equal(await page.locator('.bottom-nav .active').getAttribute('data-page'),'profile');
    await page.locator('.bottom-nav [data-page="profile"]').click();
    await page.locator('[data-action="logout"]').click();
    await page.locator('[name="username"]').fill('ybb');
    await page.locator('[name="password"]').fill(users.find(u=>u.name==='ybb').password);
    await page.locator('#loginForm button').click();
    await page.locator('.bottom-nav [data-page="profile"]').click();
    assert.equal(await page.locator('.chart-point').count(),0);
    console.log('PASS revised account login and account data isolation');
    assert.deepEqual(errors,[]);
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:844});
      await check(page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal page overflow');
    }
    console.log('PASS mobile layout and no browser errors');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
