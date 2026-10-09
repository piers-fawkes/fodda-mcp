# Brief: UK City Geographic Fallbacks & ONS Beta API Dimension Repairs

**Target Repo:** Fodda API (`~/Documents/Fodda API/Fodda/`)  
**Assignee:** API Agent  
**Context:** QA investigation on queries like *"Use Fodda to pull stats that provide an insight into the quality of life in London today."* revealed that while national and municipal feeds exist, they failed to return data because:
1. `police_uk`, `ons_neighbourhood`, and `epc_uk` were skipped or returned empty when the query mentioned a city ("London") instead of an explicit UK postcode regex (`SW1A 1AA`).
2. `ons_uk` (Office for National Statistics) returned `latest_value: null` across all 15 series (including personal wellbeing: life satisfaction, happiness, anxiety, worthwhile) due to dimension name typos, missing required dimensions, and outdated option IDs in `onsClient.ts`.

---

## 1. UK City Geographic Fallback & Router Un-Gating

### Problem
In `functions/v1/supplemental/unifiedContextHandler.ts` (around line 956):
```ts
else if (p === "postcode" && (!ukPostcodeMatch && !nlPostcodeMatch)) missingParam = "postcode";
```
When a query contains `"London"` or `geo: "London"` without an explicit UK postcode (e.g. `SW1A 1AA`), the router marks `police_uk`, `ons_neighbourhood`, and `epc_uk` as `skipped:missing_param:postcode`.

### Required Fixes

1. **Add UK City Coordinate & Postcode Resolver in `unifiedContextHandler.ts`**:
   Add a lookup map for major UK cities:
   ```ts
   const UK_CITY_FALLBACKS: Record<string, { postcode: string; lat: number; lng: number; local_authority: string }> = {
       london: { postcode: "SW1A 1AA", lat: 51.5074, lng: -0.1278, local_authority: "E12000007" },
       manchester: { postcode: "M1 1AD", lat: 53.4808, lng: -2.2426, local_authority: "E08000003" },
       birmingham: { postcode: "B1 1BB", lat: 52.4862, lng: -1.8904, local_authority: "E08000025" },
       leeds: { postcode: "LS1 1UR", lat: 53.8008, lng: -1.5491, local_authority: "E08000035" },
       glasgow: { postcode: "G1 1XQ", lat: 55.8642, lng: -4.2518, local_authority: "S12000049" },
       edinburgh: { postcode: "EH1 1YZ", lat: 55.9533, lng: -3.1883, local_authority: "S12000036" },
   };
   ```

2. **Un-gate `missing_param:postcode` when a UK city is present**:
   If `!ukPostcodeMatch`, check if `query.toLowerCase()` contains one of the `UK_CITY_FALLBACKS` keys or if `body.geo` maps to a UK city. If matched, assign the fallback postcode/coordinates and **do not** trip `missingParam = "postcode"`.

3. **Wire Fallbacks into Source Fetchers**:
   - `police_uk`:
     Pass the resolved `postcode` (or `lat`/`lng`) into `fetchPoliceUKSnapshot({ postcode, lat, lng, months: 1 })`.
   - `ons_neighbourhood`:
     Pass the resolved `postcode` or `local_authority` into `fetchONSNeighbourhoodSnapshot({ postcode, local_authority })`.
   - `epc_uk`:
     Pass the resolved `postcode` into `fetchEPCSnapshot({ postcode, limit: 25 })`.
   - `ea_floods`:
     Use the resolved `postcode` or coordinates.

---

## 2. ONS Beta API Dimension Repairs (`onsClient.ts`)

### Problem
Calls to `https://api.beta.ons.gov.uk/v1` in `functions/v1/supplemental/onsClient.ts` fail with HTTP 400 or return `observations: null` because dimension names and options are malformed:

### Required Fixes in `functions/v1/supplemental/onsClient.ts`

1. **Personal Wellbeing Dataset (`wellbeing-local-authority`)**:
   - **Dimension Name**: Change `"measures-of-wellbeing"` to **`"measureofwellbeing"`** (removes HTTP 400).
   - **Required Dimension**: Add **`"estimate": "average-mean"`** to all wellbeing query definitions.
   - **Option IDs**:
     - `uk_wellbeing_life_satisfaction`: `"measureofwellbeing": "life-satisfaction"` (was `life-satisfaction-mean`)
     - `uk_wellbeing_happiness`: `"measureofwellbeing": "happiness"` (was `happiness-mean`)
     - `uk_wellbeing_anxiety`: `"measureofwellbeing": "anxiety"` (was `anxiety-mean`)
     - `uk_wellbeing_worthwhile`: `"measureofwellbeing": "worthwhile"` (was `worthwhile-mean`)
   - **Regional Geo Routing**:
     If `geo` is London (`lower.includes("london")`), use `geography: "E12000007"`; otherwise default to national `geography: "K02000001"`.
     *(Verified via live curl: `https://api.beta.ons.gov.uk/v1/datasets/wellbeing-local-authority/editions/time-series/versions/4/observations?time=*&geography=E12000007&measureofwellbeing=life-satisfaction&estimate=average-mean` returns 12 annual observations for London, latest score 7.35).*

2. **CPIH Inflation Dataset (`cpih01`)**:
   Update aggregate option codes to the published ONS standard:
   - Headline inflation (`uk_cpih_all_items`): `"aggregate": "CP00"` (was `cpih1dim1A0`)
   - Food (`uk_cpih_food`): `"aggregate": "CP01"` (was `cpih1dim1G100000`)
   - Housing & Utilities (`uk_cpih_housing`): `"aggregate": "CP04"` (was `cpih1dim1G400000`)
   - Transport (`uk_cpih_transport`): `"aggregate": "CP07"` (was `cpih1dim1G700000`)
   - Restaurants & Hotels (`uk_cpih_restaurants_hotels`): `"aggregate": "CP11"` (was `cpih1dim1G1100000`)

3. **Retail Sales Index (`retail-sales-index`)**:
   Update `geography` from `"K02000001"` (UK) to **`"K03000001"`** (Great Britain). In edition `time-series` version 45, Great Britain is the only published geography code; UK returns 0 observations.

---

## 3. Verification Criteria

1. Run verification script / POST to `/v1/supplemental/context` with:
   ```json
   {
     "query": "quality of life in London",
     "geo": "London"
   }
   ```
2. Confirm:
   - `police_uk` is **not** skipped; returns street crime counts and category distribution for London.
   - `ons_uk` series returns non-null numeric `latest_value` and populated `observations` for:
     - `uk_wellbeing_life_satisfaction` (London ~7.35)
     - `uk_wellbeing_happiness` (London ~7.32)
     - `uk_wellbeing_anxiety` (London ~3.34)
     - `uk_wellbeing_worthwhile` (London ~7.60)
     - `uk_cpih_all_items`
   - Environmental feeds (`defra_uk_air`, `ea_floods`, `national_grid_carbon`) succeed and populate `demographic_context` / `economic_context`.
