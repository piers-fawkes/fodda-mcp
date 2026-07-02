# Mini Brief: Join Experts Gate — FAQ Entry on Self-Use

## Objective
Add one Q&A to the FAQ on the Join Experts gate page: prospective experts should see, before they commit to onboarding, that their own agent is free for them to use. It's a recruiting argument, not just support copy.

## The Q&A

**Q: Is there a charge to use my Human Agent myself?**

**A:** No — your agent is free for you. Once you're approved, add it to Claude, ChatGPT, or any AI tool via a connector and it becomes your own researcher: grounded in your knowledge, answering in your voice. A fair-use limit applies (25 consults a day), and standard rates apply only when your agent researches beyond your own knowledge — other experts' graphs, earnings data, market intelligence. You'll never pay to talk to yourself.

## Placement
- The gate page of the Join Experts flow (the pre-wizard page in `pages/JoinExperts.tsx` / `pages/ExpertsLanding.tsx` in the Fodda Website repo). As of 2026-07-02 neither file has an explicit FAQ block in committed code — if the current working tree has one, add this entry to it; if not, this Q&A can seed a small FAQ section on the gate (other candidates: "How long does onboarding take?", "How do I get paid?").
- Keep the answer to one short paragraph; it should read as a benefit, not terms-of-service.

## Consistency check
The claim must match live behavior (it does, as of 2026-07-02): self-use waiver + 25/day cap are deployed on the API. If the cap changes via `SELF_USE_DAILY_CAP`, this copy is the one place on the marketing site that hardcodes the number — keep them in sync or drop the number ("a generous daily fair-use limit").
