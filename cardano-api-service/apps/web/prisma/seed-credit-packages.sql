-- Credit Packages Seed Script
-- Competitive USD pricing (Jan 2026)
-- Beats Blockfrost at all tiers, beats Koios at Enterprise
--
-- Pricing designed for ~$0.35-0.40 ADA:
--   Starter:    3 ADA (~$1.14)  → 400k credits   → $2.85/1M (beats Blockfrost $2.90)
--   Standard:  12 ADA (~$4.56)  → 2M credits     → $2.28/1M (beats Blockfrost)
--   Pro:       40 ADA (~$15.20) → 8M credits     → $1.90/1M (competitive)
--   Enterprise:125 ADA (~$47.50)→ 40M credits    → $1.19/1M (beats Koios $1.39)
--
-- Volume discount progression: 133k → 167k → 200k → 320k credits/ADA

-- First, clear existing packages
DELETE FROM "CreditPackage";

-- Insert new credit packages (no bonus % - discounts built into base rates)
INSERT INTO "CreditPackage" (id, name, credits, "adaPrice", "bonusPercent", active, "displayOrder", popular, "createdAt", "updatedAt")
VALUES
  -- Starter: 400,000 credits for 3 ADA (133k/ADA) → ~$2.85/1M
  (gen_random_uuid(), 'Starter', 400000, 3.00, 0, true, 1, false, NOW(), NOW()),

  -- Standard: 2,000,000 credits for 12 ADA (167k/ADA) → ~$2.28/1M
  (gen_random_uuid(), 'Standard', 2000000, 12.00, 0, true, 2, true, NOW(), NOW()),

  -- Pro: 8,000,000 credits for 40 ADA (200k/ADA) → ~$1.90/1M
  (gen_random_uuid(), 'Pro', 8000000, 40.00, 0, true, 3, false, NOW(), NOW()),

  -- Enterprise: 40,000,000 credits for 125 ADA (320k/ADA) → ~$1.19/1M
  (gen_random_uuid(), 'Enterprise', 40000000, 125.00, 0, true, 4, false, NOW(), NOW());

-- Verify the packages
SELECT
  name,
  credits,
  "adaPrice",
  ROUND(credits / "adaPrice") as "credits_per_ada",
  popular
FROM "CreditPackage"
ORDER BY "displayOrder";
