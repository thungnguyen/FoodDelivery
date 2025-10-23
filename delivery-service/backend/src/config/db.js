import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    const uri = process.env.DELIVERY_MONGO_URI || process.env.MONGO_URI;
    if (!uri) {
      throw new Error("Missing DELIVERY_MONGO_URI (or fallback MONGO_URI)");
    }

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    if (process.env.DELIVERY_DB_NAME) {
      options.dbName = process.env.DELIVERY_DB_NAME;
    }

    const conn = await mongoose.connect(uri, options);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
