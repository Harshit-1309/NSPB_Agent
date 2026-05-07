import { planningClient } from './src/services/oracleClient.js';

async function checkTPs() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Period`);
    
    function collect(node: any) {
      if (node.name.startsWith('TP')) {
        console.log(`${node.name}: ${node.alias || 'No Alias'}`);
      }
      if (node.children) node.children.forEach(collect);
    }
    collect(res.data);
  } catch (err: any) {
    console.error('Failed:', err.response?.data || err.message);
  }
}

checkTPs();
