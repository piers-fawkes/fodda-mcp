# Brief: PSFK Beauty Graph — GLP-1 Coverage Gap

**Graph:** PSFK Beauty Trends (`graph_id: beauty`)
**Priority:** Medium
**Identified by:** QA observation — query "GLP-1 impact on beauty industry skincare" returned zero beauty-graph results

---

## Context

A live query for "GLP-1 impact on beauty industry skincare" against the Fodda domain search returned no results from the beauty graph — sports and retail trends dominated instead. This confirms the beauty graph has no GLP-1-related trend cluster. This is a genuine coverage gap, not a scoring bug. The topic is actively requested by agency strategists and marketing buyers, making it a high-value ingestion target.

GLP-1 drugs (Ozempic, Wegovy, Mounjaro) are reshaping the beauty industry in documented ways: skin texture changes at scale, brands reformulating for a new physiological baseline, and a new consumer sub-segment with distinct skincare needs. The editorial story has moved beyond "celebrity weight loss" into active brand strategy — ingredient development, clinical positioning, and product line launches.

---

## Ingestion Target: GLP-1 × Beauty

### Trend Cluster 1: Skin Effects of GLP-1 Drugs

The GLP-1 drug cohort is experiencing documented skin changes — "Ozempic face" (volume loss, skin laxity), accelerated collagen loss, and changes in sebum production. These are creating a new product formulation opportunity.

**Evidence to source:**
- Dermatologist commentary on GLP-1-induced skin changes (peer-reviewed or clinical-practitioner quotes)
- Brand case studies: SkinMedica's GLP-1-adjacent formulation positioning, Allergan/AbbVie in the context of filler demand increases
- Market data: filler treatment volumes correlated with GLP-1 adoption curves
- Retail evidence: "collagen support," "skin elasticity," and "peptide complex" search and sales velocity increases

**Suggested trend name:** *"GLP-1 Drug-Linked Skin Changes Create New Skincare Formulation Category"*

---

### Trend Cluster 2: Beauty Brand Response — Reformulation & Positioning

Major and indie beauty brands are repositioning product lines to address the GLP-1 consumer. This is both a formulation play (ingredients) and a brand positioning play (language, imagery).

**Evidence to source:**
- Named brand responses: any brand explicitly referencing GLP-1 users or "post-weight-loss skin" in product development or marketing
- Ingredient category shifts: retinol alternatives for skin-barrier-compromised users, peptide-heavy formulations, hyaluronic acid volume claims
- Retailer moves: Ulta, Sephora, or Dermstore creating GLP-1 skincare edits or landing pages
- Analysts or trend forecasters (Mintel, Euromonitor, WGSN) on GLP-1 as a beauty market driver

**Suggested trend name:** *"Beauty Brands Reformulate for the GLP-1 Consumer Cohort"*

---

### Trend Cluster 3: Pharmaceutical-Beauty Convergence ("Pharma Beauty")

GLP-1 is one signal within a broader convergence between pharmaceutical efficacy and beauty product development — clinical-grade active ingredients, dermatologist co-branding, and the blurring of drug and cosmetic categories.

**Evidence to source:**
- Skincare brands partnering with pharmacies or clinical networks (e.g. Hims & Hers moving into skincare, direct-to-consumer dermatology plays)
- "Clinically proven" language as brand differentiator in mass-market beauty
- Any brand positioning GLP-1 user skin concerns as a market segment in investor materials or press

**Suggested trend name:** *"Pharmaceutical-Grade Ingredients Enter Mass Beauty as GLP-1 Adoption Scales"*

---

## Source Targets

Priority sources for this ingestion run:

- **Trade press:** WWD Beauty, Glossy, Beauty Independent, Cosmetics Business
- **Clinical:** JAMA Dermatology, Dermatology Times (for practitioner commentary)
- **Brand press releases & investor materials:** SkinMedica, Neutrogena, L'Oréal R&D, Estée Lauder Companies
- **Retail signals:** Ulta Beauty, Sephora editorial picks, Amazon Beauty category shifts
- **Market data:** Mintel "Skin Care — US 2025", Euromonitor on the GLP-1 beauty opportunity
- **Consumer signals:** Reddit r/Ozempic, r/SkincareAddiction for first-person skin change reports (qualitative evidence / social signals)

---

## Acceptance Criteria

- [ ] At least 2 trend nodes exist in the beauty graph covering GLP-1 × skincare.
- [ ] Each trend has a minimum of 5 evidence items with source attribution (brand name, publication, or institution).
- [ ] At least one trend includes a quantitative evidence item (market sizing, search volume, sales data, or clinical study reference).
- [ ] A query for "GLP-1 impact on beauty industry skincare" against `POST /v1/search/domain` returns at least 1 result from `graph_id: beauty` with `relevance_score > 0.80`.
- [ ] Evidence categories are correctly assigned per the 5-category standard (Case Study / Statistic / Data Point / Analysis / Interview).
