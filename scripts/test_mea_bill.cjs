// Run: node scripts/test_mea_bill.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const context = vm.createContext({ HTMLElement: class {}, customElements: { define() {} }, window: {}, Intl });
vm.runInContext(fs.readFileSync(path.join(root, "www/mea-electric-bill-card.js"), "utf8"), context);
// The project's tariff attribute is a literal Jinja list. Read the real table;
// evaluate only this trusted local configuration, with Jinja none mapped to null.
const yaml = fs.readFileSync(path.join(root, "configuration.yaml"), "utf8");
const literal = yaml.match(/billing_periods: >\s*\{\{([\s\S]*?)\}\}/);
assert.ok(literal, "Missing central billing periods");
context.periods = vm.runInNewContext(`(${literal[1].replace(/\bnone\b/g, "null")})`);
vm.runInContext(`
  const tariff_id = "sensor.mea_residential_tariff";
  const meter_id = "sensor.energy_meter_bill_cycle";
  const hass = { states: {
    [tariff_id]: { state: "verified_manual", attributes: { tariff_class: "1.2", billing_periods: periods } },
    [meter_id]: { state: "332.85", attributes: { next_reset: "2026-09-17T00:00:00+07:00" } },
  } };
  const card = new MeaElectricBillCard();
  card._render = () => {};
  card.setConfig({ tariff_entity: tariff_id, cutoff_day: 17, entities: { total: "sensor.total", bill_cycle: meter_id } });
  card._hass = hass;
  globalThis.card = card;
  globalThis.hass = hass;
  globalThis.tariff_id = tariff_id;
  globalThis.meter_id = meter_id;
`, context);
const run = (code) => vm.runInContext(code, context);
const money = () => Number(run("card._calcBill().total").toFixed(2));
assert.equal(money(), 1317.26);
for (const [units, expected] of [[0, 26.34], [200, 703.08], [400, 1627.71], [500, 2111.41]]) {
  context.hass.states[context.meter_id].state = String(units);
  assert.equal(money(), expected, `${units} kWh`);
}
run('card._period = "prev_cycle"; card._cycleEnd = new Date("2026-08-16T17:00:00Z"); card._usage = { units: 500 };');
assert.equal(money(), 2237.00, "August bill must retain old 150 kWh boundary");
run('card._cycleEnd = new Date("2026-09-16T17:00:00Z");');
assert.equal(money(), 2111.41, "September bill uses new rates for the whole cycle");
run('card._period = "cycle";');
for (const value of ["unknown", "unavailable", "", "NaN", "Infinity", "-1"]) {
  context.hass.states[context.meter_id].state = value;
  assert.equal(run("card._calcBill().total"), null, value);
}
context.hass.states[context.meter_id].state = "0";
run('hass.states[meter_id].attributes.next_reset = "2027-01-17T00:00:00+07:00";');
assert.equal(run("card._calcBill().total"), null, "Expired Ft must not become a plausible bill");
run('hass.states[meter_id].attributes.next_reset = "2026-09-17T00:00:00+07:00"; hass.states[tariff_id].state = "unavailable";');
assert.equal(run("card._calcBill().total"), null);
run('hass.states[tariff_id].state = "verified_manual"; periods[1].tiers[1].up_to = 100;');
assert.equal(run("card._calcBill().total"), null, "Reject descending tiers");
console.log("MEA bill checks passed: real tariff table, tier boundaries, billing dates, invalid/expired data.");
