# Brief — Support 7 New Classic Agents (Khaldun, Kautilya, Walker, Follett, Gilbreth, Simmel, Schumpeter)

**Target Repo:** `Fodda MCP`  
**Target Agent:** MCP Agent (`Fodda MCP`)  
**Date:** 2026-11-08  
**Priority:** Normal (Roster Expansion & Routing Quality)  
**From:** API Agent (`Fodda API`)  

---

## 1. Context

Seven new **Classic Agents** have been added to Fodda across global intellectual history, organizational design, DTC distribution, and attention economics. Their ingestion bundles are staged in `coordination_notes/experts/` and their records are being registered into the `Analysts` table (`tblvrKdn8FvbSJmSs`).

The MCP server already discovers them dynamically via `/v1/analysts` and `catalogCache.ts` (`graphSubType: "Classic Digital Twin"` $\rightarrow$ `category: 'classic_agent'`), routing them through `consult_analyst` / `ask_experts` with "Book a Call" suppressed.

This brief requests the MCP Agent to complete the standard surface alignments and verification tests:
1. Update platform scale counters.
2. Add the seven slugs to the system prompt citation guard list.
3. Verify `find_expert` keyword affinity for each persona.
4. Add an automated test suite verifying normalization, next moves, and attribution.

---

## 2. The 7 New Classic Agents

1. **Ibn Khaldun (`ibn-khaldun`)**
   * **Role:** Historian, Sociologist & Economic Pioneer (1332–1406)
   * **Expertise:** Organizational Cohesion (*Asabiyyah*), Enterprise Lifecycle Decay, Platform Take-Rates & The Khaldunian Revenue Curve, Cooperative Labor Surplus, Luxury Overhead Trap.
   * **Ask Line:** *"Ask Ibn Khaldun to audit whether your organization's internal Asabiyyah (team cohesion and culture) is scaling or decaying into bureaucratic complacency."*
   * **Discovery Keywords:** `asabiyyah`, `team cohesion`, `organizational culture`, `enterprise decay`, `platform take-rate`, `bureaucratic complacency`, `cooperative labor`.

2. **Kautilya / Chanakya (`kautilya`)**
   * **Role:** Statesman, Political Economist & Strategic Realist (c. 350–275 BCE)
   * **Expertise:** Material Realism (*Artha*), Supply Chain Buffer Reserves, Marketplace Fraud Detection & Quality Auditing, Institutional Anatomy (*Saptanga*), Competitive Realpolitik (*Mandala*).
   * **Ask Line:** *"Ask Kautilya to audit your supply chain resilience, marketplace fraud controls, and competitive alliance defenses through the unsparing lens of the Arthashastra."*
   * **Discovery Keywords:** `supply chain resilience`, `buffer stocks`, `marketplace fraud`, `fraud detection`, `procurement governance`, `institutional anatomy`, `competitive realpolitik`.

3. **Madam C.J. Walker (`madam-cj-walker`)**
   * **Role:** Entrepreneur, DTC Pioneer & Network Distribution Innovator (1867–1919)
   * **Expertise:** Decentralized Sales Agent Networks, Direct-to-Consumer (DTC) Beauty, Identity-Anchored Brand Trust, Vocational Certification, Community Wealth Generation.
   * **Ask Line:** *"Ask Madam C.J. Walker to audit your direct-to-consumer distribution strategy, creator/agent network economics, and community-driven brand equity."*
   * **Discovery Keywords:** `dtc distribution`, `creator networks`, `agent networks`, `direct selling`, `community brand equity`, `vocational certification`, `beauty culture`.

4. **Mary Parker Follett (`mary-parker-follett`)**
   * **Role:** Organizational Pioneer & Philosopher of Management (1868–1933)
   * **Expertise:** Organizational Design, Lateral Authority, Constructive Conflict (Integration over Compromise), "Power-With vs. Power-Over", The Law of the Situation, Cross-Functional Coordination.
   * **Ask Line:** *"Ask Mary Parker Follett to audit your cross-functional coordination, executive conflict resolution, and leadership structures using the Law of the Situation."*
   * **Discovery Keywords:** `constructive conflict`, `cross-functional coordination`, `lateral authority`, `power-with`, `law of the situation`, `integration over compromise`, `agile squad coordination`.

5. **Lillian Moller Gilbreth (`lillian-gilbreth`)**
   * **Role:** Industrial Engineer, Ergonomist & Human Factors Pioneer (1878–1972)
   * **Expertise:** Industrial Ergonomics, Human Factors Engineering, Motion Economy (Therbligs), Spatial Routing (The Kitchen Work Triangle), Fatigue Elimination, Flow Process Charting.
   * **Ask Line:** *"Ask Lillian Gilbreth to audit your UX interaction journeys, physical workspace ergonomics, and operational flowcharts to eliminate fatigue and wasted motion."*
   * **Discovery Keywords:** `ergonomics`, `human factors`, `motion study`, `therbligs`, `work triangle`, `fatigue elimination`, `flow process charting`, `ux journey efficiency`.

6. **Georg Simmel (`georg-simmel`)**
   * **Role:** Sociologist & Philosopher of Money and Metropolitan Life (1858–1918)
   * **Expertise:** Philosophy of Money, Abstract Pricing Quantification, Attention Economics & Metropolitan Sensory Overload (The Blasé Attitude), The Fashion Dialectic, The Stranger, Triadic Platform Mediation (*Tertius Gaudens*).
   * **Ask Line:** *"Ask Georg Simmel to audit your pricing abstractions, attention retention strategies, and trend cascades through the lens of The Philosophy of Money."*
   * **Discovery Keywords:** `philosophy of money`, `abstract pricing`, `attention economics`, `blase attitude`, `sensory overload`, `fashion dialectic`, `triadic networks`, `tertius gaudens`.

---


7. **Joseph Schumpeter (`joseph-schumpeter`)**
   * **Role:** Economist, Theorist of Innovation & Creative Destruction (1883–1950)
   * **Expertise:** Creative Destruction, Adaptive vs. Creative Response, Discontinuous Innovation Swarms, Production Function Sui Generis, Routinization of Innovation.
   * **Ask Line:** *"Ask Joseph Schumpeter to audit whether your AI strategy is a mere adaptive response within existing practice, or a genuine creative response that forces an industry-wide innovation swarm."*
   * **Discovery Keywords:** `creative destruction`, `innovation swarm`, `adaptive response`, `creative response`, `production function`, `routinization of innovation`, `monopoly rents`.

## 3. Files Expected to Change in `fodda-mcp`

1. **`src/toolHandlers.ts`:**
   * In `platform_scale.specialists.breakdown.classic_agents` (around line 1150), update count from `16` to `23`.
2. **`src/systemPrompt.ts`:**
   * In the expert consultation instructions (around line 412), add the six slugs to the example list of protected Classic Agent routing slugs that host models must never expose in citations or narrative text.
3. **`src/test_six_new_classic_agents.ts` (New Test File):**
   * Add a verification script patterned after `test_frederick_and_tarde_classic_agents.ts` verifying:
     - `normalizeAnalyst()` classifies each as `category: 'classic_agent'`, `is_classic_agent: true`.
     - `generateConsultNextMoves()` offers topic depth and brand scoping while suppressing "Book a Call".
     - Attribution guidelines correctly flag them as Classic Agents and not Human Agents.
4. **`CHANGELOG.md`:** Document the support and verification for the 7 new Classic Agents.
