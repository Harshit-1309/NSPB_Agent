import oracleClient from './src/services/oracleClient.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    const response = await oracleClient.get('/dimensions/Account/members/NFS_Income');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.error(e.response?.data || e.message);
  }
}

run();
