import dotenv from 'dotenv';

dotenv.config({});

export const { HOST, DB_URI, PORT } = process.env;
