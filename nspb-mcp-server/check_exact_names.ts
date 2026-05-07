import { planningClient } from './src/services/oracleClient.js';

async function checkNames() {
  const planType = 'NSP_NFS';
  const names = ['Product', 'Tech.', 'Finance & Legal', 'Other'];
  for (const name of names) {
    try {
      const res = await planningClient.get(`/plantypes/${planType}/dimensions/Account/members/${encodeURIComponent(name)}`);
      console.log(`MATCH: ${name} -> ${res.data.name}`);
    } catch (err) {
      console.log(`FAILED: ${name}`);
    }
  }
}

checkNames();
