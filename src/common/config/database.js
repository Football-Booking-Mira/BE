import mongoose from "mongoose";
import { DB_URI } from "./enviroment.js";

export const connectDB = async () => {
  try {
    await mongoose.connect(DB_URI);
    console.log("Connected database");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};
