import { planningClient } from './src/services/oracleClient.js';

async function discover() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions`);
    console.log('--- DIMENSIONS ---');
    console.log(res.data.items.map((i: any) => i.name).join(', '));
  } catch (err: any) {
    console.error('Failed with /plantypes/NSP_NFS/dimensions:', err.response?.data || err.message);
    try {
        const res2 = await planningClient.get('/dimensions');
        console.log('--- DIMENSIONS (root) ---');
        console.log(res2.data.items.map((i: any) => i.name).join(', '));
    } catch (err2: any) {
        console.error('Failed with /dimensions:', err2.response?.data || err2.message);
    }
  }
}

discover();
