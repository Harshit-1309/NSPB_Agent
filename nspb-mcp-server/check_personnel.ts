import { planningClient } from './src/services/oracleClient.js';

async function checkPersonnel() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Account/members/P_20200`);
    console.log('--- PERSONNEL EXPENSES CHILDREN ---');
    if (res.data.children) {
      res.data.children.forEach((c: any) => console.log(`${c.name} (${c.alias || 'No Alias'})`));
    } else {
        console.log('No children found via members endpoint. Fetching via dimension endpoint...');
        const res2 = await planningClient.get(`/plantypes/${planType}/dimensions/Account`);
        const traverse = (node: any) => {
          if (node.name === 'P_20200' || node.name === '20200') {
             if (node.children) node.children.forEach((c: any) => console.log(`${c.name} (${c.alias || 'No Alias'})`));
          }
          if (node.children) node.children.forEach(traverse);
        };
        traverse(res2.data);
    }
  } catch (err: any) {
    console.error('Failed:', err.message);
  }
}

checkPersonnel();
