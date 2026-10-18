/**
 * Seed: global pricing config, one demo restaurant with a realistic menu, tables, and demo
 * users in Supabase Auth (owner, manager, waiter, kitchen, platform admin). Idempotent.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createPrismaClient, type Diet } from '../src/index.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

const db = createPrismaClient(process.env.DATABASE_URL!);
const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=640&q=70&auto=format&fit=crop`;

interface SeedItem {
  name: string;
  description: string;
  price: number; // rupees
  diet?: Diet;
  spice?: number;
  tags?: string[];
  photo?: string;
  jain?: boolean;
  tax?: number; // bp
  variants?: Array<[string, number]>;
  addons?: { name: string; min?: number; max?: number; options: Array<[string, number]> };
  available?: boolean;
}

const MENU: Array<{ name: string; items: SeedItem[] }> = [
  {
    name: 'Starters',
    items: [
      { name: 'Paneer Tikka', description: 'Chunks of cottage cheese marinated in hung curd and spices, char-grilled in the tandoor with peppers and onion.', price: 289, spice: 2, tags: ['bestseller'], photo: '1567188040759-fb8a883dc6d8', variants: [['Half (6 pcs)', 189], ['Full (12 pcs)', 289]] },
      { name: 'Tandoori Chicken', description: 'Bone-in chicken marinated overnight in yoghurt, Kashmiri chilli and garam masala, roasted in a clay oven.', price: 349, diet: 'nonveg', spice: 2, tags: ['bestseller', 'must_try'], photo: '1626074353765-517a681e40be', variants: [['Half', 229], ['Full', 349]] },
      { name: 'Chicken Seekh Kebab', description: 'Minced chicken with ginger, green chilli and fresh coriander, skewered and grilled. Served with mint chutney.', price: 299, diet: 'nonveg', spice: 2, photo: '1599487488170-d11ec9c172f0' },
      { name: 'Masala Omelette', description: 'Three-egg omelette with onion, tomato, green chilli and coriander, served with buttered pav.', price: 129, diet: 'egg', spice: 1, photo: '1645177628172-a94c1f96e6db' },
    ],
  },
  {
    name: 'Main Course',
    items: [
      { name: 'Paneer Butter Masala', description: 'Soft paneer simmered in a rich tomato and cashew gravy, finished with butter, cream and kasuri methi.', price: 279, spice: 1, tags: ['bestseller'], photo: '1631452180519-c014fe946bc7', jain: true, addons: { name: 'Make it extra', max: 2, options: [['Extra butter', 30], ['Extra paneer', 60]] } },
      { name: 'Kadai Paneer', description: 'Paneer tossed with bell peppers and onion in a freshly ground kadai masala.', price: 269, spice: 2, photo: '1606471191009-63994c53433b', jain: true },
      { name: 'Butter Chicken', description: 'Tandoori chicken in a velvety, mildly spiced tomato-butter gravy. Best with garlic naan.', price: 349, diet: 'nonveg', spice: 1, tags: ['bestseller', 'must_try'], photo: '1565557623262-b51c2513a641' },
      { name: 'Chicken Kolhapuri', description: 'Fiery Kolhapur-style chicken curry with roasted coconut, sesame and a special red chilli masala.', price: 329, diet: 'nonveg', spice: 3, tags: ['chef_special'], photo: '1596797038530-2c107229654b' },
      { name: 'Prawns Malvani', description: 'Coastal Maharashtrian prawn curry with kokum and coconut, slow-cooked with Malvani masala.', price: 419, diet: 'nonveg', spice: 2, tags: ['chef_special'], photo: '1559847844-5315695dadae' },
      { name: 'Dal Tadka', description: 'Yellow lentils tempered with ghee, cumin, garlic and dried red chilli.', price: 199, spice: 1, photo: '1585937421612-70a008356fbe', jain: true },
    ],
  },
  {
    name: 'Biryani & Rice',
    items: [
      { name: 'Chicken Dum Biryani', description: 'Aged basmati and tender chicken layered with saffron, fried onion and mint, sealed and slow-cooked on dum. Served with raita.', price: 329, diet: 'nonveg', spice: 2, tags: ['bestseller'], photo: '1589302168068-964664d93dc0', variants: [['Regular', 329], ['Family pack (serves 3)', 799]], addons: { name: 'Add a side', max: 2, options: [['Extra raita', 40], ['Boiled egg', 25], ['Salan', 45]] } },
      { name: 'Veg Dum Biryani', description: 'Basmati rice with seasonal vegetables, whole spices and saffron, cooked on dum.', price: 259, spice: 1, photo: '1563379091339-03b21ab4a4f8' },
      { name: 'Jeera Rice', description: 'Fragrant basmati tempered with cumin and ghee.', price: 149 },
    ],
  },
  {
    name: 'Breads',
    items: [
      { name: 'Butter Naan', description: 'Soft leavened bread from the tandoor, brushed with butter.', price: 59 },
      { name: 'Garlic Naan', description: 'Naan topped with chopped garlic and coriander.', price: 69, tags: ['bestseller'] },
      { name: 'Tandoori Roti', description: 'Whole-wheat flatbread baked in the tandoor.', price: 29, jain: true, addons: { name: 'Butter', max: 1, options: [['Add butter', 10]] } },
    ],
  },
  {
    name: 'South Indian',
    items: [
      { name: 'Masala Dosa', description: 'Crisp rice and lentil crêpe filled with spiced potato, served with sambar and coconut chutney.', price: 149, tags: ['bestseller'], photo: '1668236543090-82eba5ee5976', addons: { name: 'Upgrade', max: 2, options: [['Cheese', 40], ['Extra sambar', 20]] } },
      { name: 'Idli Sambar', description: 'Three steamed rice cakes with sambar and two chutneys.', price: 99, photo: '1630383249896-424e482df921', jain: true },
      { name: 'South Indian Thali', description: 'Rice, sambar, rasam, two vegetables, curd, papad, pickle and payasam on a banana leaf.', price: 249, tags: ['chef_special'], photo: '1625398407796-82650a8c135f' },
    ],
  },
  {
    name: 'Chaat & Snacks',
    items: [
      { name: 'Pav Bhaji', description: 'Buttery mashed vegetable bhaji with two toasted pav, onion and lemon. A Mumbai classic.', price: 159, spice: 2, tags: ['bestseller'], photo: '1606491956689-2ea866880c84', addons: { name: 'Extras', max: 2, options: [['Extra pav', 30], ['Extra butter', 20]] } },
      { name: 'Samosa (2 pcs)', description: 'Crisp pastry stuffed with spiced potato and peas, with tamarind and mint chutneys.', price: 69, spice: 1, photo: '1601050690597-df0568f70950' },
      { name: 'Kanda Poha', description: 'Flattened rice with onion, peanuts, curry leaves and turmeric, topped with sev and lemon.', price: 79, spice: 1, photo: '1512058564366-18510be2db19' },
      { name: 'Dahi Puri', description: 'Crisp puris filled with potato, sweet curd, chutneys and sev.', price: 99, photo: '1610192244261-3f33de3f55e4', available: false },
    ],
  },
  {
    name: 'Desserts',
    items: [
      { name: 'Rose Kulfi', description: 'Slow-reduced milk frozen with rose and pistachio.', price: 99, photo: '1517093157656-b9eccef91cb1' },
      { name: 'Caramel Sundae', description: 'Vanilla ice cream, warm salted caramel and roasted nuts.', price: 149, tags: ['new'], photo: '1551024506-0bccd828d307' },
      { name: 'Strawberry Shrikhand', description: 'Hung-curd shrikhand layered with fresh strawberries.', price: 129, photo: '1488477181946-6428a0291777' },
    ],
  },
  {
    name: 'Beverages',
    items: [
      { name: 'Thick Shakes', description: 'Chocolate, strawberry or cold coffee, blended thick with ice cream.', price: 169, tax: 1800, photo: '1505252585461-04db1eb84625', variants: [['Chocolate', 169], ['Strawberry', 169], ['Cold coffee', 179]] },
      { name: 'Masala Chaas', description: 'Spiced buttermilk with roasted cumin and fresh coriander.', price: 59 },
      { name: 'Fresh Lime Soda', description: 'Sweet, salted or mixed.', price: 79, tax: 1800, variants: [['Sweet', 79], ['Salted', 79], ['Mixed', 79]] },
    ],
  },
];

const HOURS = { open: '11:00', close: '23:30' };
const openingHours = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [HOURS]]));

async function ensureAuthUser(email: string, name: string): Promise<string> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const create = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { name } }),
  });
  if (create.ok) return ((await create.json()) as { id: string }).id;
  // Already exists: find it.
  for (let page = 1; page < 20; page++) {
    const list = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    const body = (await list.json()) as { users: Array<{ id: string; email: string }> };
    const found = body.users.find((u) => u.email === email);
    if (found) return found.id;
    if (body.users.length < 200) break;
  }
  throw new Error(`Could not create or find auth user ${email}: ${await create.text()}`);
}

async function main() {
  const now = new Date();
  const global = await db.pricingConfig.findFirst({ where: { restaurantId: null } });
  if (!global) await db.pricingConfig.create({ data: { restaurantId: null } });

  const users = {
    owner: { email: 'owner@demo.tableos.in', name: 'Aarti Kulkarni' },
    manager: { email: 'manager@demo.tableos.in', name: 'Rohan Deshpande' },
    waiter: { email: 'waiter@demo.tableos.in', name: 'Sagar Patil' },
    kitchen: { email: 'kitchen@demo.tableos.in', name: 'Chef Imran' },
    admin: { email: 'admin@tableos.in', name: 'TableOS Admin' },
  };
  const ids: Record<string, string> = {};
  for (const [k, u] of Object.entries(users)) {
    const id = await ensureAuthUser(u.email, u.name);
    ids[k] = id;
    await db.user.upsert({
      where: { id },
      create: { id, email: u.email, emailVerifiedAt: now, name: u.name, isPlatformAdmin: k === 'admin' },
      update: { name: u.name, isPlatformAdmin: k === 'admin' },
    });
  }

  let restaurant = await db.restaurant.findUnique({ where: { slug: 'spice-route-cafe' } });
  if (!restaurant) {
    restaurant = await db.restaurant.create({
      data: {
        slug: 'spice-route-cafe',
        name: 'Spice Route Café',
        address: '14, Lane 6, Koregaon Park',
        city: 'Pune',
        cuisine: ['North Indian', 'Maharashtrian', 'South Indian'],
        openingHours,
        serviceChargeBp: 0,
        coverUrl: photo('1546833999-b9f581a1996d'),
        googleReviewUrl: 'https://maps.google.com',
      },
    });
    await db.wallet.create({ data: { restaurantId: restaurant.id, balancePaise: 50_000 } });
    await db.walletLedger.create({
      data: { restaurantId: restaurant.id, type: 'adjustment', amountPaise: 50_000, balanceAfterPaise: 50_000, monthKey: now.toISOString().slice(0, 7), reason: 'Welcome credit (seed)' },
    });
  }
  const rid = restaurant.id;
  for (const [k, role] of [['owner', 'owner'], ['manager', 'manager'], ['waiter', 'waiter'], ['kitchen', 'kitchen']] as const) {
    await db.membership.upsert({
      where: { userId_restaurantId: { userId: ids[k]!, restaurantId: rid } },
      create: { userId: ids[k]!, restaurantId: rid, role },
      update: { role },
    });
  }

  const hasMenu = await db.menuCategory.count({ where: { restaurantId: rid } });
  if (!hasMenu) {
    for (const [ci, cat] of MENU.entries()) {
      const c = await db.menuCategory.create({ data: { restaurantId: rid, name: cat.name, sortOrder: ci } });
      for (const [ii, it] of cat.items.entries()) {
        await db.menuItem.create({
          data: {
            restaurantId: rid,
            categoryId: c.id,
            name: it.name,
            description: it.description,
            diet: it.diet ?? 'veg',
            spiceLevel: it.spice ?? 0,
            tags: it.tags ?? [],
            jainAvailable: it.jain ?? false,
            basePricePaise: (it.variants ? Math.min(...it.variants.map((v) => v[1])) : it.price) * 100,
            taxRateBp: it.tax ?? 500,
            photoUrl: it.photo ? photo(it.photo) : null,
            available: it.available ?? true,
            sortOrder: ii,
            variants: it.variants ? { create: it.variants.map(([name, p], vi) => ({ restaurantId: rid, name, pricePaise: p * 100, sortOrder: vi })) } : undefined,
            addonGroups: it.addons
              ? {
                  create: [
                    {
                      restaurantId: rid,
                      name: it.addons.name,
                      minSelect: it.addons.min ?? 0,
                      maxSelect: it.addons.max ?? 1,
                      addons: { create: it.addons.options.map(([name, p], ai) => ({ restaurantId: rid, name, pricePaise: p * 100, sortOrder: ai })) },
                    },
                  ],
                }
              : undefined,
          },
        });
      }
    }
  }

  const tables = await db.restaurantTable.count({ where: { restaurantId: rid } });
  if (!tables) {
    const data = [
      ...Array.from({ length: 8 }, (_, i) => ({ restaurantId: rid, label: `T${i + 1}`, section: 'Main hall', sortOrder: i })),
      ...Array.from({ length: 4 }, (_, i) => ({ restaurantId: rid, label: `R${i + 1}`, section: 'Rooftop', sortOrder: 8 + i })),
    ];
    await db.restaurantTable.createMany({ data });
  }

  console.log(`Seeded restaurant ${restaurant.slug} (${rid}) and demo users.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
