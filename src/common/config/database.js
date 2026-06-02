import mongoose from 'mongoose';
import { DB_URI } from './environment.js';

export const connectDB = async () => {
    try {
        if (!DB_URI) {
            throw new Error('DB_URI is not defined');
        }

        await mongoose.connect(DB_URI);
        console.log('Connected database');
    } catch (error) {
        console.error(`DB Error: ${error.message}`);
        process.exit(1);
    }
};