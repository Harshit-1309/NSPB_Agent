import { planningClient } from './src/services/oracleClient.js';

async function checkAccounts() {
  const accountsToCheck = [
    'P_10001', '10001', '10002', 'P_20000', 'NFS_Gross Profit', 'P_20200', 'NFS_Total Expenses', 'NFS_EBITDA'
  ];
  const planType = 'NSP_NFS';
  
  for (const acc of accountsToCheck) {
    try {
      const res = await planningClient.get(`/plantypes/${planType}/dimensions/Account/members/${encodeURIComponent(acc)}`);
      console.log(`✅ Account ${acc} exists: ${res.data.alias || 'No Alias'}`);
    } catch (err: any) {
      console.error(`❌ Account ${acc} NOT found:`, err.response?.data?.detail || err.message);
    }
  }
}

checkAccounts();
