# MEA bill calculation

Updated 2026-09-09. Keep the existing bill card; use a native template sensor as
the shared rate source. No custom integration or dependency was installed.

## Comparison with terngz/mea_thailand_grid_tariff

The upstream integration supplies tariff/Ft entities, not consumption metering or
a complete bill card. Its separation of rates from billing is useful here.
Reviewed `main` on 2026-09-09:

- `const.py` sets polling to 90 days despite the coordinator's 12-hour docstring.
- `coordinator.py` can report `healthy=True` after using mock tariff/Ft values.
  The type 1.2 mock mixes a 200-unit boundary with the old 3.2484 rate.
- Saved cache contains Ft and a block count, not reusable rate tables; no cache
  load exists. A restart during an outage therefore loses the last fetched table.
- `parser.py` selects an Ft column using the current month without matching its
  year; its fallback scans backwards across the whole row, including future
  months. Its text fallback mishandles values below one satang.

Sources: [upstream](https://github.com/terngz/mea_thailand_grid_tariff),
[MEA residential table](https://www.mea.or.th/our-services/service-rates/other/D5xEaEwgU),
[ERC Ft table](https://erc.or.th/th/automatic/).

## Live configuration

`sensor.mea_residential_tariff` owns `billing_periods` in `configuration.yaml`.
Values are manually verified snapshots, not automatically fetched rates:

| Bill issued | Tier boundaries / THB per kWh | Service | Ft THB/kWh | VAT |
|---|---|---|---|---|
| May–Aug 2026 | 150 / 3.2484; 400 / 4.2218; rest / 4.4217 | 24.62 | 0.1623 | 7% |
| Sep–Dec 2026 | 200 / 3.0000; 400 / 4.1584; rest / 4.3583 | 24.62 | 0.1623 | 7% |

`sensor.khaaaif_bill_cycle` and the home dashboard card both use this table.
The card has `tariff_entity: sensor.mea_residential_tariff` and
`entities.bill_cycle: sensor.energy_meter_bill_cycle`. Current-cycle consumption
comes directly from that utility meter; historical/day/week/month views still
query recorder statistics. Existing inline card rate/Ft/VAT fields are ignored
while `tariff_entity` is configured.

The current bill's date comes from the utility meter's `next_reset` (17th,
Asia/Bangkok). The previous bill's date is its cycle end. Consequently the
17 Aug–17 Sep cycle uses September rates throughout, consistent with the change
applying from the September billing round. Confirm actual reading date and totals
against the September MEA bill. Earlier history remains partial because statistics
start on 3 Aug; changing tariff calculation cannot reconstruct missing usage.

An unknown consumption reading or an unverified billing period produces no total,
not a zero reading or stale tariff. Before the cycle ending 17 Jan 2027, append a
verified next-period entry and reload templates. Never overwrite old snapshots.
No historical recorder totals were rewritten. Bills remain estimates: meter
coverage/calibration and actual reading dates can differ from MEA.

Checks: `node scripts/test_mea_bill.cjs`, HA configuration validation, template
reload, and live sensor verification. Pre-change copies dated `20260909-161404`
exist alongside the YAML, card JS and `.storage/lovelace.dashboard_home`.
