import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 初期店舗はシードデータとしてのみ存在する(コード中にはハードコードしない)。
// 4店舗目以降は管理画面「店舗管理」から追加する。
const INITIAL_STORES = ["ノ音", "茶ノ音", "和ノ音"];

const INITIAL_TELECOM_ITEMS = [
  "USEN",
  "スマレジ",
  "Wi-Fi",
  "FOOD系サービス",
  "Take系サービス",
  "TableCheck",
  "その他",
];

async function main() {
  for (let i = 0; i < INITIAL_STORES.length; i++) {
    const name = INITIAL_STORES[i];
    const store = await prisma.store.upsert({
      where: { id: `seed-store-${i + 1}` },
      update: {},
      create: {
        id: `seed-store-${i + 1}`,
        name,
        sortOrder: i,
        isActive: true,
        includeInGroup: true,
      },
    });

    for (let j = 0; j < INITIAL_TELECOM_ITEMS.length; j++) {
      await prisma.telecomSecurityItem.upsert({
        where: { id: `seed-telecom-${store.id}-${j + 1}` },
        update: {},
        create: {
          id: `seed-telecom-${store.id}-${j + 1}`,
          storeId: store.id,
          name: INITIAL_TELECOM_ITEMS[j],
          sortOrder: j,
          isActive: true,
        },
      });
    }
  }

  const adminEmail = "admin@note-ai.local";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      pinHash: null,
      name: "管理者",
      role: "ADMIN",
    },
  });

  console.log("シード完了:");
  console.log(`  店舗: ${INITIAL_STORES.join(", ")}`);
  console.log(`  管理者アカウント: ${adminEmail}(PIN未設定。別途スクリプトでPINを設定してください)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
