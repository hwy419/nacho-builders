import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding credit packages...")

  // Clear existing packages
  await prisma.creditPackage.deleteMany({})

  // Insert new credit packages with generous pricing (~50k credits/ADA)
  const packages = await prisma.creditPackage.createMany({
    data: [
      {
        name: "Starter",
        credits: 100000,
        adaPrice: 2.0,
        bonusPercent: 0,
        active: true,
        displayOrder: 1,
        popular: false,
      },
      {
        name: "Standard",
        credits: 500000,
        adaPrice: 9.0,
        bonusPercent: 10,
        active: true,
        displayOrder: 2,
        popular: true,
      },
      {
        name: "Pro",
        credits: 1500000,
        adaPrice: 25.0,
        bonusPercent: 15,
        active: true,
        displayOrder: 3,
        popular: false,
      },
      {
        name: "Enterprise",
        credits: 5000000,
        adaPrice: 75.0,
        bonusPercent: 25,
        active: true,
        displayOrder: 4,
        popular: false,
      },
    ],
  })

  console.log(`Created ${packages.count} credit packages`)

  // Display the packages
  const allPackages = await prisma.creditPackage.findMany({
    orderBy: { displayOrder: "asc" },
  })

  console.log("\nCredit Packages:")
  console.log("================")
  for (const pkg of allPackages) {
    const effectiveCredits = pkg.credits + (pkg.credits * pkg.bonusPercent) / 100
    const creditsPerAda = Math.round(effectiveCredits / Number(pkg.adaPrice))
    console.log(
      `${pkg.name}: ${pkg.credits.toLocaleString()} credits for ${pkg.adaPrice} ADA ` +
        `(${pkg.bonusPercent}% bonus, ~${creditsPerAda.toLocaleString()}/ADA)${pkg.popular ? " [POPULAR]" : ""}`
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
