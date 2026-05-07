import { planningClient } from './src/services/oracleClient.js';

async function findAccountMatch() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Account`);
    const allAccounts: { name: string, alias: string }[] = [];
    
    function collect(node: any) {
      allAccounts.push({ name: node.name, alias: node.alias || '' });
      if (node.children) node.children.forEach(collect);
    }
    collect(res.data);

    const targets = ['10001', '10002', 'P_10001', 'P_20000', 'Gross Profit', 'Expenses', 'EBITDA', 'Personnel'];
    
    console.log('--- MATCHING RESULTS ---');
    targets.forEach(t => {
        const matches = allAccounts.filter(a => 
            a.name.toLowerCase().includes(t.toLowerCase()) || 
            a.alias.toLowerCase().includes(t.toLowerCase())
        );
        console.log(`\nTarget: ${t}`);
        matches.forEach(m => console.log(`  - ${m.name} (${m.alias})`));
    });

  } catch (err: any) {
    console.error('Failed:', err.response?.data || err.message);
  }
}

findAccountMatch();
