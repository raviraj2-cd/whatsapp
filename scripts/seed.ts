import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import logger from "../lib/logger";
import Admin from "../models/Admin";
import MenuItem from "../models/MenuItem";
import Settings from "../models/Settings";

const sampleMenuItems = [
  // Category: Main Course
  {
    name: "Hyderabadi Dum Biryani",
    description: "Slow-cooked aromatic basmati rice layered with spiced marinated meat and herbs.",
    price: 320,
    category: "Main Course",
    imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 1,
  },
  {
    name: "Paneer Butter Masala",
    description: "Cottage cheese cubes simmered in a rich, buttery tomato-cashew gravy.",
    price: 260,
    category: "Main Course",
    imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 2,
  },
  {
    name: "Butter Chicken",
    description: "Tender chicken cooked in mildly spiced silky makhani gravy.",
    price: 340,
    category: "Main Course",
    imageUrl: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 3,
  },
  {
    name: "Dal Makhani",
    description: "Black lentils slow-cooked overnight with cream, butter, and fragrant spices.",
    price: 220,
    category: "Main Course",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 4,
  },
  // Category: Breads & Rice
  {
    name: "Garlic Butter Naan",
    description: "Tandoor baked leavened flatbread brushed with garlic and clarified butter.",
    price: 60,
    category: "Breads & Rice",
    imageUrl: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 5,
  },
  {
    name: "Tandoori Roti",
    description: "Whole wheat unleavened bread baked crisp in clay oven.",
    price: 35,
    category: "Breads & Rice",
    imageUrl: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 6,
  },
  {
    name: "Jeera Rice",
    description: "Long grain basmati rice tempered with cumin seeds and whole spices.",
    price: 150,
    category: "Breads & Rice",
    imageUrl: "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 7,
  },
  // Category: Desserts & Beverages
  {
    name: "Warm Gulab Jamun (2 pcs)",
    description: "Golden fried milk solids soaked in cardamom-infused saffron sugar syrup.",
    price: 90,
    category: "Desserts & Beverages",
    imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 8,
  },
  {
    name: "Mango Lassi",
    description: "Chilled sweet yogurt blended with Alphonso mango pulp and cardamom.",
    price: 110,
    category: "Desserts & Beverages",
    imageUrl: "https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 9,
  },
  {
    name: "Masala Chai Flask (500ml)",
    description: "Traditional brewed tea with ginger, green cardamom, and fresh whole milk.",
    price: 120,
    category: "Desserts & Beverages",
    imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop",
    available: true,
    sortOrder: 10,
  },
];

async function seed() {
  try {
    logger.info("Connecting to database for seeding...");
    await connectDB();

    // 1. Seed Menu Items
    logger.info("Seeding 10 menu items across 3 categories...");
    await MenuItem.deleteMany({});
    const insertedItems = await MenuItem.insertMany(sampleMenuItems);
    logger.info({ count: insertedItems.length }, "Menu items seeded successfully");

    // 2. Seed Owner Admin
    const email = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase().trim();
    const rawPassword = process.env.SEED_ADMIN_PASSWORD || "AdminPassword123!";
    const name = process.env.SEED_ADMIN_NAME || "System Owner";

    logger.info({ email }, "Upserting owner admin account...");
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);

    const admin = await Admin.findOneAndUpdate(
      { email },
      {
        email,
        passwordHash,
        name,
        role: "owner",
        active: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    logger.info({ adminId: admin._id, email: admin.email, role: admin.role }, "Admin account seeded");

    // 3. Seed Default Settings
    logger.info("Upserting default application settings...");
    const settings = await Settings.findOneAndUpdate(
      { key: "app_settings" },
      {
        key: "app_settings",
        dailySendTime: "09:00",
        cutoffTime: "13:00",
        deliveryCharge: 30,
        sessionTimeoutMin: 30,
        businessInfo: {
          name: "WhatsApp Gourmet Kitchen",
          address: "123 Food Street, Sector 5",
          phone: "+919876543210",
          upiId: "kitchen@upi",
        },
        flowIds: {
          menuOrder: process.env.FLOW_ID_MENU_ORDER || "",
          customOrder: process.env.FLOW_ID_CUSTOM_ORDER || "",
          viewOrder: process.env.FLOW_ID_VIEW_ORDER || "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    logger.info({ settingsKey: settings.key }, "Default settings seeded");

    logger.info("✅ Database seeding completed successfully!");
  } catch (error) {
    logger.error({ error }, "Seeding failed");
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info("Database connection closed");
    process.exit(0);
  }
}

seed();
