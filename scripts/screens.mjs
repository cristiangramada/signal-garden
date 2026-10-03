const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,channel:"msedge"});const page=await browser.newPage({viewport:{width:1440,height:1050}});await page.goto('http://localhost:4317');await page.screenshot({path:'artifacts/home-desktop.png',fullPage:true});console.log(await page.title());await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/home-mobile.png',fullPage:true});console.log('overflow',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));await browser.close();



