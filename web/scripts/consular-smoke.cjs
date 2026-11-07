const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.BASE_URL || "http://127.0.0.1:4175");
  await page
    .getByLabel("Consular districts", { exact: true })
    .selectOption("mexico");
  await page.getByText("Find a consulate", { exact: true }).click();
  await page.getByLabel("Find a consulate").waitFor();
  await page.waitForFunction(() => window.__iceMap?.loaded());
  await page.waitForFunction(() => window.__iceDistricts === 53);
  assert.equal(await page.locator("#consular-district option").count(), 54);
  await page.getByLabel("Find a consulate").selectOption("albuquerque");
  await page
    .getByRole("link", { name: "Jurisdiction source (opens new tab)" })
    .waitFor();
  await page.screenshot({ path: "/tmp/ice-pr5-desktop.png", fullPage: true });
  const hover = await page.evaluate(() => {
    const m = window.__iceMap;
    const p = m.project([-105, 35]);
    return {
      x: p.x,
      y: p.y,
      top: m.getContainer().getBoundingClientRect().top,
    };
  });
  await page.mouse.move(hover.x, hover.y + hover.top);
  await page.screenshot({ path: "/tmp/ice-pr5-hover.png", fullPage: true });
  await page.getByLabel("Consular districts", { exact: true }).selectOption("");
  await page.waitForFunction(() => window.__iceDistricts === 0);
  assert.equal(await page.locator("#consular-district").count(), 0);
  await page.route("**/consular/mexico.geojson", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page
    .getByLabel("Consular districts", { exact: true })
    .selectOption("mexico");
  await page.getByRole("button", { name: "Retry districts" }).waitFor();
  await page.screenshot({ path: "/tmp/ice-pr5-error.png", fullPage: true });
  await page.unroute("**/consular/mexico.geojson");
  await page.getByRole("button", { name: "Retry districts" }).click();
  await page.getByText("Find a consulate", { exact: true }).click();
  await page.getByLabel("Find a consulate").waitFor();
  await page.reload();
  await page.getByText("Find a consulate", { exact: true }).click();
  await page.getByLabel("Find a consulate").waitFor();
  assert.equal(await page.locator("#consular-country").inputValue(), "mexico");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => window.__iceMap?.loaded());
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__iceMap.once("idle", resolve);
        window.__iceMap.triggerRepaint();
      }),
  );
  await page.getByLabel("Find a consulate").selectOption("tucson");
  await page.screenshot({ path: "/tmp/ice-pr5-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByText("Map key", { exact: true }).click();
  await page.getByText("Find a consulate", { exact: true }).click();
  await page.screenshot({
    path: "/tmp/ice-pr5-mobile-compact.png",
    fullPage: true,
  });
  await page.screenshot({
    path: "/tmp/ice-pr5-mobile-key.png",
    fullPage: true,
  });
  await page.getByText("Map key", { exact: true }).click();
  await page.evaluate(() =>
    localStorage.setItem("ice-map.consular-country", "missing-country"),
  );
  await page.reload();
  await page.getByLabel("Consular districts", { exact: true }).waitFor();
  assert.equal(await page.locator("#consular-country").inputValue(), "");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("ice-map.consular-country")),
    null,
  );
  console.log(
    JSON.stringify({
      passed: [
        "WebGL rendered 53 districts",
        "all 53 consulates accessible",
        "source link",
        "Off removes overlay",
        "failure and retry",
        "selection persistence",
        "390px layout",
        "map key disclosure",
        "invalid stored selection",
      ],
      errors,
    }),
  );
  assert.deepEqual(errors, []);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
