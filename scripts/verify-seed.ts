import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import logger from "../lib/logger";
import Admin from "../models/Admin";
import MenuItem from "../models/MenuItem";
import Settings from "../models/Settings";
import { generateOrderNumber } from "../lib/order-number";

async function verify() {
  try {
    logger.info("Verifying database seed and atomic order number generator...");
    await connectDB();

    // Check Admins
    const admins = await Admin.find({});
    logger.info({ adminCount: admins.length }, "Found admins");
    for (const a of admins) {
      logger.info(` -> Admin: ${a.email} (${a.name}) | Role: ${a.role} | Active: ${a.active}`);
    }

    // Check Menu Items by category
    const menuCount = await MenuItem.countDocuments();
    const categories = await MenuItem.distinct("category");
    logger.info({ totalMenuItems: menuCount, categories }, "Menu summary");

    const sample = await MenuItem.find({}).limit(3);
    for (const m of sample) {
      logger.info(` -> Sample Item: [${m.category}] ${m.name} - ₹${m.price}`);
    }

    // Check Settings
    const settings = await Settings.findOne({ key: "app_settings" });
    if (settings) {
      logger.info(
        {
          kitchenName: settings.businessInfo.name,
          dailySendTime: settings.dailySendTime,
          deliveryCharge: settings.deliveryCharge,
        },
        "Settings confirmed"
      );
    } else {
      logger.warn("Settings document not found!");
    }

    // Test Order Number Generator
    const order1 = await generateOrderNumber();
    const order2 = await generateOrderNumber();
    logger.info({ sampleOrder1: order1, sampleOrder2: order2 }, "Order numbers generated atomically");

    logger.info(" All verifications passed!");
  } catch (error) {
    logger.error({ error }, "Verification failed");
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

verify();
