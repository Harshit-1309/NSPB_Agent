import { planningClient } from './src/services/oracleClient.js';

async function checkVerticals() {
  const planType = 'NSP_NFS';
  try {
    const res = await planningClient.get(`/plantypes/${planType}/dimensions/Vertical`);
    console.log('--- VERTICALS ---');
    function traverse(node: any) {
      console.log(`${node.name} (${node.alias || 'No Alias'})`);
      if (node.children) node.children.forEach(traverse);
    }
    traverse(res.data);
  } catch (err: any) {
    console.error('Failed:', err.message);
  }
}

checkVerticals();
