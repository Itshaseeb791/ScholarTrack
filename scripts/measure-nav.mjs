// Navigation timing on a production server (npm run start -- -p 3100) at 390px with throttled network.
// Reports ms from tap to (ack) first visible acknowledgement and (done) destination heading without loading state.
import { launch, origin } from "./lib/cdp.mjs";

const b = await launch();
try {
  const s = await b.tab();
  await b.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);
  await b.loginOwner(s);
  await b.delay(3000); // let viewport prefetches settle
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: Number(process.env.LATENCY || 300), downloadThroughput: 250_000, uploadThroughput: 100_000 }, s);
  const run = (route) => b.evaluate(s, `(async (route) => {
    const link = [...document.querySelectorAll('nav a')].find((a) => a.getAttribute('href') === route && a.getClientRects().length);
    if (!link) return null;
    const t0 = performance.now(); let ack = null, done = null;
    link.click();
    await new Promise((res) => { const tick = () => {
      const now = performance.now() - t0;
      if (ack === null && (link.querySelector("[data-pending]") || document.querySelector('[data-loading]') || link.getAttribute('aria-current') === 'page')) ack = Math.round(now);
      if (location.pathname === route && document.querySelector('main h1') && !document.querySelector('[data-loading]')) { done = Math.round(now); return res(); }
      if (now > 20000) return res(); requestAnimationFrame(tick); }; tick(); });
    return { ack, done };
  })(${JSON.stringify(route)})`);
  const rows = [];
  for (const route of ["/applications", "/", "/tasks", "/", "/calendar", "/"]) {
    rows.push([route, await run(route)]);
    await b.delay(1500);
  }
  // Cold document loads: first paint of app chrome vs first real heading.
  const cold = [];
  for (const route of ["/", "/tasks", "/", "/tasks"]) {
    const t0 = Date.now();
    await b.send("Page.navigate", { url: origin + route }, s);
    let chrome = null, heading = null;
    while (Date.now() - t0 < 20000 && heading === null) {
      const st = await b.evaluate(s, "({ chrome: !!document.querySelector('nav a'), heading: !!document.querySelector('main h1'), loading: !!document.querySelector('[data-loading]') })").catch(() => null);
      if (st?.chrome && chrome === null) chrome = Date.now() - t0;
      if (st?.heading && !st.loading) heading = Date.now() - t0;
      await b.delay(25);
    }
    cold.push([route, { chrome, heading }]);
  }
  for (const [route, r] of cold) console.log("cold", route.padEnd(8), JSON.stringify(r));
  for (const [route, r] of rows) console.log(route.padEnd(14), JSON.stringify(r));
  const med = (k) => rows.map(([, r]) => r?.[k]).filter((v) => v != null).sort((x, y) => x - y)[Math.floor(rows.length / 2)];
  console.log("median ack ms:", med("ack"), "| median done ms:", med("done"));
} finally { await b.close(); }
