import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import Admin from "../model/Admin.js";

const rl = readline.createInterface({ input: stdin, output: stdout });

try {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from .env");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const email = (await rl.question("Admin email: "))
    .trim()
    .toLowerCase();

  const password = await rl.question("Admin password (minimum 12 characters): ");

  if (!email || password.length < 12) {
    throw new Error("Enter a valid email and a password of at least 12 characters.");
  }

  const existingAdmin = await Admin.findOne({ email });

  if (existingAdmin) {
    console.log("This admin already exists. No changes made.");
  } else {
    const hashedPassword = await bcrypt.hash(password, 12);

    await Admin.create({
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log("Admin created successfully in MongoDB.");
  }
} catch (error) {
  console.error("Admin setup failed:", error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect();
}